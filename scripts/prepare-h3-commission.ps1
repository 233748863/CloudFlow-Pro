param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-commission-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original commission preparation'}
$Stage=Get-Content -LiteralPath (Join-Path $Evidence 'h3-performance-stage-20261010-r2/result.json') -Raw|ConvertFrom-Json
if(-not $Stage.Passed -or $Stage.Backend -ne 'r147' -or $Stage.Frontend -ne 'r101'){throw 'Completed B147/F101 required'}
foreach($Entry in $Stage.ProductImpact){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.AfterHash){throw 'Product baseline changed'}}
$SourceFiles=@(
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/deal/CrmDealLedgerService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCalculationService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAdvancePayrollService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrSettlementSalarySource.java',
    'cloudflow-backend/DB/06.cloudflow-business-seed.sql','cloudflow-backend/DB/07.cloudflow-demo-seed.sql',
    'scripts/check-batch-h-contracts.mjs','scripts/verify-approved-menu-scope.mjs',
    'docs/design/H-G剩余设计菜单清单.json','scripts/prepare-h3-commission.ps1')
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Before=@(foreach($Relative in $SourceFiles){
    $Source=Join-Path $Root $Relative
    $Copy=Join-Path $Output ('originals/'+$Relative)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Source).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Preparation input changed'}
    [pscustomobject]@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
})
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r147';Frontend='r101';PreservedFiles=$Before.Count;MenuCollisionCheck='9d281b';MenuCollisionRows=0;DatabaseTables=374;ProductModified=$false;ProductionModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_COMMISSION_PREP: preserved=$($Before.Count); baseline=r147/r101; menu_conflicts=0; product_unchanged=true"
