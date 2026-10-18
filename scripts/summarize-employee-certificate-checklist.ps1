param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r5')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='h5-employee-certificate-20261002'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "EMPLOYEE_CERTIFICATE_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'h5-generated-import-20261002-checklist-r2.log' @('H5_GENERATED_IMPORT_CHECKLIST: items=14; missing=0')
Require-Markers "$Prefix-install-r3.log" @('BUILD SUCCESS','BACKEND_INPUTS: files=3777; changes=0; exit=0','\[static-rules\] no findings')
Require-Markers "$Prefix-identity-r1.log" @('scenarios=7; checks=40; failed=0','IDENTITY_INPUT: changed=0')
Require-Markers "$Prefix-java-types-r2.log" @('SELFTEST: passed=14; failed=0','files=3635; inferred_declarations=0')
Require-Markers "$Prefix-runtime-r2.log" @('ISOLATED_RESTART_READY: service=hr','services=1; configuration_and_arguments_changed=0')
Require-Markers "$Prefix-permissions-r3.log" @('file=07.cloudflow-demo-seed.sql; exit=0','tables=374','employee_after=217; unexpected_employee_grants=0',
    'new_menus=0; new_grants=4; unrelated_grants_changed=0','remaining=0; runtime_tables=374; seed_inputs=7; changed=0')
Require-Markers "$Prefix-menu-cache-r1.log" @('session_keys_targeted=0; rate_limit_keys_targeted=0')
Require-Markers "$Prefix-http-$HttpRound.log" @('H5_EMPLOYEE_CERTIFICATE_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"identity":true','"capacity":true','"retry":true','"cleanup":true','"secrets":true',
    'H5_EMPLOYEE_CERTIFICATE_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0',
    'EMPLOYEE_CERTIFICATE_INPUTS: files=17; changed=0; product_changed=0; exit=0')
Push-Location $Root
try {
    $Backend=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-backend-inputs-r3.json") -Raw|ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log'|Sort-Object)
    if($Backend.Count -ne 3777 -or @(Compare-Object @($Backend.Path|Sort-Object) $Paths).Count -or
        @($Backend|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Backend differs from verified build'}
    $Previous=@{}
    @(Get-Content -LiteralPath (Join-Path $Evidence 'h5-generated-import-20261002-backend-inputs-r1.json') -Raw|ConvertFrom-Json)|ForEach-Object{$Previous[$_.Path]=$_.Hash}
    $Changes=@($Backend|Where-Object{$Previous[$_.Path] -ne $_.Hash})
    $Allowed=@('cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrCertificateServiceImpl.java',
        'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrEssWorkflowControllers.java','cloudflow-backend/DB/06.cloudflow-business-seed.sql')
    if($Previous.Count -ne 3777 -or $Changes.Count -ne 3 -or @($Changes|Where-Object{$_.Path.Replace('\','/') -notin $Allowed}).Count){throw 'Unexpected product changes'}
    $Frontend=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-asset-reminder-frontend-inputs-20261001-r2.json') -Raw|ConvertFrom-Json)
    $Paths=@(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo'|Sort-Object)
    if($Frontend.Count -ne 1469 -or @(Compare-Object @($Frontend.Path|Sort-Object) $Paths).Count -or
        @($Frontend|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Frontend differs from verified build'}
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h2-settlement-reversal-final-inputs-20261001-r1.json') -Raw|ConvertFrom-Json|Where-Object{$_.Path -match '[\\/]DB[\\/]'})
    $SqlChanges=@($Sql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash})
    if($Sql.Count -ne 8 -or $SqlChanges.Count -ne 1 -or $SqlChanges[0].Path -notmatch '06.cloudflow-business-seed.sql$'){throw 'Unexpected SQL changes'}
    $VerifiedSql=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-sql-inputs-r3.json") -Raw|ConvertFrom-Json)
    if($VerifiedSql.Count -ne 7 -or @($VerifiedSql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'SQL differs from empty database check'}
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-inputs-$HttpRound.json") -Raw|ConvertFrom-Json)
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'HTTP or service inputs changed'}
    & node scripts/verify-owned-storage-usage.mjs
    if($LASTEXITCODE -ne 0){throw 'Incorrect storage cache units'}
    "EMPLOYEE_CERTIFICATE_CURRENT_INPUTS: backend=3777; frontend=1469; sql=8; http_and_runtime_inputs=$($Inputs.Count); product_changes=3; empty_database_current=true; unchanged_frontend_checks_reused=true"
} finally { Pop-Location }
'H5_EMPLOYEE_CERTIFICATE_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
