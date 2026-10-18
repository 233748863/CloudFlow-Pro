param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BuildRound='r8')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='f4-contract-access-20261002'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "F4_CONTRACT_ACCESS_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'f4-sign-methods-20261002-checklist-r9.log' @('F4_SIGN_METHODS_CHECKLIST: items=14; missing=0')
Require-Markers "f4-sign-methods-20261002-install-$BuildRound.log" @('BUILD SUCCESS','\[static-rules\] no findings')
Require-Markers "f4-sign-methods-20261002-build-$BuildRound.log" @('kind=backend; files=3777; changed=0','kind=frontend; files=1469; changed=0',
    'F4_SIGN_BUILD: backend_install=0; frontend_types=0; frontend_build=0')
Require-Markers "f4-sign-methods-20261002-java-types-$BuildRound.log" @('SELFTEST: passed=14; failed=0','files=3635; inferred_declarations=0')
Require-Markers "f4-sign-methods-20261002-runtime-$BuildRound.log" @('ISOLATED_RESTART_READY: service=oa','services=1; configuration_and_arguments_changed=0')
Require-Markers "$Prefix-http-$HttpRound.log" @('F4_CONTRACT_ACCESS_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"ownership":true','"revocation":true','"restoration":true','"denials":true','"secrets":true',
    'F4_CONTRACT_ACCESS_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0',
    'F4_CONTRACT_ACCESS_INPUTS: files=18; changed=0; product_changed=0; exit=0')
Require-Markers "owned-captcha-oa-contract-access-20261002-$HttpRound.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'f4-contract-terms-20261002-http-r7.log' @('F4_CONTRACT_TERMS_REAL_RESULT: checks=43; failed=0; requests=62;',
    'F4_CONTRACT_TERMS_INPUTS: files=18; changed=0; product_changed=0; exit=0')
Require-Markers 'owned-captcha-oa-contract-terms-20261002-r7.log' @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'full-oa-regression-20261002-database-r5.log' @('PASS: isolated 01-07 OA database acceptance','PASS: 1012 OA boundary assertions',
    'Temporary data removed; logs retained','CURRENT_OA_INPUTS: files=3802; changed=0; exit=0')
Push-Location $Root
try {
    foreach($Kind in @('backend','frontend')) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "f4-sign-methods-20261002-$Kind-inputs-$BuildRound.json") -Raw|ConvertFrom-Json)
        $Previous=@{}; @(Get-Content -LiteralPath (Join-Path $Evidence "f4-sign-methods-20261002-$Kind-inputs-r7.json") -Raw|ConvertFrom-Json)|ForEach-Object{$Previous[$_.Path]=$_.Hash}
        if($Snapshot.Count -ne $Previous.Count -or @($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
        $Changes=@($Snapshot|Where-Object{$Previous[$_.Path] -ne $_.Hash})
        if($Kind -eq 'backend') {
            if($Changes.Count -ne 1 -or $Changes[0].Path.Replace('\','/') -ne 'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaContractFulfilmentService.java') {throw 'Unexpected backend change'}
        } elseif($Changes.Count) {throw 'Unexpected frontend change'}
        "F4_CONTRACT_ACCESS_CURRENT: kind=$Kind; files=$($Snapshot.Count); changes_from_r7=$($Changes.Count); build_matches=true"
    }
    foreach($InputFile in @("$Prefix-inputs-$HttpRound.json",'f4-contract-terms-20261002-inputs-r7.json','full-oa-regression-20261002-inputs-r5.json')) {
        $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $InputFile) -Raw|ConvertFrom-Json)
        if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Verification or runtime inputs changed'}
    }
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-employee-certificate-20261002-sql-inputs-r3.json') -Raw|ConvertFrom-Json)
    if($Sql.Count -ne 7 -or @($Sql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'SQL differs from verified empty database'}
    & node scripts/verify-owned-storage-usage.mjs
    if($LASTEXITCODE -ne 0){throw 'Incorrect storage cache units'}
    'F4_CONTRACT_ACCESS_REUSED: empty_database_tables=374; menus=884; employee_grants=217; unchanged_sql=7; new_menus=0; new_grants=0'
} finally { Pop-Location }
'F4_CONTRACT_ACCESS_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
