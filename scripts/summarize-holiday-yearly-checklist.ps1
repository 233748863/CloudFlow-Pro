$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A4_YEARLY_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty input snapshot required'}
    foreach($Item in $Inputs){
        $Absolute=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $Absolute).Hash -ne $Item.Hash){throw "Input mismatch: $File"}
    }
    "A4_YEARLY_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'a3-report-routing-checklist-20261002-r1.log' @('A3_REPORT_ROUTING_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r11.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3817; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r11-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Before=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r10-inputs.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r11-inputs.json') -Raw|ConvertFrom-Json)
$Added=@($After|Where-Object{$_.Path -notin $Before.Path})
$Removed=@($Before|Where-Object{$_.Path -notin $After.Path})
$Changed=@($Before|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
$Allowed=@('cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/job/BuiltInJobHandlers.java',
    'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/mapper/SysUserMapper.java',
    'cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/SysUserMapper.xml')
if($Removed.Count -ne 0 -or $Added.Count -ne 1 -or $Added[0].Path.Replace('\','/') -ne 'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/HolidayYearlyReminderService.java' -or $Changed.Count -ne 3 -or @($Changed|Where-Object{$_.Path.Replace('\','/') -notin $Allowed}).Count){throw 'Changes exceed annual reminder product scope'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers 'a4-yearly-checks-20261003-r1/checks.log' @('HOLIDAY_YEARLY_CHECKS: checks=14; failed=0; real_service=true; controlled_recipients_and_sender=true; actual_delivery_verified=false')
Require-Markers 'a4-yearly-checks-20261003-r1/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3679; inferred_declarations=0;')
Assert-Inputs 'a4-yearly-checks-20261003-r1/inputs.json'
Require-Markers 'holiday-yearly-reminder-20261003-http-r1.log' @('A4_YEARLY_REMINDER_REAL_RESULT: checks=21; failed=0; requests=9;',
    '"execution":true','"recipients":true','"isolation":true','"delivery":true','"permissions":true','"deduplication":true','"restoration":true','"secrets":true',
    'A4_YEARLY_REMINDER_INPUTS: files=19; changed=0; product_changed=0; exit=0','"leaks":0','"databaseLeaks":0')
Assert-Inputs 'holiday-yearly-reminder-20261003-inputs-r1.json'
Require-Markers 'a4-yearly-http-launch-20261003-r1.log' @('A4_YEARLY_REMINDER_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;', 'counter_writes=0; database_unchanged=true; production_modified=false')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Expected owned running environment'}
foreach($Entry in $State.processes){
    $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Process -or -not $Process.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}
}
foreach($Service in $State.services){
    $Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15
    if($Health.status -ne 'UP'){throw 'Owned service not healthy'}
}
'A4_YEARLY_REUSE: schema=374; product_delta=4; schema_menus_seed_and_frontend_unchanged=true; prior_structural_checks_reused=true; backend=r11; frontend=r7; historical_protocols_not_claimed_current=true'
'A4_YEARLY_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=19; changed=0'
'A4_YEARLY_CHECKLIST: items=14; missing=0; service_rules=14; actual_checks=21; manual_trigger=true; november_wall_clock_wait=false; complete_35_prd=false; production_modified=false'
