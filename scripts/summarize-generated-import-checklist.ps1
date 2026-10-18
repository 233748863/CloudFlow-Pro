param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='h5-generated-import-20261002'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach ($Pattern in $Patterns) { if ($Content -notmatch $Pattern) { throw "Missing evidence: $File" } }
    "GENERATED_IMPORT_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'h5-contract-capacity-20261002-checklist-r1.log' @('H5_CONTRACT_CAPACITY_CHECKLIST: items=14; missing=0')
Require-Markers "$Prefix-install-r1.log" @('BUILD SUCCESS','BACKEND_INPUTS: files=3777; changes=0; exit=0','\[static-rules\] no findings')
Require-Markers "$Prefix-checks-r1.log" @('IMPORT_CAPACITY_SUITE: groups=4; failed=0','checks=169','IMPORT_VERIFICATION_INPUTS: files=8; changed=0')
Require-Markers "$Prefix-generated-checks-r1.log" @('scenarios=6; checks=56; failed=0')
Require-Markers "$Prefix-java-types-r1.log" @('SELFTEST: passed=14; failed=0','files=3634; inferred_declarations=0')
Require-Markers "$Prefix-runtime-refresh-r1.log" @('services=5; configuration_and_arguments_changed=0')
Require-Markers "h5-package-current-storage-generated-20261001-$HttpRound.log" @('failed=0; requests=',
    '"storageImportGenerated":true','"storageImportGeneratedCleanup":true','"storageRollback":true','"storageCleanup":true','"secrets":true','"cleanup":true',
    'H5_TENANT_PACKAGE_SECRET_SCAN:.*leaks=0','PACKAGE_OPERATOR_INPUTS: files=19; changed=0')
Require-Markers "h5-package-current-storage-generated-restore-20261001-$HttpRound.log" @(
    'PACKAGE_CONFIGURATION_RESTORED: original_bytes=true; service_arguments_unchanged=true; owned_auth_healthy=true','checks=18; failed=0; requests=10')
Push-Location $Root
try {
    $Backend=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-backend-inputs-r1.json") -Raw | ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log' | Sort-Object)
    if ($Backend.Count -ne 3777 -or @(Compare-Object @($Backend.Path | Sort-Object) $Paths).Count -ne 0 -or
        @($Backend | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Backend differs from generated-file build' }
    $Previous=@{}
    @(Get-Content -LiteralPath (Join-Path $Evidence 'h5-import-capacity-20261002-backend-inputs-r1.json') -Raw | ConvertFrom-Json) | ForEach-Object { $Previous[$_.Path]=$_.Hash }
    $Changes=@($Backend | Where-Object { $Previous[$_.Path] -ne $_.Hash })
    if ($Previous.Count -ne 3777 -or $Changes.Count -ne 1 -or $Changes[0].Path.Replace('\','/') -ne 'cloudflow-backend/cloudflow-common/cloudflow-common-excel/src/main/java/com/cloudflow/common/excel/importing/ImportEngine.java') { throw 'Unexpected product change since prior 14-item evidence' }
    $Frontend=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-asset-reminder-frontend-inputs-20261001-r2.json') -Raw | ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo' | Sort-Object)
    if ($Frontend.Count -ne 1469 -or @(Compare-Object @($Frontend.Path | Sort-Object) $Paths).Count -ne 0 -or
        @($Frontend | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Frontend differs from verified baseline' }
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-settlement-reversal-final-inputs-20261001-r1.json') -Raw | ConvertFrom-Json | Where-Object { $_.Path -match '[\\/]DB[\\/]' })
    if ($Sql.Count -ne 8 -or @($Sql | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'SQL differs from verified baseline' }
    $Http=@(Get-Content -LiteralPath (Join-Path $Evidence "h5-package-current-storage-generated-inputs-20261001-$HttpRound.json") -Raw | ConvertFrom-Json)
    if ($Http.Count -ne 19 -or @($Http | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'HTTP script evidence changed' }
    $Verification=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-verification-inputs-r1.json") -Raw | ConvertFrom-Json)
    if ($Verification.Count -ne 8 -or @($Verification | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Targeted verification inputs changed' }
    'GENERATED_IMPORT_CURRENT_INPUTS: backend=3777; frontend=1469; sql=8; http_scripts=19; targeted_inputs=8; product_changes_from_prior=1; frontend_sql_changes=0'
} finally { Pop-Location }
'H5_GENERATED_IMPORT_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
