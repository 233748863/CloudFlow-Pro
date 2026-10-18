param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d4-hr-checks-20261006-$Round"
$Sources=@('scripts/hr-checks/HrContactCapacityDatabaseChecks.java','scripts/hr-checks/HrEmployeeOnboardingChecks.java',
    'scripts/hr-checks/HrLifecycleHandoverChecks.java','scripts/hr-checks/HrReferralIdentityChecks.java',
    'scripts/hr-checks/HrRuleDatabaseChecks.java','scripts/hr-checks/HrRulePrecisionChecks.java',
    'scripts/hr-checks/HrSkillChecks.java','scripts/hr-checks/HrTypedDeleteChecks.java',
    'scripts/platform-checks/HolidayDatabaseChecks.java','scripts/platform-checks/HolidayRedisFixture.java',
    'scripts/hr-checks/HrDisputeReadScopeChecks.java')
if(Test-Path -LiteralPath $Output){throw 'Retain original HR check evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r109-inputs.json') -Raw|ConvertFrom-Json)
foreach($File in @('scripts/run-d4-hr-checks.ps1','scripts/verify-batch-d.ps1')+$Sources){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'HR check input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original-run-d4-hr-checks.ps1'),$false)
$OriginalArguments=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/batch-d-checks/compile.args'
$Arguments=[IO.File]::ReadAllLines($OriginalArguments)
$ClasspathIndex=[Array]::IndexOf($Arguments,'-cp')+1
$OutputIndex=[Array]::IndexOf($Arguments,'-d')+1
if($ClasspathIndex -lt 1 -or $OutputIndex -lt 1){throw 'Existing batch D compiler arguments required'}
$Companions=@('cloudflow-auth','cloudflow-service-oa','cloudflow-service-workflow')|ForEach-Object{
    $Path=Join-Path $Root "cloudflow-backend/$_/target/classes"
    if(-not (Test-Path -LiteralPath $Path)){throw 'Build companion modules before cross-module checks'}
    $Path
}
$Classpath=($Companions -join [IO.Path]::PathSeparator)+[IO.Path]::PathSeparator+$Arguments[$ClasspathIndex].Trim('"')
$Arguments[$ClasspathIndex]='"'+$Classpath.Replace('\','/')+'"'
$Arguments[$OutputIndex]='"'+$Output.Replace('\','/')+'"'
$Arguments=@($Arguments|Where-Object {$_ -notmatch '\.java"$'})+@($Sources|ForEach-Object{'"'+(Join-Path $Root $_).Replace('\','/')+'"'})
[IO.File]::WriteAllLines((Join-Path $Output 'compile.args'),$Arguments,[Text.UTF8Encoding]::new($false))
& javac "@$(Join-Path $Output 'compile.args')" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Cross-module HR compilation failed; retain diagnostics'}
$RunArguments=@('-cp',('"'+($Output+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'com.cloudflow.hr.service.HrRulePrecisionChecks')
[IO.File]::WriteAllLines((Join-Path $Output 'run.args'),$RunArguments,[Text.UTF8Encoding]::new($false))
& java "@$(Join-Path $Output 'run.args')" *> (Join-Path $Output 'live.log')
$RunExit=$LASTEXITCODE
Assert-Inputs
Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^PASS:'}
[pscustomobject]@{passed=($RunExit -eq 0);exit=$RunExit;inputs=$Inputs.Count;inputChanges=0;companionModules=3;compiledSources=$Sources;allHrChecks=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
if($RunExit -ne 0){throw 'HR precision checks failed; retain diagnostics'}
'D4_HR_CHECKS_EXIT=0'
