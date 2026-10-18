param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-performance-validation-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier query validation preparation'}
$Sources=@('cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrCrmPerformanceController.java',
    'cloudflow-backend/cloudflow-service-hr/target/classes/com/cloudflow/hr/controller/HrCrmPerformanceController.class',
    'scripts/hr-checks/HrCrmPerformanceAvailabilityChecks.java','scripts/runtime-checks/h3-performance-business.mjs',
    $PSCommandPath,(Join-Path $Evidence 'h3-performance-independent-20261010-r3/result.json'),
    (Join-Path $Evidence 'h3-performance-independent-20261010-r3/launcher-result.json'))
foreach($Build in @('backend-r146','frontend-r101')){
    $Manifest=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    foreach($Entry in @(Get-Content -LiteralPath $Manifest -Raw|ConvertFrom-Json)){
        if((Get-FileHash -LiteralPath ([IO.Path]::GetFullPath($Entry.Path,$Root))).Hash -ne $Entry.Hash){throw 'Product changed after verified R3'}
    }
    $Sources+=$Manifest
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'))
$Originals=@(foreach($Relative in $Sources){
    $Source=[IO.Path]::GetFullPath($Relative,$Root)
    if(-not $Source.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or (Get-Item -LiteralPath $Source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Owned original source required'}
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Source).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Original source changed during preservation'}
    [pscustomobject]@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
})
$Originals|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Report=Get-Content -LiteralPath (Join-Path $Evidence 'h3-performance-independent-20261010-r3/result.json') -Raw|ConvertFrom-Json
$Rejected=@($Report.requests|Where-Object{$_.actor -eq 'admin' -and $_.path -like '/hr/performance/crm/*' -and $_.code -eq 503})
if($Rejected.Count -ne 7){throw 'Actual invalid-query reproduction changed'}
[pscustomobject]@{Passed=$true;Preserved=$Originals.Count;BaselineBackend='r146';Frontend='r101';PlannedBackend='r147';ActualInvalidQueries=$Rejected;ProductModified=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_QUERY_VALIDATION_PREP: preserved=$($Originals.Count); actual_invalid_queries=$($Rejected.Count); product_modified=false"
