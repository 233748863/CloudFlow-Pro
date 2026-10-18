param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath (Join-Path $Root $StatePath)).Path
$Directory = Split-Path -Parent $StateFile
if ((Split-Path -Leaf $Directory) -eq '9799534e1a3a47b5958330f14ae16dc7') { throw 'Protected reference environment cannot be used for message checks' }
if ((Split-Path -Parent $Directory) -ne $Runtime -or (Split-Path -Leaf $Directory) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
if ((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected database directory rejected' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Directory -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Invalid isolated state' }
$Backend = Join-Path $Root 'cloudflow-backend'
$Run = Join-Path $Root ('.cloudflow-runtime/message-delivery-checks/' + [Guid]::NewGuid().ToString('N'))
$Database = 'message_delivery_' + [Guid]::NewGuid().ToString('N')
$Mysql = (Get-Command mysql.exe).Source
$Java = (Get-Command java).Source
$Javac = (Get-Command javac).Source
$ClasspathFile = Join-Path $Backend 'cloudflow-auth/target/message-delivery-classpath.txt'
if (-not (Test-Path -LiteralPath $ClasspathFile)) { throw 'Prepare auth target/message-delivery-classpath.txt first' }

function Invoke-IsolatedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync()
    $ErrorOutput = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql)
    $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(90000)) { $Child.Kill(); throw 'Owned database client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}

function Assert-OwnedServer {
    $Actual = Invoke-IsolatedSql 'SELECT @@datadir;'
    $Expected = Join-Path $Directory 'mysql-data'
    if ([IO.Path]::GetFullPath($Actual).TrimEnd('\','/') -ne [IO.Path]::GetFullPath($Expected).TrimEnd('\','/')) { throw 'Database server ownership check failed' }
}

function Quote-Java([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\','/') + '"'
}

Assert-OwnedServer
[IO.Directory]::CreateDirectory((Join-Path $Run 'classes')) | Out-Null
if ((Get-Item -LiteralPath $Run).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected run directory rejected' }
$Common = Join-Path $Backend 'cloudflow-common'
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath $Common -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($Classes) + @((Get-Content -LiteralPath $ClasspathFile -Raw).Trim())) -join [IO.Path]::PathSeparator
$Sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'message-checks') -Filter 'Message*Checks.java' -File | Select-Object -ExpandProperty FullName)
$CompileArguments = @('-encoding','UTF-8','-parameters','-cp',(Quote-Java $ClassPath),'-d',(Quote-Java (Join-Path $Run 'classes')))
$CompileArguments += @($Sources | ForEach-Object { Quote-Java $_ })
[IO.File]::WriteAllLines((Join-Path $Run 'compile.args'), $CompileArguments, [Text.UTF8Encoding]::new($false))
& $Javac '-J-Dfile.encoding=UTF-8' ('@' + (Join-Path $Run 'compile.args'))
if ($LASTEXITCODE -ne 0) { throw 'Message checks compilation failed' }
$Mappers = @((Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/SysMessageDeliveryMapper.xml'),
    (Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/auth/ImMapper.xml'),
    (Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/SysPortalUserMapper.xml'),
    (Join-Path $Common 'cloudflow-common-event/src/main/resources/mapper/OutboxEventMapper.xml'))
[IO.File]::WriteAllLines((Join-Path $Run 'mappers.txt'), $Mappers, [Text.UTF8Encoding]::new($false))
$PreviousPassword = $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD
$env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$Created = $false
try {
    & keytool '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $Run 'tls.p12') -storepass:env CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Test TLS identity creation failed' }
    Assert-OwnedServer
    Invoke-IsolatedSql "CREATE DATABASE $Database CHARACTER SET utf8mb4;" | Out-Null
    $Created = $true
    $Schema = [IO.File]::ReadAllText((Join-Path $Backend 'DB/01.cloudflow-common.sql'))
    $Tables = @('sys_message_delivery','sys_message_record','sys_message_channel','sys_message_template','sys_message_subscribe','sys_sms_code','sys_user','sys_user_role','sys_user_totp','sys_dept','outbox_event','sys_audit_log','sys_portal_user','sys_tenant','sys_im_config','sys_im_user_mapping')
    foreach ($Table in $Tables) {
        $Match = [regex]::Match($Schema, '(?ms)^CREATE TABLE ' + [regex]::Escape($Table) + '\s*\(.*?^\) ENGINE=.*?;')
        if (-not $Match.Success) { throw "Formal schema missing $Table" }
        Invoke-IsolatedSql ("USE $Database;`n" + $Match.Value) | Out-Null
    }
    Write-Output "MESSAGE_DATABASE_INITIALIZED: tables=$($Tables.Count); source_data_rows=0; formal_schema=true; production_modified=false"
    $Logback = Join-Path $Run 'logback.xml'
    [IO.File]::WriteAllText($Logback, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $Url = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/${Database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
    $Arguments = @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai',('-Dlogback.configurationFile=' + (Quote-Java $Logback)),
        '-cp',(Quote-Java ((Join-Path $Run 'classes') + [IO.Path]::PathSeparator + $ClassPath)),
        'com.cloudflow.auth.message.MessageDeliveryDatabaseChecks',(Quote-Java $Url),(Quote-Java (Join-Path $Run 'mappers.txt')),(Quote-Java (Join-Path $Run 'tls.p12')),(Quote-Java (Join-Path $Backend 'DB/06.cloudflow-business-seed.sql')))
    [IO.File]::WriteAllLines((Join-Path $Run 'run.args'), $Arguments, [Text.UTF8Encoding]::new($false))
    & $Java ('@' + (Join-Path $Run 'run.args'))
    if ($LASTEXITCODE -ne 0) { throw 'Message database/protocol checks failed' }
} finally {
    $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $PreviousPassword
    if ($Created) {
        Assert-OwnedServer
        if ($Database -notmatch '^message_delivery_[a-f0-9]{32}$') { throw 'Unsafe cleanup database' }
        Invoke-IsolatedSql "DROP DATABASE $Database;" | Out-Null
        Write-Output 'MESSAGE_DATABASE_CLEANED=true; PRODUCTION_DATABASE_MODIFIED=false'
    }
    Write-Output "MESSAGE_EVIDENCE=$Run"
}
