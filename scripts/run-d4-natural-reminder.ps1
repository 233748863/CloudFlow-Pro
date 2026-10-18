param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r110',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r70')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d4-natural-reminder-20261006-$Round"
$OriginalRun=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Run=Join-Path $Root ('.cloudflow-runtime/d4-natural-reminder/'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $Output){throw 'Retain prior natural daily evidence'}
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
$RedisOwner=@($Original.processes|Where-Object name -EQ 'redis')
$RedisProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($RedisOwner[0].id)"
if($RedisOwner.Count -ne 1 -or -not $RedisProcess -or -not $RedisProcess.CommandLine.Contains($RedisOwner[0].marker)){throw 'Reference Redis executable ownership mismatch'}
$RedisExecutable=$RedisProcess.ExecutablePath
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Java=Join-Path $env:JAVA_HOME 'bin/java.exe'
$Processes=[Collections.Generic.List[object]]::new()
$Inputs=[Collections.Generic.List[object]]::new()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    foreach($Item in @(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)){$Inputs.Add($Item)}
}
$Paths=@('scripts/run-d4-natural-reminder.ps1','scripts/verify-d4-natural-reminder.mjs','scripts/job-internal-signing.mjs','scripts/portal-checks/scan-access-logs.mjs','.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-cli.exe')
$Services=@($Original.services|Where-Object name -In @('auth','hr'))
if($Services.Count -ne 2){throw 'Two reference services required'}
foreach($Service in $Services){
    $ArgumentFile=Join-Path $OriginalRun "$($Service.name)/service.args"
    $Arguments=@(Get-Content -LiteralPath $ArgumentFile)
    $CpIndex=[Array]::IndexOf($Arguments,'-cp')
    if($CpIndex -lt 0){throw 'Reference classpath missing'}
    $ClassPath=$Arguments[$CpIndex+1].Trim('"')
    $Service|Add-Member -NotePropertyName verifiedClasspath -NotePropertyValue $ClassPath
    $Paths+=@($ArgumentFile,(Join-Path $OriginalRun "$($Service.name)/integration.properties"))
    foreach($Entry in $ClassPath.Split([IO.Path]::PathSeparator)){
        if(-not (Test-Path -LiteralPath $Entry) -or [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Existing data-drive compiled dependency required'}
        if(Test-Path -LiteralPath $Entry -PathType Container){$Paths+=@(Get-ChildItem -LiteralPath $Entry -File -Recurse|ForEach-Object FullName)}else{$Paths+=$Entry}
    }
}
foreach($File in @($Paths|Sort-Object -Unique)){$Inputs.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash})}
function Assert-Inputs {
    foreach($Item in $Inputs){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw 'Frozen natural daily input changed'}
    }
}
Assert-Inputs
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Name in @('run-d4-natural-reminder.ps1','verify-d4-natural-reminder.mjs')){
    [IO.File]::Copy((Join-Path $Root "scripts/$Name"),(Join-Path $Output "original-$Name"),$false)
}
function New-Port {
    $Listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    $Listener.Start()
    try{return $Listener.LocalEndpoint.Port}finally{$Listener.Stop()}
}
$MysqlPort=New-Port
$RedisPort=New-Port
$Data=Join-Path $Run 'mysql-data'
$RedisSecret=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$SharedMessageSecret=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$Keys=@{}
foreach($Name in @('cloudflow-auth','cloudflow-service-hr','cloudflow-service-oa','cloudflow-service-crm','cloudflow-service-workflow')){
    $Keys[$Name]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
}
foreach($Service in $Services){$Service.port=New-Port;$Service.healthPort=New-Port}
$AuthPort=($Services|Where-Object name -EQ 'auth').port
function Sql([string]$Statement){
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$MysqlPort",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(120000)){$Child.Kill();throw 'Independent SQL timed out'}
    if($Child.ExitCode -ne 0){throw 'Independent SQL failed; raw diagnostics withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
function Start-Owned([string]$Name,[string]$Executable,[string[]]$Arguments,[string]$Directory,[string]$Marker){
    $Child=Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Directory "$Name.stdout.log") -RedirectStandardError (Join-Path $Directory "$Name.stderr.log")
    $Processes.Add([pscustomobject]@{name=$Name;id=$Child.Id;marker=$Marker;handle=$Child})
    return $Child
}
$Failure=$null;$VerifierExit=$null;$Stopped=$false
try{
    $Initialize=Start-Process -FilePath $Mysqld -WindowStyle Hidden -Wait -PassThru -ArgumentList @('--no-defaults','--initialize-insecure',"--datadir=`"$Data`"",'--innodb-buffer-pool-size=64M',"--log-error=`"$(Join-Path $Run 'mysql-initialize.log')`"")
    if($Initialize.ExitCode -ne 0){throw 'Independent MySQL initialization failed'}
    $DatabaseProcess=Start-Owned 'mysql' $Mysqld @('--no-defaults',"--datadir=`"$Data`"",'--bind-address=127.0.0.1',"--port=$MysqlPort",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=128M','--max-connections=60',"--log-error=`"$(Join-Path $Run 'mysql.log')`"") $Run $Data
    $Ready=$false
    for($Attempt=0;$Attempt -lt 60;$Attempt++){
        try{if((Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        if($DatabaseProcess.HasExited){throw 'Independent database exited'}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data){throw 'Independent database readiness or identity failed'}
    $Scripts=@(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File|Where-Object Name -Match '^0[1-6]\.'|Sort-Object Name)
    $Expected=0
    foreach($Script in $Scripts){
        $Text=[IO.File]::ReadAllText($Script.FullName)
        $Expected += [regex]::Matches($Text,'(?m)^CREATE TABLE ').Count
        if(-not $Script.Name.StartsWith('01.')){$Text="USE cloud_flow_db;`n"+$Text}
        Sql $Text|Out-Null
    }
    $Tables=[int](Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")
    if($Tables -ne $Expected){throw 'Formal table count mismatch'}
    Sql "USE cloud_flow_db; UPDATE sys_job SET status='PAUSED';"|Out-Null
    Write-Output "D4_NATURAL_DATABASE: tables=$Tables; independent_mysql=true; previous_runtime_written=false"
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
    foreach($Service in $Services){
        $Directory=Join-Path $Run $Service.name
        [IO.Directory]::CreateDirectory($Directory)|Out-Null
        $Properties=@{}
        foreach($Line in Get-Content -LiteralPath (Join-Path $OriginalRun "$($Service.name)/integration.properties")){
            if($Line -match '^([^#=]+)=(.*)$'){$Properties[$Matches[1]]=$Matches[2].Replace($OriginalRun.Replace('\','/'),$Run.Replace('\','/')).Replace($OriginalRun,$Run)}
        }
        $Url="jdbc:mysql://127.0.0.1:$MysqlPort/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
        foreach($Key in @('spring.datasource.url','spring.datasource.dynamic.datasource.master.url','DB_URL')){$Properties[$Key]=$Url}
        foreach($Key in @('spring.datasource.username','spring.datasource.dynamic.datasource.master.username','DB_USERNAME')){$Properties[$Key]='root'}
        foreach($Key in @('spring.datasource.password','spring.datasource.dynamic.datasource.master.password','DB_PASSWORD')){$Properties[$Key]=''}
        foreach($Key in @('spring.data.redis.port','REDIS_PORT')){$Properties[$Key]=[string]$RedisPort}
        foreach($Key in @('spring.data.redis.password','REDIS_PASSWORD')){$Properties[$Key]=$RedisSecret}
        $Properties['spring.redis.redisson.file']='file:'+$RedisPool.Replace('\','/')
        $Properties['cloudflow.job.auth-url']="http://127.0.0.1:$AuthPort"
        $Properties['cloudflow.workflow.callback.enabled']='false'
        $Properties['server.address']='127.0.0.1';$Properties['management.server.address']='127.0.0.1'
        $Properties['server.port']=[string]$Service.port;$Properties['management.server.port']=[string]$Service.healthPort
        foreach($App in $Original.services){
            $Available=@($Services|Where-Object name -EQ $App.name)
            $TargetPort=if($Available.Count -eq 1){$Available[0].port}else{1}
            $Properties["spring.cloud.discovery.client.simple.instances.$($App.application)[0].uri"]="http://127.0.0.1:$TargetPort"
        }
        foreach($Name in $Keys.Keys){$Properties["cloudflow.job.internal-auth.keys.$Name"]=$Keys[$Name]}
        foreach($Key in @('cloudflow.file-storage.secret-key','cloudflow.message.secret-key')){$Properties[$Key]=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))}
        $Properties['cloudflow.message.secret-key']=$SharedMessageSecret
        $Properties['cloudflow.encrypt.aes-key']=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))
        $Config=Join-Path $Directory 'integration.properties'
        [IO.File]::WriteAllLines($Config,@($Properties.Keys|Sort-Object|ForEach-Object{"$_=$($Properties[$_])"}),[Text.UTF8Encoding]::new($false))
        $ArgumentFile=Join-Path $Directory 'service.args'
        [IO.File]::WriteAllLines($ArgumentFile,@('-Xms96m','-Xmx512m','-Dfile.encoding=UTF-8','-cp',('"'+$Service.verifiedClasspath.Replace('\','/')+'"'),$Service.main,('"--spring.config.additional-location=file:'+$Config.Replace('\','/')+'"'),'--spring.cloud.nacos.config.enabled=false','--spring.cloud.nacos.discovery.enabled=false','--spring.cloud.nacos.config.import-check.enabled=false'),[Text.UTF8Encoding]::new($false))
        $ServiceProcess=Start-Owned $Service.name $Java @('"@'+$ArgumentFile+'"') $Directory $ArgumentFile
        $Ready=$false
        for($Attempt=0;$Attempt -lt 150;$Attempt++){
            if($ServiceProcess.HasExited){throw "Independent $($Service.name) exited before readiness"}
            try{if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2).status -eq 'UP'){$Ready=$true;break}}catch{}
            Start-Sleep -Seconds 2
        }
        if(-not $Ready){throw "Independent $($Service.name) readiness timeout"}
        Write-Output "D4_NATURAL_SERVICE: name=$($Service.name); healthy=true; independent=true"
    }
    $State=@{run=$Run;status='RUNNING';mysqlPort=$MysqlPort;redisPort=$RedisPort;tables=$Tables;services=@($Services|Select-Object name,port,healthPort,application);processes=@($Processes|Select-Object name,id,marker)}
    $State|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Run 'state.json') -Encoding utf8NoBOM
    $RuntimeInputs=@(Get-ChildItem -LiteralPath $Run -Recurse -File|Where-Object {$_.Name -in @('integration.properties','service.args','redisson.json') -or $_.Name -like 'redis-*.conf'}|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
    $RuntimeInputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'runtime-inputs.json') -Encoding utf8NoBOM
    & node scripts/verify-d4-natural-reminder.mjs (Join-Path $Run 'state.json') $Output *> (Join-Path $Output 'live.log')
    $VerifierExit=$LASTEXITCODE
    foreach($Item in $RuntimeInputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Independent runtime input changed'}}
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -like 'D4_NATURAL_*'}
    if($VerifierExit -ne 0){throw 'Natural daily business verification failed; evidence retained'}
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
    try{Assert-Inputs;$Unchanged=$true}catch{$Unchanged=$false;$Failure='Frozen input check failed'}
    $Summary=@{passed=($null -eq $Failure -and $VerifierExit -eq 0 -and $Stopped -and $Unchanged);failure=$Failure;verifierExit=$VerifierExit;inputs=$Inputs.Count;inputsUnchanged=$Unchanged;processesStopped=$Stopped;stopErrors=@($StopErrors);run=$Run;backend=$BackendRound;frontend=$FrontendRound;priorRuntimeWritten=$false;databaseRetained=$true}
    $Summary|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'launcher-result.json') -Encoding utf8NoBOM
    Write-Output "D4_NATURAL_RUN: passed=$($Summary.passed); inputs=$($Inputs.Count); unchanged=$Unchanged; processes_stopped=$Stopped; prior_runtime_written=false"
}
if(-not $Summary.passed){throw "D4 independent natural reminder failed: $Failure"}
