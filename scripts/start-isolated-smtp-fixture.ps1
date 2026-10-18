param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'SMTP fixture must use a data drive' }
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running owned integration required' }
if ($State.smtpFixture -or @($State.processes | Where-Object name -EQ 'smtp-fixture').Count -ne 0) { throw 'Existing SMTP fixture must use the ownership-checked restarter' }
$Directory = Join-Path $Run 'private/smtp'
$Classes = Join-Path $Run 'smtp-classes'
$AuthDirectory = Join-Path $Run 'auth'
$AuthArguments = Join-Path $AuthDirectory 'service.args'
$AuthProperties = Join-Path $AuthDirectory 'integration.properties'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, (Join-Path $Run 'private'), $AuthDirectory, $AuthArguments, $AuthProperties)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated path rejected' }
}
if (Test-Path -LiteralPath $Directory) { throw 'A new SMTP fixture directory is required' }
if (Test-Path -LiteralPath $Classes) { throw 'A new SMTP fixture class directory is required' }
$AuthOwned = @($State.processes | Where-Object name -EQ 'auth')
if ($AuthOwned.Count -ne 1 -or $AuthOwned[0].marker -ne $AuthArguments) { throw 'Unique owned auth process required' }
$Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($AuthOwned[0].id)"
if (-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($AuthArguments)) { throw 'Owned auth Java identity mismatch' }
$AuthOptions = [IO.File]::ReadAllLines($AuthArguments)
if (@($AuthOptions | Where-Object { $_ -match 'javax.net.ssl.trustStore' }).Count -ne 0) { throw 'Existing auth trust configuration requires inspection' }
$AuthSettings = [IO.File]::ReadAllLines($AuthProperties)
if ('server.address=127.0.0.1' -notin $AuthSettings -or 'spring.cloud.nacos.config.enabled=false' -notin $AuthSettings) { throw 'Loopback-only auth configuration required' }
if (@($AuthSettings | Where-Object { $_ -match '^cloudflow\.message\.smtp\.' }).Count -ne 0) { throw 'Existing SMTP policy requires inspection' }
$Backend = Join-Path $Root 'cloudflow-backend'
$DependenciesFile = Join-Path $Backend 'cloudflow-auth/target/message-delivery-classpath.txt'
if (-not (Test-Path -LiteralPath $DependenciesFile)) { throw 'Run the existing message delivery checks to prepare dependencies first' }
[IO.Directory]::CreateDirectory($Directory) | Out-Null
[IO.Directory]::CreateDirectory($Classes) | Out-Null
$Password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
[IO.File]::WriteAllText((Join-Path $Directory 'store-password.txt'), $Password, [Text.UTF8Encoding]::new($false))
$PreviousPassword = $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD
try {
    $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $Password
    & keytool '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $Directory 'tls.p12') -storepass:env CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Isolated SMTP TLS identity creation failed' }
} finally { $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $PreviousPassword }
$Dependencies = [IO.File]::ReadAllText($DependenciesFile).Trim()
$Targets = @((Join-Path $Backend 'cloudflow-auth/target/classes')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object { Join-Path $_.FullName 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Classpath = (@($Targets) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'message-checks') -Filter 'Message*Checks.java' -File)
$Compile = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Classes.Replace('\', '/') + '"'))
$Compile += @($Sources | ForEach-Object { '"' + $_.FullName.Replace('\', '/') + '"' })
$CompileFile = Join-Path $Run 'smtp-compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Isolated SMTP fixture compilation failed' }
$Arguments = @('-Dfile.encoding=UTF-8', '-cp', ('"' + ($Classes + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), 'com.cloudflow.auth.message.MessageSmtpFixtureChecks', ('"' + $Directory.Replace('\', '/') + '"'), '0', '14400')
$ArgumentFile = Join-Path $Run 'smtp.args'
[IO.File]::WriteAllLines($ArgumentFile, $Arguments, [Text.UTF8Encoding]::new($false))
$Process = Start-Process -FilePath $Current.ExecutablePath -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList ('"@' + $ArgumentFile + '"') -RedirectStandardOutput (Join-Path $Run 'smtp.stdout.log') -RedirectStandardError (Join-Path $Run 'smtp.stderr.log')
$Ready = $false
try {
    for ($Attempt = 0; $Attempt -lt 80; $Attempt++) {
        if ($Process.HasExited) { throw 'Isolated SMTP fixture exited before readiness' }
        $SnapshotFile = Join-Path $Directory 'snapshot.json'
        if (Test-Path -LiteralPath $SnapshotFile) {
            $Snapshot = Get-Content -LiteralPath $SnapshotFile -Raw | ConvertFrom-Json
            if ($Snapshot.loopback -and $Snapshot.port -gt 1024 -and $Snapshot.port -lt 65536) { $Ready = $true; break }
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $Ready) { throw 'Isolated SMTP fixture readiness timeout' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Process.Id)
    if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1' -or $Listeners[0].LocalPort -ne $Snapshot.port) { throw 'SMTP fixture must have exactly one owned loopback listener' }
    $Latest = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    if ($Latest.smtpFixture -or $Latest.status -ne 'RUNNING' -or $Latest.run -ne $State.run) { throw 'Isolated state changed while preparing SMTP' }
    $Trust = @(('"-Djavax.net.ssl.trustStore=' + (Join-Path $Directory 'tls.p12').Replace('\', '/') + '"'), "-Djavax.net.ssl.trustStorePassword=$Password")
    Copy-Item -LiteralPath $AuthArguments -Destination (Join-Path $AuthDirectory ('service-before-smtp-' + [Guid]::NewGuid().ToString('N') + '.args'))
    [IO.File]::WriteAllLines($AuthArguments, @($Trust) + @($AuthOptions), [Text.UTF8Encoding]::new($false))
    $Policy = @('cloudflow.message.smtp.allowed-hosts=localhost', 'cloudflow.message.smtp.allowed-addresses=127.0.0.1,::1,0:0:0:0:0:0:0:1', "cloudflow.message.smtp.extra-tls-ports=$($Snapshot.port)")
    Copy-Item -LiteralPath $AuthProperties -Destination (Join-Path $AuthDirectory ('integration-before-smtp-' + [Guid]::NewGuid().ToString('N') + '.properties'))
    [IO.File]::WriteAllLines($AuthProperties, @($AuthSettings) + @($Policy), [Text.UTF8Encoding]::new($false))
    $Latest.smtpFixture = @{ port = $Snapshot.port; directory = $Directory; host = 'localhost'; loopback = $true }
    $Latest.processes = @($Latest.processes) + @(@{ name = 'smtp-fixture'; id = $Process.Id; marker = $ArgumentFile })
    $Latest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding utf8
    Write-Output "ISOLATED_SMTP_READY: port=$($Snapshot.port); loopback=true; tls=true; official_provider_contacted=false; auth_restart_required=true; production_modified=false"
} catch {
    if (-not $Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    throw
}
