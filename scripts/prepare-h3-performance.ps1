param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-performance-prep-20261010-$Round"
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier H3 performance preparation'}
$E5Result=Join-Path $Evidence 'e5-all-acceptance-20261010-r1/result.json'
$Previous=Get-Content -LiteralPath $E5Result -Raw|ConvertFrom-Json
if(-not $Previous.Passed -or -not $Previous.All21Complete){throw 'Complete E5 verification required before H3 changes'}
$Paths=@(
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmPerformanceInnerController.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrCrmPerformanceController.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/client/CrmPerformanceClient.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/ICrmPerformanceQueryService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/client/fallback/CrmPerformanceClientFallback.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/vo/CrmPerformanceSummaryVO.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/client/vo/CrmPerformanceSummaryVO.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/vo/CrmPerformanceAggregateRow.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/mapper/CrmPerformanceAggregateMapper.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmPerformanceQueryServiceImpl.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmPerformanceAggregateMapper.xml',
    'cloudflow-frontend/src/pages/hr/HrPerformancePage.tsx',
    'cloudflow-frontend/src/services/api/hr/types.ts',
    'scripts/crm-checks/CrmOperationsDatabaseChecks.java',
    'scripts/crm-checks/CrmPerformanceDatabaseChecks.java',
    'scripts/hr-checks/HrCrmPerformanceAvailabilityChecks.java',
    'scripts/verify-crm-performance-availability-ui.mjs'
)
$Paths+=@($PSCommandPath,$E5Result,
    (Join-Path $Evidence 'e5-terminal-receipts-20261010-r1.json'),
    (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1'),
    (Join-Path $Reference 'state.json'),
    'docs/design/H3-跨月赢单冲减统计补充-20261002.md',
    'docs/design/H3-全项验收映射-20261002.md',
    'docs/design/H3-客户增强设计确认稿.md',
    'docs/design/全量PRD验收索引-20261001.md')
foreach($Build in @('backend-r145','frontend-r97')){
    $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    $Paths+=$BuildPath
    foreach($Entry in @(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)){
        $Path=[IO.Path]::GetFullPath($Entry.Path,$Root)
        if((Get-FileHash -LiteralPath $Path).Hash -ne $Entry.Hash){throw 'Product differs from completed E5 build'}
    }
}
foreach($Service in @('auth','gateway','oa','crm','workflow','hr')){
    $Paths+=@((Join-Path $Reference "$Service/service.args"),(Join-Path $Reference "$Service/integration.properties"))
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath $Reference)
$NewFiles=[Collections.Generic.List[string]]::new()
$Originals=@(foreach($Source in @($Paths|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique)){
    if(-not $Source.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Preparation source outside workspace'}
    if(-not (Test-Path -LiteralPath $Source -PathType Leaf)){$NewFiles.Add($Source);continue}
    if((Get-Item -LiteralPath $Source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected preparation source rejected'}
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Source).Hash -ne $Hash){throw 'H3 source changed during preservation'}
    [pscustomobject]@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
})
$Originals|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Preserved=$Originals.Count;NewFiles=@($NewFiles.ToArray());Backend='r145';Frontend='r97';ProductModified=$false;ProductionModified=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_PERFORMANCE_PREPARATION: passed=true; preserved=$($Originals.Count); new_files=$($NewFiles.Count); product_modified=false; production_modified=false"
