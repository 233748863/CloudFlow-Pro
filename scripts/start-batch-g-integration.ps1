param(
    [Parameter(Mandatory = $true)][string]$RedisServer,
    [string]$MinioServer,
    [switch]$SmtpFixture,
    [ValidateSet('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway')][string[]]$ServiceNames = @('auth', 'hr', 'oa', 'crm', 'gateway'),
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Root 'cloudflow-backend'
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$Run = Join-Path $Runtime ([Guid]::NewGuid().ToString('N'))
$Data = Join-Path $Run 'mysql-data'
$RedisServer = (Resolve-Path -LiteralPath $RedisServer).Path
if ($MinioServer) { $MinioServer = (Resolve-Path -LiteralPath $MinioServer).Path }
$Mysql = (Get-Command mysql.exe -ErrorAction Stop).Source
$Mysqld = Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Java = Join-Path $env:JAVA_HOME 'bin/java.exe'
if (-not (Test-Path -LiteralPath $Java)) { throw 'Set JAVA_HOME to JDK 17 before running integration checks' }
if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot 'verify-batch-g.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Batch G build failed' }
}
foreach ($Directory in @($Runtime, $Run, (Join-Path $Run 'profile'))) {
    [IO.Directory]::CreateDirectory($Directory) | Out-Null
    if ((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing redirected integration workspace' }
}
$Access = Get-Acl -LiteralPath $Run
$Access.SetAccessRuleProtection($true, $false)
foreach ($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $Run -AclObject $Access
$RedisPassword = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$EncryptionKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))
$StorageEncryptionKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$MessageEncryptionKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$Processes = [Collections.Generic.List[object]]::new()
$ObjectStorage = $null
$MailFixture = $null
$AvailableServices = @(
    @{ name = 'auth'; module = 'cloudflow-auth'; main = 'com.cloudflow.auth.AuthApplication'; application = 'cloudflow-auth' },
    @{ name = 'hr'; module = 'cloudflow-service-hr'; main = 'com.cloudflow.hr.HrServiceApplication'; application = 'cloudflow-service-hr' },
    @{ name = 'oa'; module = 'cloudflow-service-oa'; main = 'com.cloudflow.oa.OaApplication'; application = 'cloudflow-service-oa' },
    @{ name = 'crm'; module = 'cloudflow-service-crm'; main = 'com.cloudflow.crm.CrmApplication'; application = 'cloudflow-service-crm' },
    @{ name = 'workflow'; module = 'cloudflow-service-workflow'; main = 'com.cloudflow.workflow.WorkflowApplication'; application = 'cloudflow-service-workflow' },
    @{ name = 'gateway'; module = 'cloudflow-gateway'; main = 'com.cloudflow.gateway.GatewayApplication'; application = 'cloudflow-gateway' }
)
if ('auth' -notin $ServiceNames -or 'gateway' -notin $ServiceNames) { throw 'Integration requires the real authentication service and gateway' }
$Services = @($AvailableServices | Where-Object name -In $ServiceNames)
$OmittedServices = @($AvailableServices | Where-Object name -NotIn $ServiceNames)

function New-Port {
    $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    try { return $Listener.LocalEndpoint.Port } finally { $Listener.Stop() }
}

function Invoke-Database([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$MysqlPort",'--user=root','--batch','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync()
    $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql)
    $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(300000)) { $Child.Kill(); throw 'Isolated MySQL query timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}

function Save-State {
    @{ run = $Run; data = $Data; mysqlPort = $MysqlPort; redisPort = $RedisPort; jdbcUrl = $JdbcUrl; objectStorage = $ObjectStorage; smtpFixture = $MailFixture; processes = @($Processes); services = $Services; omittedServices = @($OmittedServices | ForEach-Object name); status = 'STARTING' } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Run 'state.json') -Encoding utf8
}

$MysqlPort = New-Port
$RedisPort = New-Port
$JdbcUrl = "jdbc:mysql://127.0.0.1:$MysqlPort/cloud_flow_db?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
foreach ($Service in $Services) { $Service.port = New-Port; $Service.healthPort = New-Port }
$AuthPort = ($Services | Where-Object name -EQ 'auth').port
$Started = $false
try {
    $Initialize = Start-Process -FilePath $Mysqld -WindowStyle Hidden -Wait -PassThru -ArgumentList @('--no-defaults','--initialize-insecure',"--datadir=`"$Data`"",'--innodb-buffer-pool-size=64M',"--log-error=`"$(Join-Path $Run 'mysql-initialize.log')`"")
    if ($Initialize.ExitCode -ne 0) { throw 'Isolated MySQL initialization failed' }
    $Server = Start-Process -FilePath $Mysqld -WindowStyle Hidden -PassThru -ArgumentList @('--no-defaults',"--datadir=`"$Data`"",'--bind-address=127.0.0.1',"--port=$MysqlPort",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=128M','--max-connections=100',"--log-error=`"$(Join-Path $Run 'mysql.log')`"") -RedirectStandardOutput (Join-Path $Run 'mysql.stdout.log') -RedirectStandardError (Join-Path $Run 'mysql.stderr.log')
    $Processes.Add(@{ name = 'mysql'; id = $Server.Id; marker = $Data })
    Save-State
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        try { if ((Invoke-Database 'SELECT 1;') -eq '1') { $Ready = $true; break } } catch { Start-Sleep -Milliseconds 500 }
        if ($Server.HasExited) { throw 'Isolated MySQL exited before readiness' }
    }
    if (-not $Ready) { throw 'Isolated MySQL readiness timeout' }
    $ActualData = Invoke-Database 'SELECT @@datadir;'
    if ([IO.Path]::GetFullPath($ActualData).TrimEnd('\', '/') -ne [IO.Path]::GetFullPath($Data).TrimEnd('\', '/')) { throw 'MySQL data directory does not match isolated workspace' }
    foreach ($Script in @(Get-ChildItem -LiteralPath (Join-Path $Backend 'DB') -File | Where-Object Name -Match '^0[1-6]\.' | Sort-Object Name)) {
        if ($Script.Name.StartsWith('06.')) {
            $Conflicts = Invoke-Database 'SELECT menu_id, menu_name, perms FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1900 AND 1949;'
            if ($Conflicts) { throw "H3 menu range is occupied before seed insertion: $Conflicts" }
            Write-Output 'H3_PREINSERT_MENU_CONFLICTS: range=1900-1949; rows=0; isolated=true'
            $PackageConflicts = Invoke-Database 'SELECT menu_id, menu_name, perms FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1970 AND 1972;'
            if ($PackageConflicts) { throw "H5 package menu range is occupied before seed insertion: $PackageConflicts" }
            Write-Output 'H5_PACKAGE_PREINSERT_MENU_CONFLICTS: range=1970-1972; rows=0; isolated=true'
        }
        $Sql = [IO.File]::ReadAllText($Script.FullName)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE cloud_flow_db;`n" + $Sql }
        Invoke-Database $Sql | Out-Null
    }
    Invoke-Database "USE cloud_flow_db; UPDATE sys_job SET status = 'PAUSED';" | Out-Null
    $Count = Invoke-Database "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cloud_flow_db' AND table_type = 'BASE TABLE';"
    if ($Count -ne '366') { throw "Expected 366 isolated tables including approved G4 enterprise IM tables, found $Count" }
    Write-Output "ISOLATED_FORMAL_TABLES: expected=366; actual=$Count; scripts=01-06"
    $CheckArguments = @(Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/batch-g-checks/run.args'))
    $ClassPathIndex = [Array]::IndexOf($CheckArguments, '-cp')
    if ($ClassPathIndex -lt 0 -or $ClassPathIndex + 1 -ge $CheckArguments.Count) { throw 'Run verify-batch-g.ps1 to prepare integration fixture classes' }
    $FixtureBase = @('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-cp', $CheckArguments[$ClassPathIndex + 1])
    $FixtureRun = $FixtureBase + @('com.cloudflow.auth.storage.ImportIntegrationFixtures', ('"' + $JdbcUrl + '"'), ('"' + $Run.Replace('\', '/') + '"'))
    $FixtureArguments = Join-Path $Run 'fixtures.args'
    [IO.File]::WriteAllLines($FixtureArguments, $FixtureRun, [Text.UTF8Encoding]::new($false))
    & $Java "@$FixtureArguments"
    if ($LASTEXITCODE -ne 0) { throw 'Isolated integration fixtures failed' }
    $RedisConfigName = 'redis-' + (Split-Path -Leaf $Run) + '.conf'
    $RedisConfig = Join-Path $Run $RedisConfigName
    [IO.File]::WriteAllLines($RedisConfig, @('bind 127.0.0.1', 'protected-mode yes', "port $RedisPort", "requirepass $RedisPassword", 'appendonly no', 'save ""', 'logfile "redis.log"'), [Text.UTF8Encoding]::new($false))
    $Redis = Start-Process -FilePath $RedisServer -WindowStyle Hidden -PassThru -WorkingDirectory $Run -ArgumentList $RedisConfigName -RedirectStandardOutput (Join-Path $Run 'redis.stdout.log') -RedirectStandardError (Join-Path $Run 'redis.stderr.log')
    $Processes.Add(@{ name = 'redis'; id = $Redis.Id; marker = $RedisConfigName })
    Save-State
    $RedisCli = Join-Path (Split-Path -Parent $RedisServer) 'redis-cli.exe'
    $Ready = $false
    $PreviousRedisPassword = $env:REDISCLI_AUTH
    try {
        $env:REDISCLI_AUTH = $RedisPassword
        for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
            if ((& $RedisCli -h 127.0.0.1 -p $RedisPort ping 2>$null) -eq 'PONG') { $Ready = $true; break }
            Start-Sleep -Milliseconds 500
            if ($Redis.HasExited) { throw 'Isolated Redis exited before readiness' }
        }
    } finally {
        if ($null -eq $PreviousRedisPassword) { Remove-Item Env:REDISCLI_AUTH -ErrorAction SilentlyContinue }
        else { $env:REDISCLI_AUTH = $PreviousRedisPassword }
    }
    if (-not $Ready) { throw 'Isolated Redis readiness timeout' }
    if ($MinioServer) {
        $ObjectData = Join-Path $Run 'minio-data'
        [IO.Directory]::CreateDirectory($ObjectData) | Out-Null
        $ObjectPort = New-Port
        $ConsolePort = New-Port
        $ObjectStorage = @{ endpoint = "http://127.0.0.1:$ObjectPort"; bucket = ('g-storage-' + (Split-Path -Leaf $Run)); data = $ObjectData }
        $StorageCredentials = @{ endpoint = $ObjectStorage.endpoint; bucket = $ObjectStorage.bucket; accessKey = ('g-storage-' + [Guid]::NewGuid().ToString('N')); secretKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) }
        $StorageCredentials | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Run 'private/storage.json') -Encoding utf8
        $ObjectServer = Start-Process -FilePath $MinioServer -WindowStyle Hidden -PassThru -WorkingDirectory $Run -ArgumentList @('server', "`"$ObjectData`"", '--address', "127.0.0.1:$ObjectPort", '--console-address', "127.0.0.1:$ConsolePort") -Environment @{ MINIO_ROOT_USER = $StorageCredentials.accessKey; MINIO_ROOT_PASSWORD = $StorageCredentials.secretKey; MINIO_BROWSER = 'off' } -RedirectStandardOutput (Join-Path $Run 'minio.stdout.log') -RedirectStandardError (Join-Path $Run 'minio.stderr.log')
        $Processes.Add(@{ name = 'minio'; id = $ObjectServer.Id; marker = $ObjectData })
        Save-State
        $Ready = $false
        for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
            try {
                if ((Invoke-WebRequest -Uri "$($ObjectStorage.endpoint)/minio/health/ready" -TimeoutSec 2).StatusCode -eq 200) { $Ready = $true; break }
            } catch { Start-Sleep -Milliseconds 500 }
            if ($ObjectServer.HasExited) { throw 'Isolated MinIO exited before readiness' }
        }
        if (-not $Ready) { throw 'Isolated MinIO readiness timeout' }
        $StorageArguments = $FixtureBase + @('com.cloudflow.auth.storage.ObjectStorageIntegrationProbe', ('"' + $Run.Replace('\', '/') + '"'), 'prepare')
        $StorageArgumentFile = Join-Path $Run 'storage-fixtures.args'
        [IO.File]::WriteAllLines($StorageArgumentFile, $StorageArguments, [Text.UTF8Encoding]::new($false))
        & $Java "@$StorageArgumentFile"
        if ($LASTEXITCODE -ne 0) { throw 'Isolated object storage initialization failed' }
    }
    if ($SmtpFixture) {
        $MailDirectory = Join-Path $Run 'private/smtp'
        $MailClasses = Join-Path $Run 'smtp-classes'
        [IO.Directory]::CreateDirectory($MailDirectory) | Out-Null
        [IO.Directory]::CreateDirectory($MailClasses) | Out-Null
        $MailPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
        [IO.File]::WriteAllText((Join-Path $MailDirectory 'store-password.txt'), $MailPassword, [Text.UTF8Encoding]::new($false))
        $OldPassword = $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD
        try {
            $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $MailPassword
            & keytool '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $MailDirectory 'tls.p12') -storepass:env CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD -noprompt
            if ($LASTEXITCODE -ne 0) { throw 'SMTP fixture TLS identity creation failed' }
        } finally { $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $OldPassword }
        $MailDependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/message-delivery-classpath.txt') -Raw).Trim()
        $MailTargets = @((Join-Path $Backend 'cloudflow-auth/target/classes')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object { Join-Path $_.FullName 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
        $MailClasspath = (@($MailTargets) + @($MailDependencies)) -join [IO.Path]::PathSeparator
        $MailSources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'message-checks') -Filter 'Message*Checks.java' -File)
        $MailCompile = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $MailClasspath.Replace('\', '/') + '"'), '-d', ('"' + $MailClasses.Replace('\', '/') + '"'))
        $MailCompile += @($MailSources | ForEach-Object { '"' + $_.FullName.Replace('\', '/') + '"' })
        $MailCompileFile = Join-Path $Run 'smtp-compile.args'
        [IO.File]::WriteAllLines($MailCompileFile, $MailCompile, [Text.UTF8Encoding]::new($false))
        & javac "@$MailCompileFile"
        if ($LASTEXITCODE -ne 0) { throw 'SMTP protocol fixture compilation failed' }
        $MailArguments = @('-Dfile.encoding=UTF-8', '-cp', ('"' + ($MailClasses + [IO.Path]::PathSeparator + $MailClasspath).Replace('\', '/') + '"'), 'com.cloudflow.auth.message.MessageSmtpFixtureChecks', ('"' + $MailDirectory.Replace('\', '/') + '"'))
        $MailArgumentFile = Join-Path $Run 'smtp.args'
        [IO.File]::WriteAllLines($MailArgumentFile, $MailArguments, [Text.UTF8Encoding]::new($false))
        $MailServer = Start-Process -FilePath $Java -WindowStyle Hidden -PassThru -WorkingDirectory $MailDirectory -ArgumentList ('"@' + $MailArgumentFile + '"') -RedirectStandardOutput (Join-Path $Run 'smtp.stdout.log') -RedirectStandardError (Join-Path $Run 'smtp.stderr.log')
        $Processes.Add(@{ name = 'smtp-fixture'; id = $MailServer.Id; marker = $MailArgumentFile })
        Save-State
        $Ready = $false
        for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
            if (Test-Path -LiteralPath (Join-Path $MailDirectory 'snapshot.json')) {
                $MailSnapshot = Get-Content -LiteralPath (Join-Path $MailDirectory 'snapshot.json') -Raw | ConvertFrom-Json
                if ($MailSnapshot.loopback -and $MailSnapshot.port -gt 1024) { $Ready = $true; break }
            }
            if ($MailServer.HasExited) { throw 'SMTP protocol fixture exited before readiness' }
            Start-Sleep -Milliseconds 250
        }
        if (-not $Ready) { throw 'SMTP protocol fixture readiness timeout' }
        $MailFixture = @{ port = $MailSnapshot.port; directory = $MailDirectory; host = 'localhost'; loopback = $true }
        Write-Output "Isolated SMTP fixture ready on 127.0.0.1:$($MailSnapshot.port); TLS required; official_provider_contacted=false"
    }
    $Shared = @(
        'spring.cloud.nacos.config.enabled=false', 'spring.cloud.nacos.config.import-check.enabled=false',
        'spring.cloud.nacos.discovery.enabled=false', 'spring.cloud.nacos.discovery.register-enabled=false',
        'spring.cloud.bootstrap.enabled=false', 'spring.profiles.active=batch-g-integration',
        'spring.datasource.dynamic.primary=master', 'spring.datasource.dynamic.strict=true',
        "spring.datasource.dynamic.datasource.master.url=$JdbcUrl", 'spring.datasource.dynamic.datasource.master.username=root',
        'spring.datasource.dynamic.datasource.master.password=', 'spring.datasource.dynamic.datasource.master.driver-class-name=com.mysql.cj.jdbc.Driver',
        'spring.datasource.dynamic.hikari.min-idle=1', 'spring.datasource.dynamic.hikari.max-pool-size=8',
        "spring.datasource.url=$JdbcUrl", 'spring.datasource.username=root', 'spring.datasource.password=',
        'spring.data.redis.host=127.0.0.1', "spring.data.redis.port=$RedisPort", "spring.data.redis.password=$RedisPassword", 'spring.data.redis.database=0',
        'REDIS_HOST=127.0.0.1', "REDIS_PORT=$RedisPort", "REDIS_PASSWORD=$RedisPassword", "DB_URL=$JdbcUrl", 'DB_USERNAME=root', 'DB_PASSWORD=',
        "cloudflow.profile=$($Run.Replace('\', '/'))/profile", "cloudflow.job.auth-url=http://127.0.0.1:$AuthPort",
        "cloudflow.oa.private-storage-dir=$($Run.Replace('\', '/'))/profile/oa-private",
        "cloudflow.crm.private-storage-dir=$($Run.Replace('\', '/'))/profile/crm-private",
        "cloudflow.hr.storage.local-dir=$($Run.Replace('\', '/'))/hr/private-files",
        'cloudflow.tenant.enabled=true', 'cloudflow.file-storage.type=local', 'cloudflow.encrypt.enabled=true',
        "cloudflow.file-storage.secret-key=$StorageEncryptionKey",
        "cloudflow.message.secret-key=$MessageEncryptionKey",
        "cloudflow.encrypt.aes-key=$EncryptionKey", 'cloudflow.workflow.callback.enabled=true',
        'logging.level.root=INFO', 'logging.level.com.cloudflow=INFO', 'logging.level.com.alibaba.nacos=OFF',
        'server.address=127.0.0.1', 'management.server.address=127.0.0.1', 'spring.jmx.enabled=false',
        'spring.cloud.openfeign.client.config.default.connectTimeout=3000', 'spring.cloud.openfeign.client.config.default.readTimeout=10000'
    )
    if ($MailFixture) {
        $MailAddresses = '127.0.0.1,::1,0:0:0:0:0:0:0:1'
        $Shared += @('cloudflow.message.smtp.allowed-hosts=localhost', "cloudflow.message.smtp.allowed-addresses=$MailAddresses", "cloudflow.message.smtp.extra-tls-ports=$($MailFixture.port)")
    }
    foreach ($Service in $Services) {
        $Shared += "spring.cloud.discovery.client.simple.instances.$($Service.application)[0].uri=http://127.0.0.1:$($Service.port)"
    }
    foreach ($Service in $OmittedServices) {
        $Shared += "spring.cloud.discovery.client.simple.instances.$($Service.application)[0].uri=http://127.0.0.1:1"
    }
    foreach ($Service in $Services) {
        $Directory = Join-Path $Run $Service.name
        [IO.Directory]::CreateDirectory($Directory) | Out-Null
        $Properties = Join-Path $Directory 'integration.properties'
        $ServiceProperties = @(
            "server.port=$($Service.port)", "management.server.port=$($Service.healthPort)",
            "cloudflow.workflow.callback.stream-key=workflow:stream:approval-callback:$($Service.name)",
            "cloudflow.workflow.callback.group=group:$($Service.name):workflow-callback",
            "cloudflow.workflow.callback.consumer-prefix=$($Service.name)-callback"
        )
        if ($Service.name -eq 'workflow') { $ServiceProperties += 'cloudflow.workflow.callback.enabled=false' }
        [IO.File]::WriteAllLines($Properties, ($Shared + $ServiceProperties), [Text.UTF8Encoding]::new($false))
        $Module = Join-Path $Backend $Service.module
        $ClasspathFile = if ($Service.name -eq 'workflow') { 'target/batch-h-classpath.txt' } else { 'target/batch-g-classpath.txt' }
        $Dependencies = (Get-Content -LiteralPath (Join-Path $Module $ClasspathFile) -Raw).Trim()
        $ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
        $Arguments = @('-Xms96m', '-Xmx512m', '-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), $Service.main)
        if ($Service.name -eq 'auth' -and $MailFixture) {
            $Arguments = @(('"-Djavax.net.ssl.trustStore=' + (Join-Path $MailDirectory 'tls.p12').Replace('\', '/') + '"'), "-Djavax.net.ssl.trustStorePassword=$MailPassword") + $Arguments
        }
        $Arguments += @('"--spring.config.additional-location=file:' + $Properties.Replace('\', '/') + '"', '--spring.cloud.nacos.config.enabled=false', '--spring.cloud.nacos.discovery.enabled=false', '--spring.cloud.nacos.config.import-check.enabled=false')
        $ArgumentFile = Join-Path $Directory 'service.args'
        [IO.File]::WriteAllLines($ArgumentFile, $Arguments, [Text.UTF8Encoding]::new($false))
        $Process = Start-Process -FilePath $Java -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList ('"@' + $ArgumentFile + '"') -RedirectStandardOutput (Join-Path $Directory 'stdout.log') -RedirectStandardError (Join-Path $Directory 'stderr.log')
        $Processes.Add(@{ name = $Service.name; id = $Process.Id; marker = $ArgumentFile })
        Save-State
    }
    $Deadline = [DateTime]::UtcNow.AddSeconds(300)
    $Pending = [Collections.Generic.HashSet[string]]::new([string[]]($Services | ForEach-Object name))
    while ($Pending.Count -gt 0 -and [DateTime]::UtcNow -lt $Deadline) {
        foreach ($Service in $Services) {
            if (-not $Pending.Contains($Service.name)) { continue }
            $Owned = $Processes | Where-Object name -EQ $Service.name
            if (-not (Get-Process -Id $Owned.id -ErrorAction SilentlyContinue)) { throw "Isolated $($Service.name) exited; inspect $Run" }
            try {
                $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2
                if ($Health.status -eq 'UP') { $Pending.Remove($Service.name) | Out-Null; Write-Output "$($Service.name) ready on $($Service.port)" }
            } catch { }
        }
        if ($Pending.Count -gt 0) { Start-Sleep -Seconds 2 }
    }
    if ($Pending.Count -gt 0) { throw "Isolated service readiness timed out: $($Pending -join ', ')" }
    Save-State
    $StatePath = Join-Path $Run 'state.json'
    $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    $State.status = 'RUNNING'
    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding utf8
    $Started = $true
    Write-Output "Isolated integration state: $StatePath"
} finally {
    if (-not $Started) {
        foreach ($Owned in @($Processes | Sort-Object { if ($_.name -eq 'mysql') { 1 } else { 0 } })) {
            $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
            if ($Current -and $Current.CommandLine -and $Current.CommandLine.Contains($Owned.marker)) { [Diagnostics.Process]::GetProcessById($Owned.id).Kill($true) }
        }
        foreach ($Worker in @(Get-CimInstance Win32_Process -Filter "Name = 'mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Data) })) {
            $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Worker.ProcessId)"
            if ($Current -and $Current.CommandLine.Contains($Data)) { [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill($true) }
        }
        Write-Warning "Integration failure diagnostics retained: $Run"
    }
}
