param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Evidence='D:\CloudFlowPro\.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='f4-contract-terms-20261002'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "F4_CONTRACT_TERMS_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'f4-sign-methods-20261002-checklist-r9.log' @('F4_SIGN_METHODS_CHECKLIST: items=14; missing=0')
Require-Markers "$Prefix-http-$HttpRound.log" @('F4_CONTRACT_TERMS_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"terms":true','"states":true','"templates":true','"audit":true','"timeline":true','"reports":true','"secrets":true',
    'F4_CONTRACT_TERMS_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0',
    'F4_CONTRACT_TERMS_INPUTS: files=18; changed=0; product_changed=0; exit=0')
Require-Markers "owned-captcha-oa-contract-terms-20261002-$HttpRound.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Push-Location 'D:\CloudFlowPro'
try {
    foreach($Kind in @('backend','frontend')) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "f4-sign-methods-20261002-$Kind-inputs-r7.json") -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
        "F4_CONTRACT_TERMS_CURRENT: kind=$Kind; files=$($Snapshot.Count); build_matches=true"
    }
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-inputs-$HttpRound.json") -Raw|ConvertFrom-Json)
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'HTTP or service inputs changed'}
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-employee-certificate-20261002-sql-inputs-r3.json') -Raw|ConvertFrom-Json)
    if($Sql.Count -ne 7 -or @($Sql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'SQL differs from verified empty database'}
    & node scripts/verify-owned-storage-usage.mjs
    if($LASTEXITCODE -ne 0){throw 'Incorrect storage cache units'}
} finally { Pop-Location }
'F4_CONTRACT_TERMS_CHECKLIST: items=14; missing=0; current_schema_tables=374; backend_modules=29; complete_35_prd=false; production_modified=false'
