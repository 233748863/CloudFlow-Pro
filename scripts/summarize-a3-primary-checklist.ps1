param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Marker='88456123d8d4'
$Log=Get-Content (Join-Path $Evidence 'a3-job-primary-fault-20261002-http-r4.log') -Raw
$Launch=Get-Content (Join-Path $Evidence 'a3-primary-launch-20261002-r4.log') -Raw
$Output=Join-Path $Evidence "a3-primary-checklist-20261002-$Round.log"
if(Test-Path $Output){throw 'Retain existing closeout evidence'}
$Checks=[Collections.Generic.List[string]]::new()
function Check([string]$Name,[bool]$Passed){if(-not $Passed){throw "Primary closeout failed: $Name"};$Checks.Add("PASS $Name")}
Check '整轮28项及16项阶段证据通过' ($Log.Contains('checks=28; failed=0; requests=19;') -and [regex]::Matches(([regex]::Match($Log,'A3_JOB_PRIMARY_FAULT_REAL_RESULT: [^\r\n]+')).Value,':true').Count -eq 16)
Check 'B10/F7及默认发现路径范围明确' ($Log.Contains('files=26; changed=0; product_changed=0; exit=0') -and $Log.Contains('native_gateway_and_report_failover=true') -and $Log.Contains('nacos_heartbeat_verified=false'))
$Inputs=Get-Content (Join-Path $Evidence 'a3-job-primary-fault-20261002-inputs-r4.json') -Raw|ConvertFrom-Json
foreach($File in $Inputs){$Path=if([IO.Path]::IsPathRooted($File.Path)){$File.Path}else{Join-Path $Root $File.Path};if((Get-FileHash $Path).Hash -ne $File.Hash){throw 'Current verification input changed'}}
Check '本轮26份验证输入仍匹配' (@($Inputs).Count -eq 26)
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
$Observed=Get-Content (Join-Path $Run "a3-primary-$Marker-redis.json") -Raw|ConvertFrom-Json
$Sql="SELECT JSON_OBJECT('executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=2005 ORDER BY log_id;"
$Rows=@($Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4 cloud_flow_db|ForEach-Object{$_|ConvertFrom-Json})
if($LASTEXITCODE -ne 0){throw 'Owned database read failed'}
Check '69条实际执行全部成功且真实回报完整' ($Rows.Count -eq 69 -and @($Rows|Where-Object{$_.status -ne 'SUCCESS' -or $_.affected -ne 0 -or -not $_.report}).Count -eq 0)
foreach($Row in $Rows){$Signed=@($Observed.signedResults|Where-Object executeNo -EQ $Row.executeNo);if($Signed.Count -ne 1 -or $Signed[0].executeStatus -ne $Row.status -or $Signed[0].affectedRows -ne $Row.affected -or $Signed[0].resultMsg -ne $Row.message -or $Signed[0].durationMs -ne $Row.duration){throw 'Signed actual result mismatch'}}
Check '69条签名反查与最终数量摘要时长一致' (@($Observed.signedResults).Count -eq 69)
$Claims=@($Observed.events|Where-Object command -EQ 'SET')
foreach($Row in $Rows){$Claim=@($Claims|Where-Object executeNo -EQ $Row.executeNo);$Saved=@($Observed.firedClaims|Where-Object executeNo -EQ $Row.executeNo);if($Claim.Count -ne 1 -or $Saved.Count -ne 1 -or $Saved[0].window -ne $Claim[0].window -or $Saved[0].capturedAt -lt $Claim[0].at){throw 'Real-time dispatch evidence mismatch'}}
Check '69条派发标记均在实际执行后及时读取保存' ($Claims.Count -eq 69 -and @($Observed.firedClaims).Count -eq 69)
Check '实际派发原实例1条副本68条未知归属0' (@($Claims|Where-Object owner -EQ 'base').Count -eq 1 -and @($Claims|Where-Object owner -EQ 'peer').Count -eq 68 -and @($Claims|Where-Object owner -EQ 'unknown').Count -eq 0)
$Outage=([regex]::Match($Log,'(?m)^A3_PRIMARY_OUTAGE: (.+)$').Groups[1].Value)|ConvertFrom-Json
for($Index=0;$Index -lt 4;$Index++){if($Index -gt 0 -and [long]$Outage.windows[$Index]-[long]$Outage.windows[$Index-1] -ne 3000){throw 'Outage windows not consecutive'};$Claim=@($Claims|Where-Object executeNo -EQ $Outage.executeNos[$Index]);if($Claim.Count -ne 1 -or $Claim[0].owner -ne 'peer' -or $Claim[0].window -ne $Outage.windows[$Index]){throw 'Outage ownership mismatch'}}
Check '原调度实际停机后四个连续计划窗口由副本唯一完成' ($Outage.stoppedProcess -eq 9188 -and $Outage.survivingProcess -eq 22648 -and $Outage.manualRouteChangesAfterStop -eq 0)
$Phases=@([regex]::Matches($Log,'(?m)^A3_PRIMARY_WINDOWS: (.+)$')|ForEach-Object{$_.Groups[1].Value|ConvertFrom-Json})
$Rejoin=@($Phases|Where-Object phase -EQ '原调度自动重加入')[0]
foreach($Window in $Rejoin.windows){$Owners=@($Observed.events|Where-Object window -EQ $Window|Select-Object -ExpandProperty owner -Unique);if('base' -notin $Owners -or 'peer' -notin $Owners){throw 'Rejoined scheduler competition missing'}}
Check '恢复原调度后自动参与四个共同窗口且不重复' (@($Rejoin.windows).Count -eq 4 -and @($Observed.baseProcesses)[1] -eq 42348)
foreach($Tag in @('4841e52fcb97','8ac14b181ba1',$Marker)){$Fault=Get-Content (Join-Path $Run "private/a3-primary-$Tag/fault.json") -Raw|ConvertFrom-Json;if($Fault.status -ne 'RESTORED'){throw 'Primary routes not restored'};foreach($File in $Fault.inputs){if((Get-FileHash $File.path).Hash -ne $File.hash){throw 'Original runtime inputs differ'}}}
Check '三轮曾修改的路由均恢复原12配置' $true
foreach($Tag in @('4841e52fcb97','2695c07d96f6','8ac14b181ba1',$Marker)){$Peer=Get-Content (Join-Path $Run "private/a3-peer-auth-$Tag/peer.json") -Raw|ConvertFrom-Json;$Capacity=Get-Content (Join-Path $Run "private/a3-peer-capacity-$Tag.json") -Raw|ConvertFrom-Json;if($Peer.status -ne 'STOPPED' -or $Capacity.status -ne 'RESTORED'){throw 'Peer or capacity incomplete'}}
$Paused="SELECT COUNT(*) FROM sys_job WHERE job_id IN(2002,2003,2004,2005) AND status='PAUSED';"|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names cloud_flow_db
Check '四轮副本和容量恢复且验证任务全部暂停' ($LASTEXITCODE -eq 0 -and "$Paused".Trim() -eq '4')
foreach($Entry in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Original process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5;if($Health.status -ne 'UP'){throw 'Original service health failed'}}
Check '原九进程归属及六服务健康' (@($State.processes).Count -eq 9 -and @($State.services).Count -eq 6)
Check '验证码346到348且原限制100和永久属性恢复' ($Launch.Contains('original_limit=100; original_ttl=-1; counter_before=346; counter_after=348; counter_writes=0; database_unchanged=true'))
Check '713日志与审计对88敏感值泄漏0' ($Log.Contains('files=713; bytes=2065631243; values=88; leaks=0; database_bytes=144535686; database_leaks=0'))
if($Checks.Count -ne 14){throw 'Exactly fourteen closeout checks required'}
$Checks.Add("A3_PRIMARY_CHECKLIST: checks=14; failed=0; actual_successes=69; backend=B10; frontend=F7; production_modified=false; checked_at=$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))")
[IO.File]::WriteAllLines($Output,$Checks,[Text.UTF8Encoding]::new($false))
$Checks

