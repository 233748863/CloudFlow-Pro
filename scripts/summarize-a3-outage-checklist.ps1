param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r3')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_OUTAGE_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File,[string[]]$Excluded=@()){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence inputs required'}
    foreach($InputFile in $Inputs){
        if($InputFile.Path.Replace('\','/') -in $Excluded){continue}
        $Absolute=if([IO.Path]::IsPathRooted($InputFile.Path)){$InputFile.Path}else{Join-Path $Root $InputFile.Path}
        if((Get-FileHash -LiteralPath $Absolute).Hash -ne $InputFile.Hash){throw "Evidence input changed: $File"}
    }
    "A3_OUTAGE_INPUTS: file=$File; count=$($Inputs.Count); excluded=$($Excluded.Count); all_nonexcluded_match=true"
}
Require-Markers 'a3-execution-checklist-20261002-r1.log' @('A3_EXECUTION_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r9.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3816; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r9-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Prior=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r5/inputs.json') -Raw|ConvertFrom-Json)
$Permitted=@('cloudflow-frontend/src/pages/system/job/Index.tsx','scripts/run-owned-captcha-allowance.mjs','scripts/verify-batch-g-integration.mjs')
$Changed=@($Prior|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
if($Changed.Count -ne 3 -or @($Changed|Where-Object{$_.Path.Replace('\','/') -notin $Permitted}).Count){throw 'Change exceeds reviewed frontend and integration scope'}
$OldPaths=@($Prior.Path|ForEach-Object{$_.Replace('\','/')})
$ExpectedAdded=@('scripts/operate-a3-crm-outage.ps1','scripts/run-a3-job-outage.ps1','scripts/verify-a3-job-outage.mjs',
    'scripts/run-a3-job-crm-failure.ps1','scripts/verify-a3-job-crm-failure.mjs','scripts/summarize-a3-outage-checklist.ps1')
Push-Location $Root
try {
    $Added=@(rg --files scripts -g '!**/node_modules/**'|ForEach-Object{$_.Replace('\','/')}|Where-Object{$_ -notin $OldPaths})
    if(@(Compare-Object $ExpectedAdded $Added).Count){throw 'Unexpected added verification scripts'}
} finally {Pop-Location}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers 'a3-job-crm-failure-20261002-http-r1.log' @('A3_JOB_CRM_FAILURE_REAL_RESULT: checks=22; failed=0; requests=6;','"recovery":true','"restoration":true','"secrets":true')
# Historical wrapper/import additions do not rewrite the previous CRM result or its own verifier.
Assert-Inputs 'a3-job-crm-failure-20261002-inputs-r1.json' @('scripts/verify-batch-g-integration.mjs','scripts/run-owned-captcha-allowance.mjs')
Require-Markers "a3-job-outage-20261002-http-$Round.log" @('A3_JOB_OUTAGE_REAL_RESULT: checks=36; failed=0; requests=12;',
    '"stopped":true','"retries":true','"alarm":true','"offline":true','"page":true','"permissions":true','"recovery":true','"restoration":true','"secrets":true',
    'A3_JOB_OUTAGE_INPUTS: files=21; changed=0; product_changed=0; exit=0')
Require-Markers "owned-captcha-a3-job-outage-20261002-$Round.log" @('A3_JOB_OUTAGE_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Assert-Inputs "a3-job-outage-20261002-inputs-$Round.json"
$RuntimeLog=Get-Content -LiteralPath (Join-Path $Evidence "a3-job-outage-20261002-http-$Round.log")
$ScanText=@($RuntimeLog|Where-Object{$_ -match '^A3_OUTAGE_SECRET_SCAN: '})
if($ScanText.Count -ne 1){throw 'Single current secret scan required'}
$Scan=$ScanText[0].Substring('A3_OUTAGE_SECRET_SCAN: '.Length)|ConvertFrom-Json
if($Scan.leaks -ne 0 -or $Scan.database_leaks -ne 0 -or $Scan.values -lt 17){throw 'Current secret scan incomplete'}
'A3_OUTAGE_CHECKLIST_REUSE: prior_items=14; schema_menus_backend_sources_credentials_unchanged=true; frontend_types_and_build=current_r7; current_outage_and_secret_checks=true; prior_shared_script_snapshot_not_claimed_current=true'
"A3_OUTAGE_REVIEWED_DELTA: existing_files=$($Changed.Count); added_verification_scripts=$($Added.Count); product_files=1; backend_changed=0; schema_changed=0"
'A3_OUTAGE_CHECKLIST: items=14; missing=0; current_backend=r9; current_frontend=r7; current_outage_checks=36; historical_crm_checks=22; complete_35_prd=false; production_modified=false'
