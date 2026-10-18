param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r114',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r73')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='h2-overtime-current-20261006'
$Log=Join-Path $Evidence "$Prefix-http-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-$Round.json"
$ResultPath=Join-Path $Evidence "$Prefix-result-$Round.json"
$OriginalDirectory=Join-Path $Evidence "$Prefix-originals-$Round"
foreach($File in @($Log,$InputPath,$ResultPath,$OriginalDirectory)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        foreach($Item in $Snapshot){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from verified build'}}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $ExecutionSources=@(rg --files scripts -g '*.mjs') + @('scripts/run-h2-overtime-current.ps1','scripts/owned-layered-artifact.ps1')
    $Paths=@($ExecutionSources)
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
        $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
        $Paths+=$BuildPath
        $Paths+=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json|ForEach-Object Path)
    }
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args";Join-Path $Run "$($_.name)/integration.properties"})
    . (Join-Path $Root 'scripts/owned-layered-artifact.ps1')
    $LayeredDirectories=@{}; $LayeredFiles=0
    foreach($Service in $State.services){
        $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
        $JarMarkers=@(0..($Arguments.Count-1)|Where-Object{$Arguments[$_] -eq '-jar'})
        $ClassMarkers=@(0..($Arguments.Count-1)|Where-Object{$Arguments[$_] -eq '-cp'})
        $ArtifactDirectory=Join-Path $Run "$($Service.name)/artifacts"
        if($JarMarkers.Count -eq 1 -and $JarMarkers[0]+1 -lt $Arguments.Count){
            $JarPath=[IO.Path]::GetFullPath($Arguments[$JarMarkers[0]+1].Trim('"'))
            if((Split-Path -Parent $JarPath) -ne $ArtifactDirectory -or (Split-Path -Leaf $JarPath) -notmatch '^([a-f0-9]{64})\.jar$'){throw 'Owned immutable executable package required'}
            if((Get-FileHash -LiteralPath $JarPath).Hash -ne $Matches[1]){throw 'Executable package content differs'}
            $Paths+=$JarPath
        }elseif($JarMarkers.Count -eq 0 -and $ClassMarkers.Count -eq 1 -and $ClassMarkers[0]+2 -lt $Arguments.Count -and $Arguments[$ClassMarkers[0]+2] -eq 'org.springframework.boot.loader.launch.JarLauncher'){
            $LayeredPath=[IO.Path]::GetFullPath($Arguments[$ClassMarkers[0]+1].Trim('"'))
            if((Split-Path -Parent $LayeredPath) -ne $ArtifactDirectory -or (Split-Path -Leaf $LayeredPath) -notmatch '^([a-f0-9]{64})-layered$' -or -not (Test-Path -LiteralPath $LayeredPath -PathType Container)){throw 'Existing owned layered package required'}
            $PackageHash=$Matches[1]; $JarPath=Join-Path $ArtifactDirectory ($PackageHash+'.jar')
            $Proof=Get-OwnedLayeredArtifact -JarPath $JarPath -ArtifactDirectory $ArtifactDirectory -ExpectedHash $PackageHash
            if($Proof.Path -ne $LayeredPath){throw 'Actual layered launch differs from source package'}
            $Paths+=@($JarPath,($LayeredPath+'.json'))
            $Paths+=@($Proof.Files|ForEach-Object{Join-Path $LayeredPath $_.Path})
            $LayeredDirectories[$LayeredPath]=$Proof.Files.Count; $LayeredFiles+=$Proof.Files.Count
        }else{throw 'Actual immutable executable or layered launch required'}
    }
    $Inputs=@($Paths|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8NoBOM
    foreach($Source in $ExecutionSources){
        $Original=Join-Path $OriginalDirectory $Source
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Original))|Out-Null
        [IO.File]::Copy((Join-Path $Root $Source),$Original,$false)
    }
    $Options=@('--settlement-schema','--hr-overtime-only')
    & node scripts/verify-batch-g-integration.mjs $StatePath @Options *> $Log
    $Result=$LASTEXITCODE
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Overtime verification input changed'}}
    foreach($Directory in $LayeredDirectories.Keys){
        $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
        if(@($Files|Where-Object{-not $_.PSIsContainer}).Count -ne $LayeredDirectories[$Directory] -or @($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Layered runtime file set changed'}
    }
    Assert-ProductInputs
    "H2_OVERTIME_CURRENT_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |H2_OVERTIME_)'}|Select-Object -Last 8
    if($Result -ne 0){throw 'Overtime verification failed; evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach($Pattern in @('H2_OVERTIME_REAL_RESULT: checks=[1-9][0-9]*; failed=0;', '"restoration":true','"secrets":true','"kept":true','"desktop":true','"mobile":true','"lostResponse":true','"compLeave":\{"passed":true','"limits":\{"passed":true','"shiftSafety":true','"adjacentAttendance":\{"passed":true','"payroll":\{"passed":true','"payrollAttendanceValidation":true','"confirmedAttendance":\{"passed":true','"periodResolution":\{"passed":true','"legacyPeriodStatusInputs":1','"leaks":0','"databaseLeaks":0')){
        if($Content -notmatch $Pattern){throw 'Overtime verification evidence missing'}
    }
    if($Content -notmatch '"resolutionUiExecuted":true'){throw 'Real period resolution page submissions missing'}
    if($Content -notmatch '"payrollPeriodResolution":\{"passed":true'){throw 'Real closed payroll-period correction missing'}
    if($Content -notmatch '"afterPayment":true'){throw 'Real payroll-period correction page result missing'}
    if($Content -notmatch '"shiftRollback":\{"passed":true,"restored":true'){throw 'Real shift rollback and restoration missing'}
    $UiMatch=[regex]::Match($Content,'H2_OVERTIME_UI_EVIDENCE=(.+h2-overtime-ui-([a-f0-9]{12}))')
    if(-not $UiMatch.Success){throw 'Overtime image evidence missing'}
    $Marker=$UiMatch.Groups[2].Value
    $Journal=Join-Path $Run "private/recovery/h2ot-$Marker.jsonl"
    $JournalEvents=@(Get-Content -LiteralPath $Journal|ForEach-Object{$_|ConvertFrom-Json})
    if($JournalEvents[0].event -ne 'original' -or $JournalEvents[-1].event -ne 'restored'){throw 'Overtime recovery journal incomplete'}
    $ResultMatch=[regex]::Match($Content,'H2_OVERTIME_REAL_RESULT: checks=([0-9]+); failed=0; requests=([0-9]+);')
    if(-not $ResultMatch.Success){throw 'Overtime successful result missing'}
    [pscustomobject]@{Passed=$true;BackendRound=$BackendRound;FrontendRound=$FrontendRound;Marker=$Marker;
        Checks=[int]$ResultMatch.Groups[1].Value;Requests=[int]$ResultMatch.Groups[2].Value;Inputs=$Inputs.Count;InputChanges=0;
        LayeredFiles=$LayeredFiles;ExecutionOriginals=$ExecutionSources.Count;RecoveryJournal=$Journal;BusinessTables=44;
        ImageDirectory=$UiMatch.Groups[1].Value.Trim();ProductModified=$false;GlobalComplete=$false
    }|ConvertTo-Json|Set-Content -LiteralPath $ResultPath -Encoding utf8NoBOM
    'H2_OVERTIME_CURRENT_RUN_EXIT=0'
} finally {Pop-Location}
