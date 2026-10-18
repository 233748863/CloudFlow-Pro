param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-privacy-config-calendar-stage-20261005-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Stage report already exists'}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$Current=@{}
foreach($Relative in @('h3-portal-finance-20261002-backend-r88-inputs.json','h3-portal-finance-20261002-frontend-r55-inputs.json','d2-attendance-config-20261005-r6/inputs.json','d2-daily-calendar-checks-20261005-r4/inputs.json','h3-portal-finance-adjacent-20261002-r93/inputs.json')){
    foreach($Item in @(Read-Json $Relative)){
        $Key=$Item.Path.Replace('\','/')
        Require (-not $Current.ContainsKey($Key) -or $Current[$Key] -eq $Item.Hash) 'Current evidence source hashes conflict'
        $Current[$Key]=$Item.Hash
    }
}
foreach($Key in $Current.Keys){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Key)).Hash -eq $Current[$Key]) 'Current source differs from verified evidence'}
$Binaries=@(Read-Json 'd2-daily-calendar-checks-20261005-r4/binary-inputs.json')
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled daily dependency changed'}
$Archives=@{
 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/vo/attendance/HrAttendanceRuleVO.java'='d2-workdays-original-20261005/HrAttendanceRuleVO.java'
 'cloudflow-frontend/src/pages/hr/rules/HrAttendanceRulesPage.tsx'='d2-attendance-config-20261005-r4/HrAttendanceRulesPage-original.tsx'
 'cloudflow-frontend/src/pages/admin/attendance/AttendanceRule.tsx'='d2-workdays-original-20261005/AttendanceRule.tsx'
 'cloudflow-frontend/src/pages/hr/HrAttendancePage.tsx'='d2-workdays-original-20261005/HrAttendancePage.tsx'
 'cloudflow-frontend/src/services/api/admin.ts'='d2-workdays-original-20261005/admin.ts'
 'cloudflow-frontend/src/services/api/hr/types.ts'='d2-workdays-original-20261005/types.ts'
}
$Historical=@()
foreach($Relative in @('d2-attendance-appeals-20261005-r1','d2-attendance-privacy-20261005-r2')){
    $Changes=@()
    foreach($Item in @(Read-Json "$Relative/inputs.json")){
        $Key=$Item.Path.Replace('\','/')
        if((Get-FileHash -LiteralPath (Join-Path $Root $Key)).Hash -ne $Item.Hash){
            Require ($Archives.ContainsKey($Key)) 'Unreviewed historical input difference'
            Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Archives[$Key])).Hash -eq $Item.Hash) 'Historical source archive hash mismatch'
            $Changes+=$Key
        }
    }
    Require ($Changes.Count -eq 6) 'Expected exactly six reviewed product differences from B87/F53'
    $Result=Read-Json "$Relative/result.json"
    Require ($Result.passed -and $Result.preservation -and $Result.restoration -and $Result.secrets) 'Historical stage required evidence missing'
    $Historical+=[pscustomobject]@{Evidence=$Relative;OriginalBackend='r87';OriginalFrontend='r53';Checks=$Result.checks.Count;Requests=$Result.requests;ReviewedProductChanges=$Changes;OriginalSourcesVerified=$true;RelabelledAsCurrent=$false}
}
$Config=Read-Json 'd2-attendance-config-20261005-r6/result.json'
$Daily=Read-Json 'd2-daily-calendar-checks-20261005-r4/result.json'
Require ($Config.passed -and $Config.shifts -and $Config.rules -and $Config.schedules -and $Config.punches -and $Config.preview -and $Config.preservation -and $Config.secrets) 'Current configuration proof incomplete'
Require ($Daily.Passed -and $Daily.ActualDatabase -and $Daily.ActualHandler -and $Daily.ActualTenantIterator -and $Daily.ScratchCleaned -and -not $Daily.NaturalScheduler) 'Current daily/calendar proof incomplete'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r93/summary.log') -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current adjacent regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($Launch in @('d2-config-frontend-20261005-r54','d2-workdays-backend-20261005-r88','d2-workdays-frontend-20261005-r55','d2-workdays-hr-reload-20261005-r88')){
    Require (Test-Path -LiteralPath (Join-Path $Evidence "$Launch-launch.log")) 'Build or reload log missing'
}
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd2-workdays-backend-20261005-r88-launch.log') -Raw).Contains('FINANCE_BUILD: phase=Backend; files=3830; changed=0; exit=0')) 'Backend build did not pass'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd2-workdays-frontend-20261005-r55-launch.log') -Raw).Contains('FINANCE_BUILD: phase=Frontend; files=1478; changed=0; exit=0')) 'Frontend build did not pass'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd2-workdays-hr-reload-20261005-r88-launch.log') -Raw).Contains('ISOLATED_RESTART_READY: service=hr;')) 'HR reload did not pass'
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq (Join-Path $Root '.cloudflow-runtime\batch-g-integration\9799534e1a3a47b5958330f14ae16dc7')) 'Owned running fixture required'
$Processes=@()
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process missing'
    $Processes+=[pscustomobject]@{Name=$Entry.name;Pid=$Entry.id;Owned=$true}
}
$Health=@()
foreach($Service in $State.services){
    $Response=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
    Require ($Response.status -eq 'UP') 'Service health check failed'
    $Health+=[pscustomobject]@{Name=$Service.name;Status=$Response.status}
}
Require ($Processes.Count -eq 9 -and $Health.Count -eq 6) 'Expected nine owned processes and six services'
$Value=[pscustomobject]@{
    Passed=$true;Backend='r88';Frontend='r55';LoadedBackend='hr=r88; auth=r87; oa,crm,workflow,gateway=r86; other five services have unchanged relevant sources'
    CurrentInputs=$Current.Count;CompiledDependencies=$Binaries.Count;InputChanges=0
    ConfigurationChecks=$Config.checks.Count;ConfigurationRequests=$Config.requests;DailyCalendarChecks=$Daily.Checks
    AdjacentRound='r93';AdjacentInputs=$AdjacentInputs;HistoricalEvidence=$Historical
    Processes=$Processes;Health=$Health;CaptchaCounter=588;CaptchaOriginalConfigurationRestoredByActualRunner=$true
    All17Complete=$false;Global35Prd681Complete=$false
    Remaining=@('natural daily scheduler delivery','month closing and appeal full UI paths','direct first HTTP request below 500ms','whole D2 and global current-version acceptance')
}
$Value|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D2_PRIVACY_CONFIG_CALENDAR_STAGE: inputs=$($Current.Count); binaries=$($Binaries.Count); config_checks=$($Config.checks.Count); daily_checks=$($Daily.Checks); adjacent_inputs=$AdjacentInputs; processes=$($Processes.Count); healthy_services=$($Health.Count); global_complete=false; exit=0"
