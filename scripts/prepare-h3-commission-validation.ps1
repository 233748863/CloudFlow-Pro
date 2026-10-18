param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Output=Join-Path $Root ".cloudflow-runtime/full-prd-20260915/approved-runtime/h3-commission-validation-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original commission review inputs'}
$Paths=@(
    'scripts/hr-checks/HrSettlementSalarySourceChecks.java',
    'scripts/hr-checks/HrSettlementReservationChecks.java',
    'scripts/hr-checks/HrAdvanceLedgerChecks.java',
    'scripts/hr-checks/HrPayrollReplayChecks.java',
    'scripts/hr-checks/HrPayrollGenerationResumeChecks.java',
    'scripts/verify-hr-advance-ledger.ps1',
    'scripts/run-portal-finance-build.ps1',
    'scripts/run-h3-performance-independent.ps1',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCalculationService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAdvancePayrollService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrSettlementSalarySource.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/deal/CrmDealLedgerService.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmDealAllocationController.java',
    'cloudflow-frontend/src/pages/crm/CrmDealAllocationPage.tsx',
    'cloudflow-frontend/src/services/api/crm/commission.ts',
    'docs/design/H3-提成核定与工资接线实施记录-20261010.md',
    'scripts/prepare-h3-commission-validation.ps1')
$Paths+=@(rg --files cloudflow-backend | Where-Object{$_ -match 'Commission[^\\/]*\.(java|xml)$'})
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Before=@(foreach($Relative in @($Paths|Sort-Object -Unique)){
    $Source=[IO.Path]::GetFullPath($Relative,$Root)
    if(-not $Source.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Review source outside workspace'}
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Source).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Review source changed during preservation'}
    [pscustomobject]@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
})
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;PreservedFiles=$Before.Count;BaselineBackend='r147';BaselineFrontend='r101';ProductValidated=$false;RuntimeModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_COMMISSION_REVIEW_PREP: files=$($Before.Count); existing_runtime=r147/r101; commission_validated=false"
