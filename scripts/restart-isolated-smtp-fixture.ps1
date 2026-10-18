param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [ValidateRange(1, 14400)][int]$LifetimeSeconds = 14400,
    [switch]$RenewCertificate
)

$ErrorActionPreference = 'Stop'
$Java = Join-Path $env:JAVA_HOME 'bin/java.exe'
if (-not (Test-Path -LiteralPath $Java)) { throw 'JAVA_HOME must identify the real JDK executable' }
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = (Resolve-Path -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration')).Path
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
$Directory = Join-Path $Run 'private/smtp'
$ArgumentFile = Join-Path $Run 'smtp.args'
$CompileFile = Join-Path $Run 'smtp-compile.args'
$StoreFile = Join-Path $Directory 'tls.p12'
$PasswordFile = Join-Path $Directory 'store-password.txt'
foreach ($Candidate in @($Runtime, $Run, $StateFile, (Join-Path $Run 'private'), $Directory, $ArgumentFile, $CompileFile, $StoreFile, $PasswordFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected integration path rejected' }
}
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or [IO.Path]::GetFullPath($State.smtpFixture.directory) -ne $Directory -or -not $State.smtpFixture.loopback) { throw 'Running owned SMTP fixture required' }
$StorePassword = [IO.File]::ReadAllText($PasswordFile)
$Certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($StoreFile, $StorePassword, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
try {
    $ValidCertificate = $Certificate.NotBefore.ToUniversalTime() -le [DateTime]::UtcNow -and $Certificate.NotAfter.ToUniversalTime() -gt [DateTime]::UtcNow
    if (-not $ValidCertificate -and -not $RenewCertificate) { throw 'Owned SMTP certificate expired or not yet valid; use -RenewCertificate and restart isolated auth afterwards' }
} finally { $Certificate.Dispose() }
$Port = [int]$State.smtpFixture.port
if ($Port -le 1024 -or $Port -gt 65535) { throw 'Invalid isolated SMTP port' }
$Owned = @($State.processes | Where-Object name -EQ 'smtp-fixture')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $ArgumentFile) { throw 'Unique SMTP process marker required' }
$Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if ($Current) {
    if ($Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($ArgumentFile)) { throw 'Owned SMTP process identity mismatch' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId -ErrorAction SilentlyContinue)
    if (@($Listeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' -or $_.LocalPort -ne $Port }).Count -gt 0) { throw 'Unexpected SMTP listener' }
}
$PortListeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if (@($PortListeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $Owned[0].id }).Count -gt 0) { throw 'SMTP port belongs to another process' }
$CompileArguments = @(Get-Content -LiteralPath $CompileFile | Where-Object { $_ -notmatch '\.java"$' })
$CompileArguments += @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'message-checks') -Filter 'Message*Checks.java' -File | ForEach-Object { '"' + $_.FullName.Replace('\', '/') + '"' })
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'SMTP fixture compilation failed' }
if ($Current) {
    $Verified = Get-CimInstance Win32_Process -Filter "ProcessId = $($Current.ProcessId)"
    if ($Verified -and ($Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine)) { throw 'SMTP process changed during verification' }
    if ($Verified) { Stop-Process -Id $Current.ProcessId -ErrorAction Stop; Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue }
}
$PortDeadline = [DateTime]::UtcNow.AddSeconds(15)
do {
    $PortListeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($PortListeners.Count -eq 0) { break }
    if (@($PortListeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $Owned[0].id }).Count -gt 0) { throw 'SMTP port claimed by another process' }
    Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $PortDeadline)
if ($PortListeners.Count -ne 0) { throw 'SMTP port still occupied' }
if (Test-Path -LiteralPath (Join-Path $Directory 'stop')) { throw 'Explicitly stopped SMTP fixture cannot be restarted' }
$Revision = [Guid]::NewGuid().ToString('N')
if ($RenewCertificate) {
    $NewStore = Join-Path $Directory "tls-next-$Revision.p12"
    $PreviousStorePassword = $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD
    try {
        $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $StorePassword
        & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore $NewStore -storepass:env CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Owned SMTP certificate renewal failed' }
    } finally { $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD = $PreviousStorePassword }
    $Certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($NewStore, $StorePassword, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    try {
        if ($Certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or $Certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) { throw 'New SMTP certificate is not valid now' }
        Copy-Item -LiteralPath $StoreFile -Destination (Join-Path $Directory "tls-before-$Revision.p12")
        Copy-Item -LiteralPath $NewStore -Destination $StoreFile -Force
        Remove-Item -LiteralPath $NewStore -Force
        Write-Output "ISOLATED_SMTP_CERTIFICATE: renewed=true; not_before_utc=$($Certificate.NotBefore.ToUniversalTime().ToString('o')); not_after_utc=$($Certificate.NotAfter.ToUniversalTime().ToString('o')); auth_restart_required=true; production_modified=false"
    } finally { $Certificate.Dispose() }
}
$StorePassword = $null
$Snapshot = Join-Path $Directory 'snapshot.json'
Copy-Item -LiteralPath $Snapshot -Destination (Join-Path $Directory "snapshot-before-$Revision.json")
$Arguments = [IO.File]::ReadAllLines($ArgumentFile)
$MainIndex = [Array]::IndexOf($Arguments, 'com.cloudflow.auth.message.MessageSmtpFixtureChecks')
if ($MainIndex -lt 0 -or ($Arguments.Count - $MainIndex - 1) -notin @(1, 3) -or $Arguments[$MainIndex + 1].Trim('"').Replace('/', '\') -ne $Directory) { throw 'Owned SMTP arguments differ from expected fixture' }
Copy-Item -LiteralPath $ArgumentFile -Destination (Join-Path $Run "smtp-before-$Revision.args")
[IO.File]::WriteAllLines($ArgumentFile, @($Arguments[0..($MainIndex + 1)]) + @([string]$Port, [string]$LifetimeSeconds), [Text.UTF8Encoding]::new($false))
$Process = Start-Process -FilePath $Java -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList ('"@' + $ArgumentFile + '"') -RedirectStandardOutput (Join-Path $Run "smtp-$Revision.stdout.log") -RedirectStandardError (Join-Path $Run "smtp-$Revision.stderr.log")
$Owned[0].id = $Process.Id
$State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding utf8
$Deadline = [DateTime]::UtcNow.AddSeconds(30)
while ([DateTime]::UtcNow -lt $Deadline) {
    if ($Process.HasExited) { throw 'Owned SMTP fixture exited before readiness' }
    $Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($Listeners.Count -eq 1 -and $Listeners[0].LocalAddress -eq '127.0.0.1' -and $Listeners[0].OwningProcess -eq $Process.Id -and (Get-Item -LiteralPath $Snapshot).LastWriteTimeUtc -gt $Process.StartTime.ToUniversalTime()) {
        Write-Output "ISOLATED_SMTP_READY: port=$Port; process=$($Process.Id); loopback=true; maximum_lifetime_seconds=$LifetimeSeconds; previous_evidence_retained=true; production_modified=false"
        exit 0
    }
    Start-Sleep -Milliseconds 250
}
throw 'Owned SMTP fixture readiness timed out'
