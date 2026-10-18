param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r17')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$SummaryHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_CLUSTER_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "A3_CLUSTER_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'h3-portal-finance-20261002-backend-r46.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3821; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r46-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Runtime="a3-job-cluster-20261002-http-$RuntimeRound.log"
Require-Markers $Runtime @('A3_JOB_CLUSTER_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    'A3_JOB_CLUSTER_INPUTS: files=28; changed=0; product_changed=0; exit=0','A3_CLUSTER_WINDOWS:',
    '"directManagementRequests":8','"actualFourProcesses":true','"routingMatrix":true','"realContractReminders":true',
    '"dualSchedulers":true','"rawMonitorRetained":false','"forcedTerminalWrites":0','"nacosHeartbeatVerified":false',
    '"leaks":0','"databaseLeaks":0')
foreach($Name in @('instances','route','routingMatrix','business','deduplication','scheduling','pause','logs','permissions','restoration','runtimeRestoration','peerRestoration','capacityRestoration','secrets')){
    Require-Markers $Runtime @(('"'+$Name+'":true'))
}
Assert-Inputs "a3-job-cluster-20261002-inputs-$RuntimeRound.json"
Require-Markers "a3-cluster-launch-20261003-$RuntimeRound.log" @('A3_JOB_CLUSTER_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','name=java-explicit-types; exit=0','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
$Prior=@(Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/inputs.json") -Raw|ConvertFrom-Json)
$PriorScripts=@($Prior.Path|ForEach-Object{$_.Replace('\','/')}|Where-Object{$_ -like 'scripts/*'})
Push-Location $Root
try {$CurrentScripts=@(rg --files scripts -g '!**/node_modules/**'|ForEach-Object{$_.Replace('\','/')})} finally {Pop-Location}
$Added=@($CurrentScripts|Where-Object{$_ -notin $PriorScripts})
if($Added.Count -ne 1 -or $Added[0] -ne 'scripts/summarize-a3-cluster-checklist.ps1' -or @($PriorScripts|Where-Object{$_ -notin $CurrentScripts}).Count){throw 'Changes exceed summary-only addition'}
'A3_CLUSTER_ADJACENT_REUSE: existing_inputs_unchanged=true; added_summary_scripts=1; product_changes=0; existing_verification_changes=0'
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"A3_CLUSTER_CHECKLIST_ITEM: item=$Item; passed=true"}
if((Get-FileHash -LiteralPath $PSCommandPath).Hash -ne $SummaryHash){throw 'Summary input changed'}
"A3_CLUSTER_SUMMARY_SOURCE: sha256=$SummaryHash; changed=0"
'A3_CLUSTER_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=28; captcha_restored=true'
"A3_CLUSTER_CHECKLIST: items=$($Items.Count); missing=0; actual_four_processes=true; routing_matrix=true; dual_scheduler_windows=4; actual_contracts=8; adjacent_database_checks=1012; nacos_heartbeat=false; complete_35_prd=false; production_modified=false"
