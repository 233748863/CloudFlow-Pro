param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r143',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r96',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound='r31',
    [switch]$DatabaseOnly)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "e5-marketing-independent-20261010-$Round"
$OriginalRun=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Run=Join-Path $Root ('.cloudflow-runtime/batch-g-integration/'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $Output){throw 'Retain previous independent E5 evidence'}
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
$SourceFiles=@(rg --files scripts -g '*.mjs')+@('scripts/run-e5-marketing-independent.ps1','scripts/owned-layered-artifact.ps1','scripts/platform-checks/ImportIntegrationFixtures.java')+@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/message-checks') -File -Filter 'Message*Checks.java'|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$PackageResultPath=Join-Path $PackageDirectory 'result.json'
$PackageResult=Get-Content -LiteralPath $PackageResultPath -Raw|ConvertFrom-Json
if(-not $PackageResult.Passed -or $PackageResult.BackendRound -ne $BackendRound -or $PackageResult.Services.Count -ne 6){throw 'All six current executable packages must be verified'}
$SourceFiles+=@('scripts/verify-crm-email-database.ps1','scripts/message-checks/CrmEmailSmtpFixture.java','scripts/crm-checks/CrmEmailFoundationChecks.java')+@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/crm-checks') -File -Filter 'CrmEmail*DatabaseChecks.java'|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
$Paths=@($SourceFiles)+(Join-Path $OriginalRun 'state.json')+@($PackageResultPath,(Join-Path $PackageDirectory 'inputs.json'),(Join-Path $PackageDirectory 'original.ps1'))
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
    $Proof=Get-OwnedLayeredArtifact $Jar $ReferenceArtifacts $Hash
    $Layers[$Proof.Path]=$Proof.Files.Count
    $CurrentPackage=@($PackageResult.Services|Where-Object Name -EQ $Service.name)
    if($CurrentPackage.Count -ne 1){throw 'One verified current package required per service'}
    $Built=[IO.Path]::GetFullPath($CurrentPackage[0].Path,$Root)
    $VerifiedJar=Join-Path $PackageDirectory "$($Service.name)/$(Split-Path -Leaf $Built)"
    $CurrentHash=$CurrentPackage[0].Hash.ToLowerInvariant()
    if((Get-FileHash -LiteralPath $Built).Hash -ne $CurrentHash -or (Get-FileHash -LiteralPath $VerifiedJar).Hash -ne $CurrentHash){throw 'Verified current artifact differs from actual build'}
    $Paths+=@($ArgumentsFile,(Join-Path $OriginalRun "$($Service.name)/integration.properties"),$Jar,$Built,$VerifiedJar)
    $Paths+=@($Proof.Files|ForEach-Object{Join-Path $Proof.Path $_.Path})
    $Service|Add-Member -NotePropertyName sourceJar -NotePropertyValue $VerifiedJar
    $Service|Add-Member -NotePropertyName packageHash -NotePropertyValue $CurrentHash
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
        if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Frozen E5 input changed'}
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
$MysqlPort=New-Port;$RedisPort=New-Port;$SmtpPort=New-Port
$SmtpFixture=$null
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
        $Diagnostic=$Stderr.GetAwaiter().GetResult()
        $Code=[regex]::Match($Diagnostic,'ERROR [0-9]+ \([A-Z0-9]+\)').Value
        $Column=[regex]::Match($Diagnostic,"for column '([a-z_][a-z0-9_]*)'").Groups[1].Value
        throw "Independent SQL failed ($Code; column=$Column); raw diagnostics withheld"
    }
    return $Stdout.GetAwaiter().GetResult().Trim()
}
if([IO.Path]::GetFullPath((Sql 'SELECT @@datadir;' $Original.mysqlPort)).TrimEnd('\','/') -ne (Join-Path $OriginalRun 'mysql-data')){throw 'Reference database ownership mismatch'}
$RetainedTables=@('crm_lead','crm_contact','crm_territory','crm_lead_score_rule','crm_campaign','crm_target_list','crm_target_list_member','crm_campaign_target_list','crm_customer','crm_customer_credit','crm_opportunity','crm_opportunity_lost_detail','crm_lost_reason','crm_competitor','crm_quote','crm_quote_line','crm_receivable','crm_approval','oa_contract','sys_business_rule','sys_business_rule_version','sys_business_rule_hit_record','sys_user','sys_user_role','sys_role','sys_role_menu','sys_dept','sys_config','sys_message_record','sys_message_delivery','sys_message_subscribe','crm_campaign_log','crm_mass_email','crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression','crm_deal_team','crm_deal_event','sys_message_channel','sys_message_template')
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
    @{run=$Run;status=$Status;mysqlPort=$MysqlPort;redisPort=$RedisPort;tables=$Tables;smtpFixture=$SmtpFixture;services=@($Services|Select-Object name,module,application,port,healthPort);processes=@($Processes|Select-Object name,id,marker)}|
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
$VerifierHandle=$null
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
    Sql "USE cloud_flow_db; UPDATE sys_job SET status='PAUSED'; UPDATE sys_job SET status='ENABLED' WHERE handler_name IN ('crmMassEmailDispatch','crmCampaignCountAggregate','messageDeliveryRecovery');"|Out-Null
    Write-Output "E5_INDEPENDENT_DATABASE: tables=$Tables; independent_mysql=true; previous_runtime_written=false"
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
        if($Service.name -eq 'auth'){
            $Properties['cloudflow.message.smtp.allowed-hosts']='localhost'
            $Properties['cloudflow.message.smtp.allowed-addresses']='127.0.0.1,::1,0:0:0:0:0:0:0:1'
            $Properties['cloudflow.message.smtp.extra-tls-ports']=[string]$SmtpPort
        }
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

    $NextReceivableId=Sql "SELECT GREATEST(COALESCE((SELECT MAX(receivable_id) FROM cloud_flow_db.crm_receivable),0),COALESCE((SELECT MAX(business_ref_id) FROM cloud_flow_db.crm_approval WHERE business_ref_type='CRM_RECEIVABLE'),0))+1;"
    if($NextReceivableId -notmatch '^[1-9][0-9]*$' -or [decimal]$NextReceivableId -gt [long]::MaxValue){throw 'Independent receivable identity boundary invalid'}
    Sql ("ALTER TABLE cloud_flow_db.crm_receivable AUTO_INCREMENT="+$NextReceivableId+';')|Out-Null
    'E5_INDEPENDENT_IDENTITIES: historical_receivable_ids_reserved=true; original_rows_changed=false'

    $MailDirectory=Join-Path $Run 'private/smtp';[IO.Directory]::CreateDirectory($MailDirectory)|Out-Null
    $MailClasses=Join-Path $Run 'smtp-classes';[IO.Directory]::CreateDirectory($MailClasses)|Out-Null
    $MailPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    [IO.File]::WriteAllText((Join-Path $MailDirectory 'store-password.txt'),$MailPassword,[Text.UTF8Encoding]::new($false))
    $PriorMailPassword=$env:CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD
    try{
        $env:CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD=$MailPassword
        & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $MailDirectory 'tls.p12') -storepass:env CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD -noprompt *> (Join-Path $Run 'smtp-certificate.log')
        if($LASTEXITCODE -ne 0){throw 'Independent E5 SMTP certificate creation failed'}
    }finally{$env:CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD=$PriorMailPassword}
    $MailSources=@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/message-checks') -File -Filter 'Message*Checks.java'|Sort-Object Name)
    $MailCompile=Join-Path $Run 'smtp-compile.args'
    $MailCompileArguments=@('-encoding','UTF-8','-parameters','-cp',('"'+$Dependencies.Replace('\','/')+'"'),'-d',('"'+$MailClasses.Replace('\','/')+'"'))+@($MailSources|ForEach-Object{'"'+$_.FullName.Replace('\','/')+'"'})
    [IO.File]::WriteAllLines($MailCompile,$MailCompileArguments,[Text.UTF8Encoding]::new($false))
    Run-JavaStep $Javac $MailCompile 'smtp-compile'
    $MailArguments=Join-Path $Run 'smtp.args'
    [IO.File]::WriteAllLines($MailArguments,@('-Dfile.encoding=UTF-8','-cp',('"'+($MailClasses+[IO.Path]::PathSeparator+$Dependencies).Replace('\','/')+'"'),'com.cloudflow.auth.message.MessageSmtpFixtureChecks',('"'+$MailDirectory.Replace('\','/')+'"'),[string]$SmtpPort,'14400'),[Text.UTF8Encoding]::new($false))
    $MailProcess=Start-Owned 'smtp-fixture' $Java @('"@'+$MailArguments+'"') $Run $MailArguments 'smtp-'
    $MailReady=$false
    for($Attempt=0;$Attempt -lt 80;$Attempt++){
        if($MailProcess.HasExited){throw 'Independent E5 SMTP process exited'}
        $MailSnapshot=Join-Path $MailDirectory 'snapshot.json'
        if(Test-Path -LiteralPath $MailSnapshot){
            $MailObserved=Get-Content -LiteralPath $MailSnapshot -Raw|ConvertFrom-Json
            if($MailObserved.loopback -and $MailObserved.port -eq $SmtpPort){$MailReady=$true;break}
        }
        Start-Sleep -Milliseconds 250
    }
    if(-not $MailReady){throw 'Independent E5 SMTP readiness failed'}
    $MailListeners=@(Get-NetTCPConnection -State Listen -OwningProcess $MailProcess.Id)
    if($MailListeners.Count -ne 1 -or $MailListeners[0].LocalAddress -ne '127.0.0.1' -or $MailListeners[0].LocalPort -ne $SmtpPort){throw 'Owned loopback SMTP listener required'}
    $SmtpFixture=@{port=$SmtpPort;directory=$MailDirectory;host='localhost';loopback=$true;expiresUtc=[DateTime]::UtcNow.AddSeconds(14400).ToString('o')}
    $AuthArguments=Join-Path $Run 'auth/service.args'
    $Trust=@(('"-Djavax.net.ssl.trustStore='+(Join-Path $MailDirectory 'tls.p12').Replace('\','/')+'"'),"-Djavax.net.ssl.trustStorePassword=$MailPassword")
    [IO.File]::WriteAllLines($AuthArguments,@($Trust)+@([IO.File]::ReadAllLines($AuthArguments)),[Text.UTF8Encoding]::new($false))
    Write-Output 'E5_INDEPENDENT_SMTP: own_fixture=true; loopback=true; tls=true; external_delivery=false'
    Sql @"
USE cloud_flow_db;
INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted) VALUES
(990000840,100000,'营销验收本人范围','e5_marketing_sales',20,'5',4,'0',0),
(990000841,100000,'营销验收部门范围','e5_marketing_manager',21,'3',3,'0',0),
(990000842,100000,'营销验收只读','e5_marketing_readonly',22,'1',0,'0',0);
INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) SELECT 990000840,menu_id,100000 FROM sys_role_menu WHERE tenant_id=100000 AND role_id=9;
INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) SELECT 990000841,menu_id,100000 FROM sys_role_menu WHERE tenant_id=100000 AND role_id=8;
INSERT IGNORE INTO sys_role_menu(role_id,menu_id,tenant_id)
SELECT roles.role_id,menus.menu_id,100000 FROM
(SELECT 990000840 AS role_id UNION ALL SELECT 990000841 UNION ALL SELECT 990000842) roles
CROSS JOIN sys_menu menus
WHERE menus.perms IN ('system:auth:info','system:auth:router','system:lookup:read','system:message:mine:list','crm:lead:list','crm:lead:query','crm:customer:list','crm:customer:query','crm:contact:list','crm:opportunity:list','crm:territory:list','crm:lead-score:list','crm:profile:report','crm:campaign:list','crm:target-list:list','crm:dashboard:view') OR menus.menu_id=8;
INSERT IGNORE INTO sys_role_menu(role_id,menu_id,tenant_id)
SELECT roles.role_id,menus.menu_id,100000 FROM
(SELECT 990000840 AS role_id UNION ALL SELECT 990000841) roles
CROSS JOIN sys_menu menus
WHERE menus.perms IN ('crm:lead:add','crm:lead:edit','crm:lead:remove','crm:lead:convert','crm:lead:qualify','crm:lead:score','crm:customer:add','crm:customer:edit','crm:opportunity:add','crm:opportunity:edit','crm:campaign:edit','crm:target-list:edit');
INSERT IGNORE INTO sys_role_menu(role_id,menu_id,tenant_id)
SELECT 990000841,menu_id,100000 FROM sys_menu WHERE perms IN ('crm:territory:edit','crm:territory:remove','crm:lead-score:edit','crm:lead:assign');
INSERT IGNORE INTO sys_role_menu(role_id,menu_id,tenant_id)
SELECT 990000842,menu_id,100000 FROM sys_menu WHERE perms='system:message:channel:list';
DELETE FROM sys_role_menu WHERE role_id=990000840 AND menu_id IN (SELECT menu_id FROM sys_menu WHERE perms IN ('crm:territory:edit','crm:territory:remove','crm:lead-score:edit','crm:lead:assign','crm:campaign:assign','crm:target-list:assign'));
DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id IN(990000708,990000709,990000704,990000705);
INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(990000708,990000840,100000),(990000709,990000841,100000),(990000704,990000842,100000),(990000705,3,100000);
DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=990000707;
INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(990000707,3,100000);
INSERT INTO sys_dept(dept_id,tenant_id,parent_id,ancestors,dept_name,status,deleted) VALUES(990000840,100000,0,'0','营销验收其他部门','0',0);
UPDATE sys_user SET dept_id=990000840 WHERE tenant_id=100000 AND user_id=990000702;
UPDATE sys_dept SET leader='990000709' WHERE tenant_id=100000 AND dept_id=100;
INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,user_id,employee_status)
VALUES(990000702,100000,'E5_MARKETING_OUTSIDE','营销验收其他部门负责人','MALE',990000840,990000702,'REGULAR'),
(990000705,100000,'E5_MARKETING_FINANCE','营销验收财务','MALE',100,990000705,'REGULAR'),
(990000707,100000,'E5_MARKETING_REVIEWER','营销验收独立财务','MALE',100,990000707,'REGULAR'),
(990000703,100001,'E5_MARKETING_TENANT','营销验收其他租户负责人','MALE',990000101,990000703,'REGULAR');
INSERT INTO crm_sales_stage(tenant_id,stage_code,stage_name,sort_no,default_win_rate,allow_skip_flag,required_fields,required_activity_flag,overdue_days,is_won_flag,is_lost_flag,status,deleted,version,create_by,create_time)
SELECT 100001,stage_code,stage_name,sort_no,default_win_rate,allow_skip_flag,required_fields,required_activity_flag,overdue_days,is_won_flag,is_lost_flag,status,0,0,'E5_MARKETING_FIXTURE',NOW()
FROM crm_sales_stage WHERE tenant_id=100000 AND deleted=0;
"@|Out-Null
    'E5_INDEPENDENT_FIXTURES: own_database_only=true; prior_runtime_written=false; unrelated_jobs_paused=true; marketing_intervals_unchanged=true; captcha_changes=0'

    foreach($Service in @($Services|Where-Object{-not $DatabaseOnly})){
        $Directory=Join-Path $Run $Service.name;$ArgumentFile=Join-Path $Directory 'service.args'
        $ServiceProcess=Start-Owned $Service.name $Java @('"@'+$ArgumentFile+'"') $Directory $ArgumentFile ''
        $Ready=$false
        for($Attempt=0;$Attempt -lt 180;$Attempt++){
            if($ServiceProcess.HasExited){throw "Independent $($Service.name) exited before readiness"}
            try{if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2).status -eq 'UP'){$Ready=$true;break}}catch{}
            Start-Sleep -Seconds 2
        }
        if(-not $Ready){throw "Independent $($Service.name) readiness timeout"}
        Write-Output "E5_INDEPENDENT_SERVICE: name=$($Service.name); healthy=true; independent=true"
    }
    Save-State 'RUNNING'
    foreach($File in @(Get-ChildItem -LiteralPath $Run -Recurse -File|Where-Object{$_.Name -in @('integration.properties','service.args','redisson.json','fixtures.args','fixtures-compile.args','accounts.json','smtp.args','smtp-compile.args','tls.p12','store-password.txt') -or $_.Name -like 'redis-*.conf' -or $_.FullName.StartsWith($Classes+[IO.Path]::DirectorySeparatorChar) -or $_.FullName.StartsWith($MailClasses+[IO.Path]::DirectorySeparatorChar)})){
        $RuntimeInputs.Add([pscustomobject]@{Path=$File.FullName;Hash=(Get-FileHash -LiteralPath $File.FullName).Hash})
    }
    $RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'runtime-inputs.json') -Encoding utf8NoBOM
    Assert-Inputs

    $Log=Join-Path $Output 'live.log'
    if(-not $DatabaseOnly){
        & node scripts/verify-e5-marketing-runtime.mjs (Join-Path $Run 'state.json') $Output before *> (Join-Path $Output 'runtime-before.log')
        if($LASTEXITCODE -ne 0){throw 'Independent E5 runtime preflight failed'}
    }
    & (Join-Path $Root 'scripts/verify-crm-email-database.ps1') -StatePath (Join-Path $Run 'state.json') -OutputPath (Join-Path $Output 'database') -BackendRound $BackendRound *> (Join-Path $Output 'database.log')
    $DatabaseResult=Get-Content -LiteralPath (Join-Path $Output 'database/result.json') -Raw|ConvertFrom-Json
    if(-not $DatabaseResult.passed){throw 'Independent E5 database verification failed'}
    if($DatabaseOnly){
        $VerifierExit=0
        Write-Output "E5_INDEPENDENT_DATABASE_ONLY: passed=true; assertions=$($DatabaseResult.assertions); business_http_executed=false"
    }else{
    $VerifierHandle=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('scripts/verify-e5-marketing.mjs',(Join-Path $Run 'state.json'),$Output,$BackendRound,$FrontendRound) -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $Log -RedirectStandardError (Join-Path $Output 'live.err')
    $VerifierDeadline=[DateTime]::UtcNow.AddMinutes(30)
    while(-not $VerifierHandle.WaitForExit(1000)){
        if([DateTime]::UtcNow -gt $VerifierDeadline){throw 'Independent E5 verifier timeout'}
    }
    $VerifierHandle.Refresh()
    $VerifierExit=$VerifierHandle.ExitCode
    & node scripts/verify-e5-marketing-runtime.mjs (Join-Path $Run 'state.json') $Output after *> (Join-Path $Output 'runtime-after.log')
    $RuntimeExit=$LASTEXITCODE
    $BusinessPath=Join-Path $Output 'result.json'
    if(Test-Path -LiteralPath $BusinessPath){$Business=Get-Content -LiteralPath $BusinessPath -Raw|ConvertFrom-Json -Depth 50}
    if($VerifierExit -ne 0 -or -not $Business -or -not $Business.passed){throw 'Independent E5 business verification failed; original evidence retained'}
    if($RuntimeExit -ne 0){throw 'Independent E5 runtime postflight failed'}
    $RequiredEvidence=@('campaigns','audiences','smtp','publicTracking','scheduling','cancellation','rateLimits','attribution','revenue','retention','reports','audits','permissions','desktop','mobile','preservation','secrets')
    foreach($Flag in $RequiredEvidence){
        if($Business.evidence.$Flag -ne $true){throw 'Independent E5 acceptance coverage incomplete'}
    }
    Write-Output "E5_INDEPENDENT_BUSINESS: passed=true; checks=$($Business.checks.Count); requests=$($Business.requests.Count); actual_http_ui=true"
    }
}catch{$Failure=$_.Exception.Message}
finally{
    if($VerifierHandle -and -not $VerifierHandle.HasExited){$VerifierHandle.Kill($true);$null=$VerifierHandle.WaitForExit(30000)}
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
    $Summary=@{passed=($null -eq $Failure -and $VerifierExit -eq 0 -and $Stopped -and $Unchanged -and $ReferenceKept);failure=$Failure;verifierExit=$VerifierExit;
        inputs=$Inputs.Count;runtimeInputs=$RuntimeInputs.Count;executionOriginals=$SourceFiles.Count;inputsUnchanged=$Unchanged;processesStopped=$Stopped;stopErrors=@($StopErrors);
        run=$Run;backend=$BackendRound;frontend=$FrontendRound;referenceBusinessTables=$RetainedTables.Count;referenceKept=$ReferenceKept;priorRuntimeWritten=$false;databaseRetained=$true;
        captchaCounterWrites=0;captchaConfigurationWrites=0;productModified=$false;globalComplete=$false;externalMessagesSent=$false;systemClockChanged=$false;
        databaseOnly=[bool]$DatabaseOnly;businessHttpExecuted=($null -ne $Business);allE5AcceptanceComplete=$false}
    $Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'launcher-result.json') -Encoding utf8NoBOM
    Write-Output "E5_INDEPENDENT_RUN: passed=$($Summary.passed); inputs=$($Inputs.Count); runtime_inputs=$($RuntimeInputs.Count); unchanged=$Unchanged; processes_stopped=$Stopped; reference_kept=$ReferenceKept"
}
if(-not $Summary.passed){throw "E5 independent marketing failed: $Failure"}
