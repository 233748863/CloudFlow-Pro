param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r116',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r75', [switch]$Repayment, [switch]$ReferralOnly, [switch]$ExitInterviewOnly, [switch]$AssetReminderOnly, [switch]$AdvanceApprovalOnly, [switch]$SkillsOnly, [switch]$AppraisalsOnly)
$ErrorActionPreference='Stop'
if(@($Repayment,$ReferralOnly,$ExitInterviewOnly,$AssetReminderOnly,$AdvanceApprovalOnly,$SkillsOnly,$AppraisalsOnly|Where-Object{$_}).Count -gt 1){throw 'Choose one independent verification mode'}
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence $(if($SkillsOnly){"h2-independent-skills-20261007-$Round"}elseif($AppraisalsOnly){"h2-independent-appraisals-20261007-$Round"}elseif($AdvanceApprovalOnly){"h2-independent-advance-approval-20261007-$Round"}elseif($AssetReminderOnly){"h2-independent-asset-reminder-20261007-$Round"}elseif($ExitInterviewOnly){"h2-independent-exit-interview-20261007-$Round"}elseif($ReferralOnly){"h2-independent-referral-20261007-$Round"}else{"h2-independent-settlement-20261007-$Round"})
$OriginalRun=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Run=Join-Path $Root ('.cloudflow-runtime/batch-g-integration/'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $Output){throw 'Retain previous independent settlement evidence'}
foreach($Directory in @($Output,$Run,(Join-Path $Run 'private'))){
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    if((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected verification directory rejected'}
}
$Access=Get-Acl -LiteralPath $Run
$Access.SetAccessRuleProtection($true,$false)
foreach($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $Run -AclObject $Access
$Original=Get-Content -LiteralPath (Join-Path $OriginalRun 'state.json') -Raw|ConvertFrom-Json
if($Original.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($Original.run) -ne $OriginalRun){throw 'Reference runtime identity mismatch'}
function Assert-OriginalProcesses {
    foreach($Entry in $Original.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Reference process ownership mismatch'}
    }
}
Assert-OriginalProcesses
$RedisOwner=@($Original.processes|Where-Object name -EQ 'redis')
if($RedisOwner.Count -ne 1){throw 'One reference Redis process required'}
$RedisExecutable=(Get-CimInstance Win32_Process -Filter "ProcessId=$($RedisOwner[0].id)").ExecutablePath
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Java=Join-Path $env:JAVA_HOME 'bin/java.exe'
$Javac=Join-Path $env:JAVA_HOME 'bin/javac.exe'
$Processes=[Collections.Generic.List[object]]::new()
$Inputs=[Collections.Generic.List[object]]::new()
$RuntimeInputs=[Collections.Generic.List[object]]::new()
$Layers=@{}
$Services=@($Original.services|Select-Object name,module,application)
if($Services.Count -ne 6 -or (@($Services.name|Sort-Object) -join ',') -ne 'auth,crm,gateway,hr,oa,workflow'){throw 'All six reference services required'}
. (Join-Path $Root 'scripts/owned-layered-artifact.ps1')
$SourceFiles=@(rg --files scripts -g '*.mjs')+@('scripts/run-h2-independent-settlement.ps1','scripts/owned-layered-artifact.ps1','scripts/platform-checks/ImportIntegrationFixtures.java')
$Paths=@($SourceFiles)+(Join-Path $OriginalRun 'state.json')
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    $Paths+=$BuildPath
    foreach($Item in @(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)){
        $FullPath=[IO.Path]::GetFullPath($Item.Path,$Root)
        if((Get-FileHash -LiteralPath $FullPath).Hash -ne $Item.Hash){throw 'Current product differs from verified build'}
        $Paths+=$FullPath
    }
}
foreach($Service in $Services){
    $ArgumentsFile=Join-Path $OriginalRun "$($Service.name)/service.args"
    $Arguments=@(Get-Content -LiteralPath $ArgumentsFile)
    $Index=[Array]::IndexOf($Arguments,'-cp')
    if($Index -lt 0 -or $Arguments[$Index+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Verified layered reference launch required'}
    $ReferenceLayer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    $ReferenceArtifacts=Join-Path $OriginalRun "$($Service.name)/artifacts"
    if((Split-Path -Parent $ReferenceLayer) -ne $ReferenceArtifacts -or (Split-Path -Leaf $ReferenceLayer) -notmatch '^([a-f0-9]{64})-layered$'){throw 'Owned immutable source package required'}
    $Hash=$Matches[1]
    $Jar=Join-Path $ReferenceArtifacts ($Hash+'.jar')
    $Built=Join-Path $Root "cloudflow-backend/$($Service.module)/target/$($Service.module)-1.0.0.jar"
    if((Get-FileHash -LiteralPath $Built).Hash -ne $Hash){throw 'Reference package differs from current build'}
    $Proof=Get-OwnedLayeredArtifact $Jar $ReferenceArtifacts $Hash
    $Layers[$Proof.Path]=$Proof.Files.Count
    $Paths+=@($ArgumentsFile,(Join-Path $OriginalRun "$($Service.name)/integration.properties"),$Jar,$Built)
    $Paths+=@($Proof.Files|ForEach-Object{Join-Path $Proof.Path $_.Path})
    $Service|Add-Member -NotePropertyName sourceJar -NotePropertyValue $Jar
    $Service|Add-Member -NotePropertyName packageHash -NotePropertyValue $Hash
}
foreach($File in @($Paths|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique)){
    $Inputs.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash})
}
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $SourceFiles){
    $Copy=Join-Path $Output "originals/$Source"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Source),$Copy,$false)
}
function Assert-Inputs {
    foreach($Item in @($Inputs.ToArray())+@($RuntimeInputs.ToArray())){
        if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Frozen settlement input changed'}
    }
    foreach($Directory in $Layers.Keys){
        $Actual=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
        if(@($Actual|Where-Object{-not $_.PSIsContainer}).Count -ne $Layers[$Directory] -or @($Actual|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Frozen layered file set changed'}
    }
}
$Ports=[Collections.Generic.HashSet[int]]::new()
function New-Port {
    do{
        $Listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        $Listener.Start()
        try{$Port=$Listener.LocalEndpoint.Port}finally{$Listener.Stop()}
    }while(-not $Ports.Add($Port))
    return $Port
}
$MysqlPort=New-Port;$RedisPort=New-Port
$Data=Join-Path $Run 'mysql-data'
foreach($Service in $Services){
    $Service|Add-Member -NotePropertyName port -NotePropertyValue (New-Port)
    $Service|Add-Member -NotePropertyName healthPort -NotePropertyValue (New-Port)
}
$AuthPort=($Services|Where-Object name -EQ 'auth').port
$JdbcUrl="jdbc:mysql://127.0.0.1:$MysqlPort/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
function Sql([string]$Statement,[int]$Port=$MysqlPort){
    if($Port -ne $MysqlPort -and ($Port -ne $Original.mysqlPort -or $Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S')){throw 'Reference SQL is restricted to one SELECT statement'}
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(120000)){$Child.Kill();$Child.WaitForExit();throw 'Independent SQL timed out'}
    if($Child.ExitCode -ne 0){
        $Code=[regex]::Match($Stderr.GetAwaiter().GetResult(),'ERROR [0-9]+ \([A-Z0-9]+\)').Value
        throw "Independent SQL failed ($Code); raw diagnostics withheld"
    }
    return $Stdout.GetAwaiter().GetResult().Trim()
}
if([IO.Path]::GetFullPath((Sql 'SELECT @@datadir;' $Original.mysqlPort)).TrimEnd('\','/') -ne (Join-Path $OriginalRun 'mysql-data')){throw 'Reference database ownership mismatch'}
$RetainedTables=@('hr_employee','hr_employee_comp','hr_comp_change','hr_salary_slip','hr_payroll_batch','hr_payroll_batch_employee','hr_payroll_period','hr_final_settlement','hr_final_settlement_item','hr_employee_advance','hr_advance_repayment','hr_training_recovery','hr_employee_referral','hr_offer','hr_leave_ledger','hr_leave_quota','biz_payment_request')
$AdditionalTables=@()
if($SkillsOnly){$AdditionalTables=@('hr_skill','hr_employee_skill','hr_position','hr_position_skill','hr_employee','hr_training_course','hr_training_session','hr_training_enrollment','hr_exam_paper','hr_exam_attempt','hr_training_certificate','hr_training_certificate_template','sys_file')}
if($AppraisalsOnly){$AdditionalTables=@('sys_dept','hr_job_level','hr_position','hr_employee','hr_appraisal_cycle','hr_appraisal_kra','hr_appraisal_result','hr_performance_objective','hr_performance_assignment','hr_performance_result','hr_perf_evaluator','hr_perf_evaluator_response','hr_perf_distribution_rule','hr_talent_review','hr_talent_calibration_session','hr_performance_interview','hr_family_member','hr_training_category','hr_training_course','hr_schedule_assignment')}
if($SkillsOnly -or $AppraisalsOnly){$AdditionalTables+=@('sys_user','sys_user_role','sys_role_menu','sys_menu','sys_role')}
foreach($Table in $AdditionalTables){if($Table -cnotin $RetainedTables){$RetainedTables+=$Table}}
if($AdvanceApprovalOnly){$RetainedTables+=@('sys_user','sys_user_role','sys_role','sys_role_menu','sys_dept','sys_config','sys_business_rule','wf_process_definition','wf_process_instance','wf_task')}
if($ReferralOnly){$RetainedTables+=@('hr_candidate','hr_recruitment_identity','hr_recruitment_requisition','hr_position','sys_user','sys_file')}
if($ExitInterviewOnly -or $AssetReminderOnly){$RetainedTables+=@('hr_lifecycle_application','hr_exit_interview','sys_user','sys_user_role','sys_file')}
if($AssetReminderOnly){$RetainedTables+=@('oa_asset','oa_asset_log','oa_asset_movement','oa_borrow_reminder_log')}
function Get-ReferenceBusiness {
    $Result=@{}
    foreach($Table in $RetainedTables){
        $Columns=(Sql "SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$Table' ORDER BY ordinal_position;" $Original.mysqlPort).Split("`n")|ForEach-Object{$_.Trim()}
        if(-not $Columns -or @($Columns|Where-Object{$_ -notmatch '^[a-z_][a-z0-9_]*$'}).Count){throw 'Invalid retained business columns'}
        $PrimaryColumns=@((Sql "SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY' ORDER BY ordinal_position;" $Original.mysqlPort).Trim().Split("`n")|ForEach-Object{$_.Trim()})
        if($PrimaryColumns.Count -eq 0 -or @($PrimaryColumns|Where-Object{$_ -notmatch '^[a-z_][a-z0-9_]*$'}).Count){throw 'Retained primary key columns required'}
        $Primary=($PrimaryColumns|ForEach-Object{'`'+$_+'`'}) -join ','
        $Expression=($Columns|ForEach-Object{'HEX(`'+$_+'`)'} )-join ','
        $Rows=Sql "SELECT SHA2(CAST(JSON_ARRAY($Expression) AS CHAR),256) AS row_hash FROM cloud_flow_db.$Table ORDER BY $Primary;" $Original.mysqlPort
        $Result[$Table]=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Rows)))
    }
    return $Result
}
$BusinessBefore=Get-ReferenceBusiness
$BusinessBefore|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'reference-business-before.json') -Encoding utf8NoBOM
function Save-State([string]$Status){
    @{run=$Run;status=$Status;mysqlPort=$MysqlPort;redisPort=$RedisPort;tables=$Tables;services=@($Services|Select-Object name,module,application,port,healthPort);processes=@($Processes|Select-Object name,id,marker)}|
        ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Run 'state.json') -Encoding utf8NoBOM
}
function Start-Owned([string]$Name,[string]$Executable,[string[]]$Arguments,[string]$Directory,[string]$Marker,[string]$LogPrefix=$Name){
    $Child=Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Directory "${LogPrefix}stdout.log") -RedirectStandardError (Join-Path $Directory "${LogPrefix}stderr.log")
    $Processes.Add([pscustomobject]@{name=$Name;id=$Child.Id;marker=$Marker;handle=$Child})
    Save-State 'STARTING'
    return $Child
}
function Run-JavaStep([string]$Executable,[string]$ArgumentFile,[string]$Name){
    $Child=Start-Process -FilePath $Executable -ArgumentList @('"@'+$ArgumentFile+'"') -WorkingDirectory $Run -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Run "$Name.stdout.log") -RedirectStandardError (Join-Path $Run "$Name.stderr.log")
    if(-not $Child.WaitForExit(120000)){$Child.Kill($true);$Child.WaitForExit();throw 'Independent Java prerequisite timed out'}
    if($Child.ExitCode -ne 0){throw "Independent $Name failed; raw diagnostics retained privately"}
}
$Failure=$null;$VerifierExit=$null;$Stopped=$false;$Unchanged=$false;$ReferenceKept=$false;$Business=$null;$Tables=0
$RepaymentResult=$null;$RepaymentExit=$null
try{
    $Initialize=Start-Process -FilePath $Mysqld -WindowStyle Hidden -Wait -PassThru -ArgumentList @('--no-defaults','--initialize-insecure',"--datadir=`"$Data`"",'--innodb-buffer-pool-size=64M',"--log-error=`"$(Join-Path $Run 'mysql-initialize.log')`"")
    if($Initialize.ExitCode -ne 0){throw 'Independent MySQL initialization failed'}
    $DatabaseProcess=Start-Owned 'mysql' $Mysqld @('--no-defaults',"--datadir=`"$Data`"",'--bind-address=127.0.0.1',"--port=$MysqlPort",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=128M','--max-connections=100',"--log-error=`"$(Join-Path $Run 'mysql.log')`"") $Run $Data
    $Ready=$false
    for($Attempt=0;$Attempt -lt 60;$Attempt++){
        try{if((Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        if($DatabaseProcess.HasExited){throw 'Independent database exited'}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data){throw 'Independent database readiness or identity failed'}
    $Scripts=@(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File|Where-Object Name -Match '^0[1-6]\.'|Sort-Object Name)
    if($Scripts.Count -ne 6){throw 'Six formal SQL scripts required'}
    $Expected=0
    foreach($Script in $Scripts){
        $Text=[IO.File]::ReadAllText($Script.FullName)
        $Expected += [regex]::Matches($Text,'(?m)^CREATE TABLE ').Count
        if(-not $Script.Name.StartsWith('01.')){$Text="USE cloud_flow_db;`n"+$Text}
        Sql $Text|Out-Null
    }
    $Tables=[int](Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")
    if($Tables -ne $Expected -or $Tables -ne 374){throw 'Approved formal table count mismatch'}
    Sql "USE cloud_flow_db; UPDATE sys_job SET status='PAUSED';"|Out-Null
    Write-Output "H2_INDEPENDENT_DATABASE: tables=$Tables; independent_mysql=true; previous_runtime_written=false"
    $RedisSecret=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $RedisConfigName='redis-'+(Split-Path -Leaf $Run)+'.conf'
    $RedisConfig=Join-Path $Run $RedisConfigName
    [IO.File]::WriteAllLines($RedisConfig,@('bind 127.0.0.1','protected-mode yes',"port $RedisPort","requirepass $RedisSecret",'appendonly no','save ""','logfile "redis.log"'),[Text.UTF8Encoding]::new($false))
    $Redis=Start-Owned 'redis' $RedisExecutable @($RedisConfigName) $Run $RedisConfigName
    $Ready=$false
    for($Attempt=0;$Attempt -lt 30;$Attempt++){
        $Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $RedisPort -ErrorAction SilentlyContinue)
        if($Listeners.Count -eq 1 -and $Listeners[0].OwningProcess -eq $Redis.Id -and $Listeners[0].LocalAddress -eq '127.0.0.1'){$Ready=$true;break}
        if($Redis.HasExited){throw 'Independent Redis exited'}
        Start-Sleep -Milliseconds 300
    }
    if(-not $Ready){throw 'Independent Redis readiness failed'}
    $RedisPool=Join-Path $Run 'private/redisson.json'
    @{singleServerConfig=@{address="redis://127.0.0.1:$RedisPort";password=$RedisSecret;database=0;connectionMinimumIdleSize=2;connectionPoolSize=8;subscriptionConnectionMinimumIdleSize=1;subscriptionConnectionPoolSize=2};threads=4;nettyThreads=4}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $RedisPool -Encoding utf8NoBOM
    $Keys=@{}
    foreach($App in $Services|Where-Object name -NE 'gateway'){$Keys[$App.application]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))}
    $SharedSecrets=@{'cloudflow.file-storage.secret-key'=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32));'cloudflow.message.secret-key'=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32));'cloudflow.encrypt.aes-key'=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))}
    foreach($Service in $Services){
        $Directory=Join-Path $Run $Service.name
        $Artifacts=Join-Path $Directory 'artifacts'
        [IO.Directory]::CreateDirectory($Artifacts)|Out-Null
        $Jar=Join-Path $Artifacts ($Service.packageHash+'.jar')
        [IO.File]::Copy($Service.sourceJar,$Jar,$false)
        $Proof=Get-OwnedLayeredArtifact $Jar $Artifacts $Service.packageHash
        $Layers[$Proof.Path]=$Proof.Files.Count
        $Service|Add-Member -NotePropertyName layeredPath -NotePropertyValue $Proof.Path
        $RuntimeInputs.Add([pscustomobject]@{Path=$Jar;Hash=(Get-FileHash -LiteralPath $Jar).Hash})
        foreach($File in $Proof.Files){$RuntimeInputs.Add([pscustomobject]@{Path=(Join-Path $Proof.Path $File.Path);Hash=$File.Hash})}
        $Properties=@{}
        foreach($Line in Get-Content -LiteralPath (Join-Path $OriginalRun "$($Service.name)/integration.properties")){
            if($Line -match '^([^#=]+)=(.*)$'){$Properties[$Matches[1]]=$Matches[2].Replace($OriginalRun.Replace('\','/'),$Run.Replace('\','/')).Replace($OriginalRun,$Run)}
        }
        foreach($Key in @('spring.datasource.url','spring.datasource.dynamic.datasource.master.url','DB_URL')){$Properties[$Key]=$JdbcUrl}
        foreach($Key in @('spring.datasource.username','spring.datasource.dynamic.datasource.master.username','DB_USERNAME')){$Properties[$Key]='root'}
        foreach($Key in @('spring.datasource.password','spring.datasource.dynamic.datasource.master.password','DB_PASSWORD')){$Properties[$Key]=''}
        foreach($Key in @('spring.data.redis.port','REDIS_PORT')){$Properties[$Key]=[string]$RedisPort}
        foreach($Key in @('spring.data.redis.password','REDIS_PASSWORD')){$Properties[$Key]=$RedisSecret}
        $Properties['spring.redis.redisson.file']='file:'+$RedisPool.Replace('\','/')
        $Properties['cloudflow.job.auth-url']="http://127.0.0.1:$AuthPort"
        $Properties['cloudflow.portal.enabled']='false';$Properties['cloudflow.portal.public-url']='http://127.0.0.1:1'
        $Properties['server.address']='127.0.0.1';$Properties['management.server.address']='127.0.0.1'
        $Properties['server.port']=[string]$Service.port;$Properties['management.server.port']=[string]$Service.healthPort
        foreach($App in $Services){$Properties["spring.cloud.discovery.client.simple.instances.$($App.application)[0].uri"]="http://127.0.0.1:$($App.port)"}
        foreach($Name in $Keys.Keys){$Properties["cloudflow.job.internal-auth.keys.$Name"]=$Keys[$Name]}
        foreach($Name in $SharedSecrets.Keys){$Properties[$Name]=$SharedSecrets[$Name]}
        $Config=Join-Path $Directory 'integration.properties'
        $Lines=@($Properties.Keys|Sort-Object|ForEach-Object{"$_=$($Properties[$_])"})
        $ConfigText=$Lines -join "`n"
        if($ConfigText.Contains((Split-Path -Leaf $OriginalRun))){throw 'Independent configuration retains original directory reference'}
        foreach($OldPort in @($Original.mysqlPort,$Original.redisPort)+@($Original.services|ForEach-Object{$_.port;$_.healthPort})){
            if($ConfigText -match ":$OldPort\b"){throw 'Independent configuration retains original connection'}
        }
        [IO.File]::WriteAllLines($Config,$Lines,[Text.UTF8Encoding]::new($false))
        $ArgumentFile=Join-Path $Directory 'service.args'
        [IO.File]::WriteAllLines($ArgumentFile,@('-Xms64m','-Xmx384m','-Dfile.encoding=UTF-8','-cp',('"'+$Proof.Path.Replace('\','/')+'"'),'org.springframework.boot.loader.launch.JarLauncher',('"--spring.config.additional-location=file:'+$Config.Replace('\','/')+'"'),'--spring.cloud.nacos.config.enabled=false','--spring.cloud.nacos.discovery.enabled=false','--spring.cloud.nacos.config.import-check.enabled=false'),[Text.UTF8Encoding]::new($false))
    }
    $AuthLayer=($Services|Where-Object name -EQ 'auth').layeredPath
    $Classes=Join-Path $Run 'fixture-classes';[IO.Directory]::CreateDirectory($Classes)|Out-Null
    $Libraries=@(Get-ChildItem -LiteralPath (Join-Path $AuthLayer 'BOOT-INF/lib') -File -Filter '*.jar'|Sort-Object Name|ForEach-Object FullName)
    if($Libraries.Count -eq 0){throw 'Actual packaged fixture dependencies required'}
    $Dependencies=(@((Join-Path $AuthLayer 'BOOT-INF/classes'))+$Libraries)-join [IO.Path]::PathSeparator
    $CompileFile=Join-Path $Run 'fixtures-compile.args'
    [IO.File]::WriteAllLines($CompileFile,@('-encoding','UTF-8','-cp',('"'+$Dependencies.Replace('\','/')+'"'),'-d',('"'+$Classes.Replace('\','/')+'"'),('"'+(Join-Path $Root 'scripts/platform-checks/ImportIntegrationFixtures.java').Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    Run-JavaStep $Javac $CompileFile 'fixture-compile'
    $FixtureFile=Join-Path $Run 'fixtures.args'
    [IO.File]::WriteAllLines($FixtureFile,@('-Dfile.encoding=UTF-8','-cp',('"'+($Classes+[IO.Path]::PathSeparator+$Dependencies).Replace('\','/')+'"'),'com.cloudflow.auth.storage.ImportIntegrationFixtures',('"'+$JdbcUrl+'"'),('"'+$Run.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    Run-JavaStep $Java $FixtureFile 'fixture-prepare'
    foreach($Service in $Services){
        $Directory=Join-Path $Run $Service.name;$ArgumentFile=Join-Path $Directory 'service.args'
        $ServiceProcess=Start-Owned $Service.name $Java @('"@'+$ArgumentFile+'"') $Directory $ArgumentFile ''
        $Ready=$false
        for($Attempt=0;$Attempt -lt 180;$Attempt++){
            if($ServiceProcess.HasExited){throw "Independent $($Service.name) exited before readiness"}
            try{if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2).status -eq 'UP'){$Ready=$true;break}}catch{}
            Start-Sleep -Seconds 2
        }
        if(-not $Ready){throw "Independent $($Service.name) readiness timeout"}
        Write-Output "H2_INDEPENDENT_SERVICE: name=$($Service.name); healthy=true; independent=true"
    }
    Save-State 'RUNNING'
    foreach($File in @(Get-ChildItem -LiteralPath $Run -Recurse -File|Where-Object{$_.Name -in @('integration.properties','service.args','redisson.json','fixtures.args','fixtures-compile.args','accounts.json') -or $_.Name -like 'redis-*.conf' -or $_.FullName.StartsWith($Classes+[IO.Path]::DirectorySeparatorChar)})){
        $RuntimeInputs.Add([pscustomobject]@{Path=$File.FullName;Hash=(Get-FileHash -LiteralPath $File.FullName).Hash})
    }
    $RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'runtime-inputs.json') -Encoding utf8NoBOM
    Assert-Inputs
    $Log=Join-Path $Output 'live.log'
    & node scripts/verify-h2-independent-runtime.mjs (Join-Path $Run 'state.json') $Output before *> (Join-Path $Output 'runtime-before.log')
    if($LASTEXITCODE -ne 0){throw 'Independent runtime preflight failed'}
    if($SkillsOnly){
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-skills-only *> $Log
    }elseif($AppraisalsOnly){
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-appraisals-only *> $Log
    }elseif($AdvanceApprovalOnly){
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-advance-approval-only *> $Log
    }elseif($AssetReminderOnly){
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-settlement-draft-only --hr-settlement-draft-complete --hr-settlement-asset-reminder-only *> $Log
    }elseif($ExitInterviewOnly){
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-exit-interviews-only --hr-exit-interviews-complete *> $Log
    }elseif($ReferralOnly){
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-referrals-core-only --hr-referrals-ui --hr-referrals-complete --hr-referrals-bonus-ui --hr-referral-name-length=100 *> $Log
    }else{
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-advance-approval-http-only --hr-advance-settlement --hr-advance-settlement-payroll --hr-advance-settlement-all-sources --hr-settlement-referral --hr-settlement-reversal-complete *> $Log
    }
    $VerifierExit=$LASTEXITCODE
    & node scripts/verify-h2-independent-runtime.mjs (Join-Path $Run 'state.json') $Output after *> (Join-Path $Output 'runtime-after.log')
    $RuntimeExit=$LASTEXITCODE
    $Content=Get-Content -LiteralPath $Log -Raw
    if($SkillsOnly -or $AppraisalsOnly){
        $Category=if($SkillsOnly){'h2-skills'}else{'h2-appraisals'}
        $SuiteResults=@(Get-ChildItem -LiteralPath $Run -File -Filter "$Category-results-*.json")
        if($SuiteResults.Count -eq 1){
            $SuiteResult=Get-Content -LiteralPath $SuiteResults[0].FullName -Raw|ConvertFrom-Json
            $Business=@{checks=$SuiteResult.checks.Count;failed=$(if($SuiteResult.passed){0}else{1});requests=$SuiteResult.requests.Count;evidence=$SuiteResult.evidence}
            [IO.File]::Copy($SuiteResults[0].FullName,(Join-Path $Output 'business-result.json'),$false)
        }
    }elseif($AdvanceApprovalOnly){
        $AdvanceResults=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-advance-approval-results-*.json')
        if($AdvanceResults.Count -eq 1){
            $AdvanceResult=Get-Content -LiteralPath $AdvanceResults[0].FullName -Raw|ConvertFrom-Json
            $Business=@{checks=$AdvanceResult.checks.Count;failed=$(if($AdvanceResult.passed){0}else{1});requests=$AdvanceResult.requests.Count;evidence=$AdvanceResult.evidence}
            [IO.File]::Copy($AdvanceResults[0].FullName,(Join-Path $Output 'business-result.json'),$false)
        }
    }elseif($AssetReminderOnly){
        $AssetResults=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-settlement-draft-results-*.json')
        if($AssetResults.Count -eq 1){
            $AssetResult=Get-Content -LiteralPath $AssetResults[0].FullName -Raw|ConvertFrom-Json
            $Business=@{checks=$AssetResult.checks.Count;failed=$(if($AssetResult.passed){0}else{1});requests=$AssetResult.requests.Count;evidence=$AssetResult.evidence}
            [IO.File]::Copy($AssetResults[0].FullName,(Join-Path $Output 'business-result.json'),$false)
        }
    }elseif($ExitInterviewOnly){
        $InterviewResults=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-exit-interviews-results-*.json')
        if($InterviewResults.Count -eq 1){
            $InterviewResult=Get-Content -LiteralPath $InterviewResults[0].FullName -Raw|ConvertFrom-Json
            $Business=@{checks=$InterviewResult.checks.Count;failed=$(if($InterviewResult.passed){0}else{1});requests=$InterviewResult.requests.Count;evidence=$InterviewResult.evidence}
            [IO.File]::Copy($InterviewResults[0].FullName,(Join-Path $Output 'business-result.json'),$false)
        }
    }elseif($ReferralOnly){
        $ReferralResults=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-referrals-core-results-*.json')
        if($ReferralResults.Count -eq 1){
            $ReferralResult=Get-Content -LiteralPath $ReferralResults[0].FullName -Raw|ConvertFrom-Json
            $Business=@{checks=$ReferralResult.checks.Count;failed=$(if($ReferralResult.passed){0}else{1});requests=$ReferralResult.requests.Count;caseTag=$ReferralResult.caseTag}
            [IO.File]::Copy($ReferralResults[0].FullName,(Join-Path $Output 'business-result.json'),$false)
        }
    }elseif($Content -match '(?m)^H2_ADVANCE_APPROVAL_REAL_RESULT: checks=(\d+); failed=(\d+); requests=(\d+);.*?evidence=(\{.*\}); successful_business_response_doubles=0;'){
        $Business=@{checks=[int]$Matches[1];failed=[int]$Matches[2];requests=[int]$Matches[3];evidence=($Matches[4]|ConvertFrom-Json)}
        $Business|ConvertTo-Json -Depth 40|Set-Content -LiteralPath (Join-Path $Output 'business-result.json') -Encoding utf8NoBOM
    }
    if($VerifierExit -ne 0 -or -not $Business -or $Business.failed -ne 0){throw 'Independent settlement business verification failed; original evidence retained'}
    if($RuntimeExit -ne 0){throw 'Independent runtime postflight failed'}
    if($SkillsOnly -or $AppraisalsOnly){
        $Flags=if($SkillsOnly){@('definitions','fiveSources','permissions','expiry','recommendations','concurrency','desktop','mobile','lostResponse','restoration','secrets')}else{@('scope','weights','stages','scores','calibration','frozen','identity','tenants','allMethods','invitations','concurrent','customerDisabled','legacy','desktop','mobile','lostResponse','uiLifecycle','adjacentDeletion','restoration','secrets')}
        foreach($Flag in $Flags){if($Business.evidence.$Flag -ne $true){throw 'Skill/appraisal verification incomplete'}}
        $ExpectedTables=if($SkillsOnly){13}else{20}
        if($Business.evidence.preservation.tables -ne $ExpectedTables -or -not $Business.evidence.preservation.kept){throw 'Skill/appraisal business restoration incomplete'}
        Write-Output "H2_INDEPENDENT_SKILL_APPRAISAL: category=$Category; checks=$($Business.checks); requests=$($Business.requests); passed=true; actual_http_ui=true"
    }elseif($AdvanceApprovalOnly){
        foreach($Flag in @('rules','approval','funding','rejections','delayedCallback','settlementGuard','paymentRollback','paymentReplay','concurrency','permissions','tenants','http','desktop','mobile','cleanup','lostResponse')){if($Business.evidence.$Flag -ne $true){throw 'Advance approval verification incomplete'}}
        Write-Output "H2_INDEPENDENT_ADVANCE_APPROVAL: checks=$($Business.checks); requests=$($Business.requests); passed=true; actual_http_ui_funding=true"
    }elseif($AssetReminderOnly){
        foreach($Flag in @('http','desktop','mobile','lostResponse','uiComplete','assetReminder','assetReminderRollback','assetReminderLostResponse','assetReview','assetDisposition','restoration')){if($Business.evidence.$Flag -ne $true){throw 'Asset reminder verification incomplete'}}
        Write-Output "H2_INDEPENDENT_ASSET_REMINDER: checks=$($Business.checks); requests=$($Business.requests); passed=true; actual_http_ui_messages=true"
    }elseif($ExitInterviewOnly){
        foreach($Flag in @('http','desktop','mobile','lostResponse','uiComplete','restoration')){if($Business.evidence.$Flag -ne $true){throw 'Exit interview verification incomplete'}}
        Write-Output "H2_INDEPENDENT_EXIT_INTERVIEW: checks=$($Business.checks); requests=$($Business.requests); passed=true; actual_http_ui=true"
    }elseif($ReferralOnly){
        if($Content -notmatch 'H2_REFERRAL_CORE_REAL_RESULT: checks=\d+; failed=0; requests=\d+; real_http=true; workflow_hire_bonus_tested=true;' -or $Content -notmatch 'H2_REFERRAL_COMPLETION_CLEANUP: configuration_restored=true;' -or $Content -notmatch 'H2_REFERRAL_HTTP_CLEANUP:'){throw 'Independent referral completion or restoration evidence missing'}
        Write-Output "H2_INDEPENDENT_REFERRAL: checks=$($Business.checks); requests=$($Business.requests); passed=true; actual_hire_bonus_payroll=true"
    }else{
    foreach($Flag in @('resignationApproved','resignationCompleted','restoration','secrets','payrollCombination','leaveTrainingCombination','referralCombination')){
        if($Business.evidence.combination.$Flag -ne $true){throw 'Independent settlement completion evidence missing'}
    }
    if(-not $Business.evidence.combination.settlement.reversalRestoredSources -or -not $Business.evidence.combination.preservation.kept -or $Content -notmatch '"leaks":0,"databaseLeaks":0'){throw 'Settlement reversal, preservation or secret evidence missing'}
    Write-Output "H2_INDEPENDENT_BUSINESS: checks=$($Business.checks); requests=$($Business.requests); passed=true; actual_referral_payroll_settlement=true"
    if($Repayment){
        Assert-Inputs
        $OriginalResults=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-settlement-referral-results-*.json')
        if($OriginalResults.Count -ne 1){throw 'One initial independent combination required'}
        $OriginalResult=Get-Content -LiteralPath $OriginalResults[0].FullName -Raw|ConvertFrom-Json
        if(-not $OriginalResult.passed -or $OriginalResult.caseTag -notmatch '^[a-f0-9]{12}$' -or $OriginalResult.checks.Count -ne $Business.checks){throw 'Original combination result mismatch'}
        $OriginalResultHash=(Get-FileHash -LiteralPath $OriginalResults[0].FullName).Hash
        & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --hr-advance-approval-http-only --hr-advance-settlement --hr-advance-settlement-payroll --hr-advance-settlement-all-sources --hr-settlement-referral --hr-settlement-reversal-complete "--hr-referral-repay=$($OriginalResult.caseTag)" *> (Join-Path $Output 'repayment.log')
        $RepaymentExit=$LASTEXITCODE
        & node scripts/verify-h2-independent-runtime.mjs (Join-Path $Run 'state.json') $Output after-repayment *> (Join-Path $Output 'runtime-after-repayment.log')
        $RepaymentRuntimeExit=$LASTEXITCODE
        $RepaymentFiles=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-settlement-referral-repay-results-*.json')
        if($RepaymentFiles.Count -eq 1){
            $RepaymentResult=Get-Content -LiteralPath $RepaymentFiles[0].FullName -Raw|ConvertFrom-Json
            [IO.File]::Copy($RepaymentFiles[0].FullName,(Join-Path $Output 'repayment-result.json'),$false)
        }
        if($RepaymentExit -ne 0 -or $RepaymentRuntimeExit -ne 0 -or -not $RepaymentResult -or -not $RepaymentResult.passed){throw 'Independent repayment failed; original evidence retained'}
        foreach($Flag in @('independentApproval','posted','replayed','closed','historyPreserved','restoration','secrets')){
            if($RepaymentResult.evidence.repayment.$Flag -ne $true){throw 'Independent repayment evidence missing'}
        }
        if($RepaymentResult.evidence.repayment.previous -ne $OriginalResult.caseTag -or $RepaymentResult.evidence.repayment.amount -ne $RepaymentResult.evidence.repayment.expectedAmount -or (Get-FileHash -LiteralPath $OriginalResults[0].FullName).Hash -ne $OriginalResultHash){throw 'Repayment source or original result changed'}
        Write-Output "H2_INDEPENDENT_REPAYMENT: checks=$($RepaymentResult.checks.Count); requests=$($RepaymentResult.requests.Count); amount=$($RepaymentResult.evidence.repayment.amount); passed=true"
    }
    }
}catch{$Failure=$_.Exception.Message}
finally{
    $StopErrors=[Collections.Generic.List[string]]::new()
    foreach($Owned in @($Processes.ToArray()|Sort-Object {if($_.name -eq 'mysql'){2}elseif($_.name -eq 'redis'){1}else{0}})){
        try{
            $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)"
            if($Current){
                if(-not $Current.CommandLine.Contains($Owned.marker)){throw 'Process ownership changed'}
                $Owned.handle.Kill($true)
            }
            if(-not $Owned.handle.WaitForExit(30000)){throw 'Owned process did not stop'}
            $Owned.handle.Refresh()
        }catch{$StopErrors.Add($Owned.name)}
    }
    $Stopped=$StopErrors.Count -eq 0
    Save-State $(if($Stopped){'STOPPED'}else{'STOP_FAILED'})
    try{Assert-Inputs;$Unchanged=$true}catch{$Failure='Frozen input check failed'}
    try{
        Assert-OriginalProcesses
        foreach($Service in $Original.services){if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -ne 'UP'){throw 'Reference health changed'}}
        $BusinessAfter=Get-ReferenceBusiness
        $BusinessAfter|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'reference-business-after.json') -Encoding utf8NoBOM
        foreach($Table in $RetainedTables){if($BusinessBefore[$Table] -ne $BusinessAfter[$Table]){throw 'Reference business changed'}}
        $ReferenceKept=$true
    }catch{$Failure='Reference environment preservation check failed'}
    $Summary=@{passed=($null -eq $Failure -and $VerifierExit -eq 0 -and $Stopped -and $Unchanged -and $ReferenceKept -and (-not $Repayment -or ($RepaymentExit -eq 0 -and $RepaymentResult.passed)));failure=$Failure;verifierExit=$VerifierExit;
        inputs=$Inputs.Count;runtimeInputs=$RuntimeInputs.Count;executionOriginals=$SourceFiles.Count;inputsUnchanged=$Unchanged;processesStopped=$Stopped;stopErrors=@($StopErrors);
        run=$Run;backend=$BackendRound;frontend=$FrontendRound;referenceBusinessTables=$RetainedTables.Count;referenceKept=$ReferenceKept;priorRuntimeWritten=$false;databaseRetained=$true;
        captchaCounterWrites=0;captchaConfigurationWrites=0;productModified=$false;globalComplete=$false;referralOnly=[bool]$ReferralOnly;exitInterviewOnly=[bool]$ExitInterviewOnly;assetReminderOnly=[bool]$AssetReminderOnly;advanceApprovalOnly=[bool]$AdvanceApprovalOnly;skillsOnly=[bool]$SkillsOnly;appraisalsOnly=[bool]$AppraisalsOnly;repaymentRequested=[bool]$Repayment;repaymentExit=$RepaymentExit;repaymentPassed=[bool]($RepaymentResult -and $RepaymentResult.passed)}
    $Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'launcher-result.json') -Encoding utf8NoBOM
    Write-Output "H2_INDEPENDENT_RUN: passed=$($Summary.passed); inputs=$($Inputs.Count); runtime_inputs=$($RuntimeInputs.Count); unchanged=$Unchanged; processes_stopped=$Stopped; reference_kept=$ReferenceKept"
}
if(-not $Summary.passed){throw "H2 independent settlement failed: $Failure"}
