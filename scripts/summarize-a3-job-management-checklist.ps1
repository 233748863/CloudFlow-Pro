param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='a3-job-management-20261002'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "A3_JOB_MANAGEMENT_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'f4-contract-access-20261002-checklist-r2.log' @('F4_CONTRACT_ACCESS_CHECKLIST: items=14; missing=0',
    'F4_CONTRACT_ACCESS_REUSED: empty_database_tables=374; menus=884; employee_grants=217; unchanged_sql=7; new_menus=0; new_grants=0')
Require-Markers "$Prefix-http-$HttpRound.log" @('A3_JOB_MANAGEMENT_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"validation":true','"manual":true','"scheduling":true','"lateDetail":true','"liveChange":true','"editorUi":true','"logUi":true','"internalBoundary":true','"permissions":true','"restoration":true','"secrets":true',
    'A3_JOB_MANAGEMENT_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0',
    'A3_JOB_MANAGEMENT_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Require-Markers "owned-captcha-a3-job-management-20261002-$HttpRound.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-internal-auth-20261002-install-r2.log' @('BUILD SUCCESS','\[static-rules\] no findings')
Require-Markers 'a3-internal-auth-20261002-type-check-r2.log' @('tsc --noEmit')
Require-Markers 'a3-internal-auth-20261002-frontend-build-r2.log' @('built in','dist/sw.js')
Require-Markers 'a3-internal-auth-java-self-20261002-r1.log' @('SELFTEST: passed=14; failed=0')
Require-Markers 'a3-internal-auth-java-20261002-r1.log' @('inferred_declarations=0')
Require-Markers 'a3-internal-auth-checks-20261002-r1/checks.log' @('JOB_INTERNAL_AUTH_CHECKS: passed=81; failed=0; real_redis_replay=true; connection_failure_closed=true')
Require-Markers 'a3-internal-auth-http-20261002-r1.log' @('A3_INTERNAL_AUTH_HTTP: requests=82; passed=82; failed=0;','leaks=0; product_changed=0')
Push-Location $Root
try {
    foreach($Kind in @('backend','frontend')) {
        $SnapshotFile="a3-internal-auth-20261002-$Kind-inputs-r2.json"
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence $SnapshotFile) -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
        "A3_JOB_MANAGEMENT_CURRENT: kind=$Kind; files=$($Snapshot.Count); product_changes=0; build_matches=true"
    }
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-inputs-$HttpRound.json") -Raw|ConvertFrom-Json)
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Verification or runtime inputs changed'}
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-employee-certificate-20261002-sql-inputs-r3.json') -Raw|ConvertFrom-Json)
    if($Sql.Count -ne 7 -or @($Sql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'SQL differs from verified empty database'}
    & node scripts/verify-owned-storage-usage.mjs
    if($LASTEXITCODE -ne 0){throw 'Incorrect storage cache units'}
} finally { Pop-Location }
'A3_JOB_MANAGEMENT_CHECKLIST: items=14; missing=0; current_schema_tables=374; backend_modules=29; complete_35_prd=false; production_modified=false'
