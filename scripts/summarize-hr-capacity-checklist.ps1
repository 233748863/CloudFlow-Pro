param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r2',
    [ValidatePattern('^h5-hr-capacity-disabled-recheck-20261002-r[1-9][0-9]*\.log$')][string]$RestoreRecheck)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach ($Pattern in $Patterns) { if ($Content -notmatch $Pattern) { throw "Missing evidence: $File" } }
    "HR_CAPACITY_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'h5-import-capacity-20261002-checklist-r1.log' @('H5_IMPORT_CAPACITY_CHECKLIST: items=14; missing=0','backend_modules=29')
Require-Markers 'h5-import-capacity-20261002-install-r1.log' @('BUILD SUCCESS','BACKEND_INPUTS: files=3777; changes=0; exit=0','\[static-rules\] no findings')
Require-Markers "h5-package-current-storage-hr-20261001-$HttpRound.log" @('failed=0; requests=',
    '"storageTrainingAgreement":true','"storageTrainingAgreementCleanup":true','"storageExitInterview":true','"storageExitInterviewCleanup":true',
    '"storageAdvanceProof":true','"storageAdvanceProofCleanup":true','"storageRollback":true','"storageCleanup":true','"secrets":true','"cleanup":true',
    'H5_TENANT_PACKAGE_SECRET_SCAN:.*leaks=0','PACKAGE_OPERATOR_INPUTS: files=16; changed=0')
Require-Markers "h5-package-current-storage-hr-restore-20261001-$HttpRound.log" @(
    'PACKAGE_CONFIGURATION_RESTORED: original_bytes=true; service_arguments_unchanged=true; owned_auth_healthy=true')
if ($RestoreRecheck) {
    Require-Markers $RestoreRecheck @('checks=18; failed=0; requests=10','"disabled":true','"cleanup":true')
    'HR_CAPACITY_RESTORATION: configuration_restored=true; initial_disabled_check_failed=true; independent_recheck_passed=true; original_wrapper_exit=1'
} else {
    Require-Markers "h5-package-current-storage-hr-restore-20261001-$HttpRound.log" @('checks=18; failed=0; requests=10')
}
Push-Location $Root
try {
    $Backend=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-import-capacity-20261002-backend-inputs-r1.json') -Raw | ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log' | Sort-Object)
    if ($Backend.Count -ne 3777 -or @(Compare-Object @($Backend.Path | Sort-Object) $Paths).Count -ne 0 -or
        @($Backend | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Backend differs from verified import stage' }
    $Frontend=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-asset-reminder-frontend-inputs-20261001-r2.json') -Raw | ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo' | Sort-Object)
    if ($Frontend.Count -ne 1469 -or @(Compare-Object @($Frontend.Path | Sort-Object) $Paths).Count -ne 0 -or
        @($Frontend | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Frontend differs from verified baseline' }
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-settlement-reversal-final-inputs-20261001-r1.json') -Raw | ConvertFrom-Json | Where-Object { $_.Path -match '[\\/]DB[\\/]' })
    if ($Sql.Count -ne 8 -or @($Sql | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'SQL differs from verified baseline' }
    $Http=@(Get-Content -LiteralPath (Join-Path $Evidence "h5-package-current-storage-hr-inputs-20261001-$HttpRound.json") -Raw | ConvertFrom-Json)
    if ($Http.Count -ne 16 -or @($Http | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'HTTP script evidence changed' }
    $Imports=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-import-capacity-20261002-verification-inputs-r2.json') -Raw | ConvertFrom-Json)
    if ($Imports.Count -ne 4 -or @($Imports | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Import check inputs changed' }
    'HR_CAPACITY_CURRENT_INPUTS: backend=3777; frontend=1469; sql=8; http_scripts=16; backend_frontend_sql_changes=0; previous_14_items_reusable=true'
} finally { Pop-Location }
'H5_HR_CAPACITY_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
