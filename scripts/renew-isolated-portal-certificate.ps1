param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Certificate renewal requires a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Directory = Join-Path $Run 'private/portal'
$StoreFile = Join-Path $Directory 'tls.p12'
$PasswordFile = Join-Path $Directory 'store-password.txt'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, (Join-Path $Run 'private'), $Directory, $StoreFile, $PasswordFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected certificate path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or [IO.Path]::GetFullPath($State.portalFixture.directory) -ne $Directory -or -not $State.portalFixture.loopback) { throw 'Running owned portal fixture required' }
$Port = [int]$State.portalFixture.port
if ($Port -le 1024 -or $Port -gt 65535 -or $State.portalFixture.publicUrl -ne "https://127.0.0.1:$Port") { throw 'Owned loopback portal origin required' }
if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count -ne 0) { throw 'Finish active portal verification before renewing its certificate' }
$OriginalHash = (Get-FileHash -LiteralPath $StoreFile -Algorithm SHA256).Hash
$Password = [IO.File]::ReadAllText($PasswordFile)
$Original = [Security.Cryptography.X509Certificates.X509Certificate2]::new($StoreFile, $Password, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
try { $PreviousExpiry = $Original.NotAfter.ToUniversalTime().ToString('o') } finally { $Original.Dispose() }
$Revision = [Guid]::NewGuid().ToString('N')
$NewStore = Join-Path $Directory "tls-next-$Revision.p12"
$PreviousPassword = $env:CLOUDFLOW_PORTAL_FIXTURE_PASSWORD
try {
    $env:CLOUDFLOW_PORTAL_FIXTURE_PASSWORD = $Password
    & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') '-J-Dfile.encoding=UTF-8' -genkeypair -alias portal-test -dname 'CN=localhost' -ext 'SAN=dns:localhost,ip:127.0.0.1' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore $NewStore -storepass:env CLOUDFLOW_PORTAL_FIXTURE_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Owned portal certificate generation failed' }
    $Certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($NewStore, $Password, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    try {
        if ($Certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or $Certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) { throw 'New portal certificate is not valid now' }
        if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count -ne 0 -or (Get-FileHash -LiteralPath $StoreFile -Algorithm SHA256).Hash -ne $OriginalHash) { throw 'Portal fixture changed during certificate renewal' }
        Copy-Item -LiteralPath $StoreFile -Destination (Join-Path $Directory "tls-before-$Revision.p12")
        Copy-Item -LiteralPath $NewStore -Destination $StoreFile -Force
        Remove-Item -LiteralPath $NewStore -Force
        Write-Output "ISOLATED_PORTAL_CERTIFICATE: renewed=true; previous_not_after_utc=$PreviousExpiry; not_after_utc=$($Certificate.NotAfter.ToUniversalTime().ToString('o')); origin_unchanged=true; database_writes=0; services_restarted=0; production_modified=false"
    } finally { $Certificate.Dispose() }
} finally {
    $env:CLOUDFLOW_PORTAL_FIXTURE_PASSWORD = $PreviousPassword
    $Password = $null
}
