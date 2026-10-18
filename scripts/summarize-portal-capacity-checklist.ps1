param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r3')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "PORTAL_CAPACITY_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'h5-generated-import-20261002-checklist-r2.log' @('H5_GENERATED_IMPORT_CHECKLIST: items=14; missing=0')
Require-Markers 'h5-settlement-capacity-20261002-checklist-r2.log' @('H5_SETTLEMENT_CAPACITY_CHECKLIST: items=14; missing=0')
Require-Markers "h5-portal-capacity-20261002-http-$HttpRound.log" @(
    'H3_PORTAL_TICKET_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"storagePortalFile":true','"storagePortalFileCleanup":true',
    '"submission":true','"assignment":true','"publication":true','"permissions":true',
    '"files":true','"concurrency":true','"desktop":true','"mobile":true','"lostResponse":true',
    'H3_PORTAL_TICKET_LOG_SCAN:.*leaks=0; database_logs_checked=true; database_bytes=\d+; database_leaks=0',
    'PASS 门户测试恢复全部租户原有角色菜单授权',
    'PORTAL_CAPACITY_INPUTS: files=\d+; changed=0; exit=0')
Require-Markers "h5-portal-capacity-20261002-restore-$HttpRound.log" @(
    'PORTAL_CAPACITY_RESTORED: original_configurations_and_arguments=true; auth_gateway_healthy=true',
    'H5_TENANT_PACKAGE_REAL_RESULT: checks=18; failed=0; requests=10;',
    'PORTAL_CAPACITY_SMTP_STOPPED: owned_process_only=true; fixture_metadata_retained=true')
Push-Location $Root
try {
    $Backend=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-generated-import-20261002-backend-inputs-r1.json') -Raw|ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log'|Sort-Object)
    if($Backend.Count -ne 3777 -or @(Compare-Object @($Backend.Path|Sort-Object) $Paths).Count -or
        @($Backend|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Backend differs from verified build'}
    $Frontend=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-asset-reminder-frontend-inputs-20261001-r2.json') -Raw|ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo'|Sort-Object)
    if($Frontend.Count -ne 1469 -or @(Compare-Object @($Frontend.Path|Sort-Object) $Paths).Count -or
        @($Frontend|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Frontend differs from verified build'}
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-settlement-reversal-final-inputs-20261001-r1.json') -Raw|ConvertFrom-Json|Where-Object{$_.Path -match '[\\/]DB[\\/]'})
    if($Sql.Count -ne 8 -or @($Sql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'SQL differs from verified baseline'}
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h5-portal-capacity-20261002-inputs-$HttpRound.json") -Raw|ConvertFrom-Json)
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Portal verification inputs changed'}
    "PORTAL_CAPACITY_CURRENT_INPUTS: backend=3777; frontend=1469; sql=8; portal_inputs=$($Inputs.Count); product_changes=0; previous_14_items_reusable=true"
} finally { Pop-Location }
'H5_PORTAL_CAPACITY_CHECKLIST: items=14; missing=0; backend_modules=29; upload_entries=21; hr_generated_complete=false; complete_35_prd=false; production_modified=false'
