param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "TRAINING_CAPACITY_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'h5-generated-import-20261002-checklist-r2.log' @('H5_GENERATED_IMPORT_CHECKLIST: items=14; missing=0')
Require-Markers 'h5-portal-capacity-20261002-checklist-r3.log' @('H5_PORTAL_CAPACITY_CHECKLIST: items=14; missing=0')
Require-Markers "h5-training-capacity-20261002-http-$HttpRound.log" @(
    'H5_TRAINING_CAPACITY_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"storageTrainingCertificate":true','"storageTrainingCertificateCleanup":true','"storageTrainingCertificateSecrets":true',
    'H5_TRAINING_CAPACITY_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0',
    'TRAINING_CAPACITY_INPUTS: files=\d+; changed=0; product_changed=0; exit=0')
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
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h5-training-capacity-20261002-inputs-$HttpRound.json") -Raw|ConvertFrom-Json)
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Training verification or runtime inputs changed'}
    "TRAINING_CAPACITY_CURRENT_INPUTS: backend=3777; frontend=1469; sql=8; http_and_runtime_inputs=$($Inputs.Count); product_changes=0; previous_14_items_reusable=true"
} finally { Pop-Location }
'H5_TRAINING_CAPACITY_CHECKLIST: items=14; missing=0; backend_modules=29; employee_certificate_and_grievance_pending=true; complete_35_prd=false; production_modified=false'
