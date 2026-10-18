param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r9',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PrivacyRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AppealsRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r115',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r75',
    [ValidateSet('RulesPrivacyAppeals','PagesAndScale','PagesOnly','DailyAndMonthPages')][string]$Scope='RulesPrivacyAppeals',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ScaleRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ConfigRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PageRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MonthPageRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PageSourceRound='r22')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d2-current-adjacent-20261007-$Round"
$InputPath=Join-Path $Output 'inputs.json'
$OriginalDirectory=Join-Path $Output 'originals'
$Tasks=@(
    [pscustomobject]@{Name='rules';Round=$RulesRound;Prefix='d2-rules-live';Allowance='scripts/run-d2-owned-captcha-allowance.mjs';Mode='d2-rules';Flags=@('configuration','rules','rawFacts','recalculation','calendar','geofence','preservation','secrets')},
    [pscustomobject]@{Name='privacy';Round=$PrivacyRound;Prefix='d2-attendance-privacy';Allowance='scripts/run-d2-attendance-privacy-allowance.mjs';Mode='d2-attendance-privacy';Flags=@('correctness','selfEntry','geofence','scope','tenant','anonymous','preservation','restoration','secrets')},
    [pscustomobject]@{Name='appeals';Round=$AppealsRound;Prefix='d2-attendance-appeals';Allowance='scripts/run-d2-attendance-appeals-allowance.mjs';Mode='d2-attendance-appeals';Flags=@('correctness','approval','appendOnly','rollback','closedMonth','preservation','restoration','secrets')}
)
$TaskRunners=@('scripts/run-d2-rules-live.ps1','scripts/run-d2-attendance-privacy.ps1','scripts/run-d2-attendance-appeals.ps1')
if($Scope -ne 'RulesPrivacyAppeals'){
    $Tasks=@(
        [pscustomobject]@{Name='scale';Round=$ScaleRound;Prefix='d2-scale-attendance';Allowance='scripts/run-d2-scale-attendance-allowance.mjs';Mode='d2-scale-attendance';Flags=@('correctness','asynchronous','results','ownership','preservation','secrets')},
        [pscustomobject]@{Name='config';Round=$ConfigRound;Prefix='d2-attendance-config';Allowance='scripts/run-d2-attendance-config-allowance.mjs';Mode='d2-attendance-config';Flags=@('shifts','rules','schedules','punches','preview','preservation','secrets')},
        [pscustomobject]@{Name='page';Round=$PageRound;Prefix='d2-attendance-page';Allowance='scripts/run-d2-attendance-page-allowance.mjs';Mode='d2-attendance-page';Flags=@('page','pagination','confirmation','correctness','preservation','secrets')},
        [pscustomobject]@{Name='month';Round=$MonthPageRound;Prefix='d2-month-appeal-page';Allowance='scripts/run-d2-month-appeal-page-allowance.mjs';Mode='d2-month-appeal-page';Flags=@('monthly','employeeSubmit','reviews','cancel','closedMonth','preservation','restoration','secrets')}
    )
    $TaskRunners=@('scripts/run-d2-scale-attendance.ps1','scripts/run-d2-attendance-config.ps1','scripts/run-d2-attendance-page.ps1','scripts/run-d2-month-appeal-page.ps1')
    if($Scope -eq 'PagesOnly'){$Tasks=@($Tasks|Where-Object Name -ne 'scale')}
    if($Scope -eq 'DailyAndMonthPages'){$Tasks=@($Tasks|Where-Object Name -in @('page','month'))}
}
foreach($Target in @($Output)+@($Tasks|ForEach-Object{
    Join-Path $Evidence "$($_.Prefix)-20261005-$($_.Round)"
    Join-Path $Evidence "owned-captcha-$($_.Mode)-20261005-$($_.Round).json"
})){if(Test-Path -LiteralPath $Target){throw 'Retain existing current D2 evidence'}}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
        foreach($Item in @(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)){
            if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from verified build'}
        }
    }
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Push-Location $Root
try {
    Assert-ProductInputs
    $ExecutionSources=@(rg --files scripts -g '*.mjs') + @('scripts/run-d2-current-adjacent.ps1','scripts/owned-layered-artifact.ps1') + $TaskRunners
    $Paths=@($ExecutionSources)
    if($Scope -ne 'RulesPrivacyAppeals'){
        $PageSource=Join-Path $Evidence "d2-leave-attendance-20261005-$PageSourceRound"
        foreach($Name in @('fixture.json','result.json','inputs.json','original-verify-d2-leave-attendance.mjs','original-run-d2-leave-attendance.ps1','original-run-d2-leave-attendance-allowance.mjs')){$Paths+=Join-Path $PageSource $Name}
    }
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
        $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
        $Paths+=$BuildPath
        $Paths+=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json|ForEach-Object Path)
    }
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args";Join-Path $Run "$($_.name)/integration.properties"})
    foreach($Service in $State.services){
        foreach($Setting in @(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/integration.properties")|Where-Object{$_ -like 'spring.redis.redisson.file=file:*'})){
            $Config=[IO.Path]::GetFullPath($Setting.Substring('spring.redis.redisson.file=file:'.Length))
            if(-not $Config.StartsWith($Run+'\private\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned Redis configuration required'}
            $Paths+=$Config
        }
    }
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
        $BuiltPackage=Join-Path $Root "cloudflow-backend/$($Service.module)/target/$($Service.module)-1.0.0.jar"
        if((Get-FileHash -LiteralPath $BuiltPackage).Hash -ne (Get-FileHash -LiteralPath $JarPath).Hash){throw 'Running package differs from build package'}
        $Paths+=$BuiltPackage
    }
    $Inputs=@($Paths|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8NoBOM
    foreach($Source in $ExecutionSources){
        $Original=Join-Path $OriginalDirectory $Source
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Original))|Out-Null
        [IO.File]::Copy((Join-Path $Root $Source),$Original,$false)
    }

    function Assert-CurrentInputs {
        foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Current D2 input changed'}}
        foreach($Directory in $LayeredDirectories.Keys){
            $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
            if(@($Files|Where-Object{-not $_.PSIsContainer}).Count -ne $LayeredDirectories[$Directory] -or @($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Current D2 layered file set changed'}
        }
    }
    $InputByPath=@{}
    foreach($Item in $Inputs){
        if($InputByPath.ContainsKey($Item.Path)){throw 'Duplicate current input path'}
        $InputByPath[$Item.Path]=$Item.Hash
    }
    $Steps=@();$Failure=$null;$Preserved=$false
    try {
        foreach($Task in $Tasks){
            if($Steps.Count -gt 0){
                'D2_CURRENT_LOGIN_WINDOW: wait_seconds=60; counter_writes=0'
                Start-Sleep -Seconds 60
            }
            $Log=Join-Path $Output ($Task.Name+'.log')
            $TaskArguments=@($Task.Round,$BackendRound,$FrontendRound)
            if($Task.Name -eq 'page'){$TaskArguments+=$PageSourceRound}
            & node $Task.Allowance @TaskArguments *> $Log
            $Code=$LASTEXITCODE
            Assert-CurrentInputs
            $ResultPath=Join-Path $Evidence "$($Task.Prefix)-20261005-$($Task.Round)/result.json"
            $Actual=if(Test-Path -LiteralPath $ResultPath){Get-Content -LiteralPath $ResultPath -Raw|ConvertFrom-Json}else{$null}
            $Content=Get-Content -LiteralPath $Log -Raw
            $Restored=$Content -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false'
            $CaptchaBefore=if($Restored){[int]$Matches[1]}else{$null}
            $CaptchaAfter=if($Restored){[int]$Matches[2]}else{$null}
            $Step=[pscustomobject]@{Name=$Task.Name;Round=$Task.Round;Exit=$Code;Passed=($null -ne $Actual -and $Actual.passed);
                Checks=$Actual.checks.Count;Requests=$Actual.requests;Result=$ResultPath;ResultHash=if($Actual){(Get-FileHash -LiteralPath $ResultPath).Hash}else{$null};
                CaptchaRestored=$Restored;CaptchaBefore=$CaptchaBefore;CaptchaAfter=$CaptchaAfter;Flags=$Task.Flags}
            $Steps+=$Step
            $Steps|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'steps.json') -Encoding utf8NoBOM
            if($Code -ne 0 -or -not $Step.Passed -or -not $Restored){throw ('Current D2 stage failed: '+$Task.Name)}
            foreach($Flag in $Task.Flags){if($Actual.$Flag -ne $true){throw ('Current D2 required outcome missing: '+$Task.Name+'/'+$Flag)}}
            if($Actual.all17Complete -or $Actual.globalComplete){throw 'Individual stage must retain overall boundary'}
            foreach($Item in @(Get-Content -LiteralPath (Join-Path (Split-Path -Parent $ResultPath) 'inputs.json') -Raw|ConvertFrom-Json)){
                $File=[IO.Path]::GetFullPath($Item.Path,$Root)
                if(-not $InputByPath.ContainsKey($File) -or $InputByPath[$File] -ne $Item.Hash){throw 'Inner D2 input not covered by current complete snapshot'}
            }
            "D2_CURRENT_ADJACENT_STEP: name=$($Task.Name); round=$($Task.Round); checks=$($Step.Checks); requests=$($Step.Requests); exit=0; captcha_restored=true"
        }
    } catch {$Failure=$_}
    finally {
        try{Assert-CurrentInputs;Assert-ProductInputs;$Preserved=$true}catch{if(-not $Failure){$Failure=$_}}
        [pscustomobject]@{Passed=($null -eq $Failure -and $Steps.Count -eq $Tasks.Count);Backend=$BackendRound;Frontend=$FrontendRound;Scope=$Scope;Steps=$Steps;
            Inputs=$Inputs.Count;InputsPreserved=$Preserved;ExecutionOriginals=$ExecutionSources.Count;LayeredFiles=$LayeredFiles;
            OriginalPackagesPreserved=$Preserved;ProductModified=$false;ActualServices=$true;StepsRunSerially=$true;
            FirstRequestPerformanceMeasured=$false;AllD2Complete=$false;GlobalComplete=$false
        }|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    }
    if($Failure){throw $Failure}
    "D2_CURRENT_ADJACENT: steps=$($Tasks.Count); inputs=$($Inputs.Count); originals=$($ExecutionSources.Count); layered_files=$LayeredFiles; changed=0; exit=0; all_d2_complete=false; global_complete=false"
} finally {Pop-Location}
