param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-appraisals-rules-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original appraisal rule evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Sources=@('cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/utils/RestrictedExpression.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAppraisalRules.java',
    'scripts/hr-checks/HrAppraisalRuleChecks.java')
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r114-inputs.json') -Raw|ConvertFrom-Json)
$Inputs+=@($Sources+@('scripts/run-h2-appraisals-rules.ps1')|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Appraisal rules differ from B114 inputs'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $Sources){Copy-Item -LiteralPath (Join-Path $Root $Source) -Destination (Join-Path $Output (Split-Path -Leaf $Source))}
$Classes=Join-Path $Output 'classes'
[IO.Directory]::CreateDirectory($Classes)|Out-Null
Push-Location $Root
try {
    & javac -encoding UTF-8 -d $Classes @Sources *> (Join-Path $Output 'compile.log')
    if($LASTEXITCODE -ne 0){throw 'Appraisal rule compilation failed'}
    & java -cp $Classes com.cloudflow.hr.checks.HrAppraisalRuleChecks *> (Join-Path $Output 'rules.log')
    if($LASTEXITCODE -ne 0){throw 'Appraisal rule execution failed'}
    Assert-Inputs
    $Log=Get-Content -LiteralPath (Join-Path $Output 'rules.log') -Raw
    if($Log -notmatch 'H2_APPRAISAL_RULE_CHECKS: checks=(\d+); failed=0; arithmetic=true; largest_remainder=true; database=false; http=false'){throw 'Appraisal rule scope incomplete'}
    $Checks=[int]$Matches[1]
    [pscustomobject]@{passed=$true;backend='r114';checks=$Checks;inputs=$Inputs.Count;inputChanges=0;database=$false;http=$false;productModified=$false;globalComplete=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "H2_APPRAISAL_RULES_RUN: checks=$Checks; inputs=$($Inputs.Count); changed=0; database=false; http=false; exit=0"
} finally {Pop-Location}
