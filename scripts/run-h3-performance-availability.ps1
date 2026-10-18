param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r146',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r98')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-performance-availability-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier availability evidence'}
$Paths=@($PSCommandPath,'scripts/verify-crm-performance-availability.ps1','scripts/verify-crm-performance-availability-ui.mjs',
    'scripts/hr-checks/HrCrmPerformanceAvailabilityChecks.java','scripts/hr-checks/HrCrmPerformanceAvailabilityCheck.tsx',
    '.cloudflow-runtime/use-data-drive.ps1')
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    $Paths+=$BuildPath
    foreach($Entry in @(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)){
        $Path=[IO.Path]::GetFullPath($Entry.Path,$Root)
        if((Get-FileHash -LiteralPath $Path).Hash -ne $Entry.Hash){throw 'Current product differs from verified build'}
        $Paths+=$Path
    }
}
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$DependencyFile=Join-Path $Module 'target/batch-d-classpath.txt'
$Paths+=$DependencyFile
$Dependencies=([IO.File]::ReadAllText($DependencyFile)).Trim()
$RuntimePaths=@(foreach($Dependency in $Dependencies.Split([IO.Path]::PathSeparator)){
    $Path=[IO.Path]::GetFullPath($Dependency)
    if(-not ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase))){throw 'Regenerate HR verification dependencies on the approved data drive'}
    if(Test-Path -LiteralPath $Path -PathType Container){Get-ChildItem -LiteralPath $Path -Recurse -File|ForEach-Object{$_.FullName}}else{$Path}
})+
    @(Get-ChildItem -LiteralPath (Join-Path $Module 'target/classes') -Recurse -File|ForEach-Object{$_.FullName})
[IO.Directory]::CreateDirectory($Output)|Out-Null
function Snapshot([string[]]$Files){
    return @(foreach($Path in @($Files|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique)){
        [pscustomobject]@{Path=$Path;Hash=(Get-FileHash -LiteralPath $Path).Hash}
    })
}
$Inputs=Snapshot $Paths
$RuntimeInputs=Snapshot $RuntimePaths
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'runtime-inputs.json') -Encoding utf8NoBOM
$Exit=0;$FailureType=$null
try {
    & (Join-Path $Root 'scripts/verify-crm-performance-availability.ps1') -SkipBuild *> (Join-Path $Output 'java.log')
    if($LASTEXITCODE -ne 0){throw 'Availability Java checks failed'}
    & node scripts/verify-crm-performance-availability-ui.mjs *> (Join-Path $Output 'ui.log')
    if($LASTEXITCODE -ne 0){throw 'Availability UI checks failed'}
} catch {$Exit=1;$FailureType=$_.Exception.GetType().Name}
$Changes=@(@($Inputs)+@($RuntimeInputs)|Where-Object{-not (Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count
$JavaLog=if(Test-Path -LiteralPath (Join-Path $Output 'java.log')){[IO.File]::ReadAllText((Join-Path $Output 'java.log'))}else{''}
$UiLog=if(Test-Path -LiteralPath (Join-Path $Output 'ui.log')){[IO.File]::ReadAllText((Join-Path $Output 'ui.log'))}else{''}
$UiMatch=[regex]::Match($UiLog,'(?m)^AVAILABILITY_UI_EVIDENCE=(.+)$')
$UiDirectory=if($UiMatch.Success){$UiMatch.Groups[1].Value.Trim()}else{$null}
$UiResult=if($UiDirectory -and (Test-Path -LiteralPath (Join-Path $UiDirectory 'result.json'))){Get-Content -LiteralPath (Join-Path $UiDirectory 'result.json') -Raw|ConvertFrom-Json}else{$null}
$Passed=$Exit -eq 0 -and $Changes -eq 0 -and $UiResult -and -not $UiResult.failure -and $UiResult.errors.Count -eq 0
$Compiled=Join-Path $Module 'target/hr-crm-availability-checks'
foreach($Source in @($Inputs.Path|Where-Object{$_.StartsWith((Join-Path $Root 'scripts')+'\')})+@(Get-ChildItem -LiteralPath $Compiled -Recurse -File|ForEach-Object{$_.FullName})){
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Source,$Copy,$false)
}
$Summary=[pscustomobject]@{Passed=[bool]$Passed;Backend=$BackendRound;Frontend=$FrontendRound;Exit=$Exit;FailureType=$FailureType;Inputs=$Inputs.Count;RuntimeInputs=$RuntimeInputs.Count;InputChanges=$Changes;UiChecks=$UiResult.checks.Count;UiDirectory=$UiDirectory;ApiDoubles=$true;BackendHttp=$false;Database=$false;ProductModified=$false;ProductionModified=$false}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
Get-Content -LiteralPath (Join-Path $Output 'java.log')|Where-Object{$_ -match '^H3_.*:|^HR_.*:'}
"H3_PERFORMANCE_AVAILABILITY: passed=$Passed; ui_checks=$($UiResult.checks.Count); inputs=$($Inputs.Count); runtime_inputs=$($RuntimeInputs.Count); changes=$Changes; api_doubles=true; real_http=false"
if(-not $Passed){throw 'H3 availability verification failed; retain original evidence'}
