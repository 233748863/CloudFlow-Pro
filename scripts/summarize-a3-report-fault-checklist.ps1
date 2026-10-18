param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r2')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_REPORT_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File,[string[]]$Excluded=@()){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($InputFile in $Inputs){
        if($InputFile.Path.Replace('\','/') -in $Excluded){continue}
        $Absolute=if([IO.Path]::IsPathRooted($InputFile.Path)){$InputFile.Path}else{Join-Path $Root $InputFile.Path}
        if((Get-FileHash -LiteralPath $Absolute).Hash -ne $InputFile.Hash){throw "Evidence input changed: $File"}
    }
    "A3_REPORT_INPUTS: file=$File; count=$($Inputs.Count); excluded=$($Excluded.Count); nonexcluded_match=true"
}
Require-Markers 'a3-outage-checklist-20261002-r1.log' @('A3_OUTAGE_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r9.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3816; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r9-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Prior=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r5/inputs.json') -Raw|ConvertFrom-Json)
$Permitted=@('cloudflow-frontend/src/pages/system/job/Index.tsx','scripts/run-owned-captcha-allowance.mjs','scripts/verify-batch-g-integration.mjs')
$Changed=@($Prior|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
if($Changed.Count -ne 3 -or @($Changed|Where-Object{$_.Path.Replace('\','/') -notin $Permitted}).Count){throw 'Changes exceed verified product and integration scope'}
$OldPaths=@($Prior.Path|ForEach-Object{$_.Replace('\','/')})
$ExpectedAdded=@('scripts/operate-a3-crm-outage.ps1','scripts/run-a3-job-outage.ps1','scripts/verify-a3-job-outage.mjs',
    'scripts/run-a3-job-crm-failure.ps1','scripts/verify-a3-job-crm-failure.mjs','scripts/summarize-a3-outage-checklist.ps1',
    'scripts/operate-a3-job-peer.ps1','scripts/operate-a3-peer-capacity.ps1','scripts/run-a3-job-peer.ps1','scripts/verify-a3-job-peer.mjs',
    'scripts/observe-a3-scheduler-redis.mjs','scripts/run-a3-job-schedulers.ps1','scripts/verify-a3-job-schedulers.mjs','scripts/summarize-a3-instances-checklist.ps1',
    'scripts/a3-report-fault-proxy.mjs','scripts/operate-a3-report-fault.ps1','scripts/run-a3-job-report-fault.ps1',
    'scripts/verify-a3-job-report-fault.mjs','scripts/summarize-a3-report-fault-checklist.ps1')
Push-Location $Root
try {
    $Added=@(rg --files scripts -g '!**/node_modules/**'|ForEach-Object{$_.Replace('\','/')}|Where-Object{$_ -notin $OldPaths})
    if(@(Compare-Object $ExpectedAdded $Added).Count){throw 'Unexpected verification script additions'}
} finally {Pop-Location}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
$Shared=@('scripts/verify-batch-g-integration.mjs','scripts/run-owned-captcha-allowance.mjs')
Require-Markers 'a3-job-outage-20261002-http-r3.log' @('A3_JOB_OUTAGE_REAL_RESULT: checks=36; failed=0; requests=12;')
Assert-Inputs 'a3-job-outage-20261002-inputs-r3.json' $Shared
Require-Markers 'a3-job-peer-20261002-http-r2.log' @('A3_JOB_PEER_REAL_RESULT: checks=37; failed=0; requests=9;','"peerLock":true','"peerBusiness":true','"capacityRestoration":true','A3_PEER_SECRET_SCAN: .* leaks=0; .*database_leaks=0')
Assert-Inputs 'a3-job-peer-20261002-inputs-r2.json' ($Shared+@('scripts/operate-a3-job-peer.ps1'))
Require-Markers 'owned-captcha-a3-job-peer-20261002-r2.log' @('A3_JOB_PEER_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')
Require-Markers "a3-job-schedulers-20261002-http-r3.log" @('A3_JOB_SCHEDULERS_REAL_RESULT: checks=\d+; failed=0; requests=\d+;',
    '"instances":true','"cron":true','"fixedRate":true','"fixedDelay":true','"pause":true','"resume":true','"liveChange":true','"logs":true',
    '"permissions":true','"restoration":true','"peerRestoration":true','"capacityRestoration":true','"secrets":true',
    'A3_JOB_SCHEDULERS_INPUTS: files=23; changed=0; product_changed=0; exit=0','A3_SCHEDULER_SECRET_SCAN: .* leaks=0; .*database_leaks=0')
Assert-Inputs "a3-job-schedulers-20261002-inputs-r3.json" $Shared
Require-Markers "owned-captcha-a3-job-schedulers-20261002-r3.log" @('A3_JOB_SCHEDULERS_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-instances-checklist-20261002-r1.log' @('A3_INSTANCES_CHECKLIST: items=14; missing=0;')
Require-Markers "a3-job-report-fault-20261002-http-$Round.log" @('A3_JOB_REPORT_FAULT_REAL_RESULT: checks=35; failed=0; requests=15;',
    '"route":true','"dropped":true','"business":true','"recovered":true','"successReplay":true','"unreachable":true','"timeout":true','"alarm":true',
    '"lateReplay":true','"permissions":true','"runtimeRestoration":true','"restoration":true','"proxyRestoration":true','"secrets":true',
    'A3_JOB_REPORT_FAULT_INPUTS: files=22; changed=0; product_changed=0; exit=0','A3_REPORT_FAULT_SECRET_SCAN: .* leaks=0; .*database_leaks=0')
Assert-Inputs "a3-job-report-fault-20261002-inputs-$Round.json"
Require-Markers "owned-captcha-a3-job-report-fault-20261002-$Round.log" @('A3_JOB_REPORT_FAULT_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
'A3_REPORT_CHECKLIST_REUSE: prior_items=14; schema_menus_backend_sources_credentials_unchanged=true; backend=r9; frontend=r7; actual_report_loss_timeout_and_late_result=true; historical_business_and_scheduler_peers=true; historical_shared_script_snapshots_not_claimed_current=true'
"A3_REPORT_REVIEWED_DELTA: prior_existing_changed=$($Changed.Count); added_verification_scripts=$($Added.Count); product_changes_since_outage=0; schema_changed=0"
'A3_REPORT_CHECKLIST: items=14; missing=0; complete_35_prd=false; failover_and_day_statistics_unverified=true; production_modified=false'

