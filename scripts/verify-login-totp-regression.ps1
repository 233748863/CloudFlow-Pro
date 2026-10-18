param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$PropertiesFile = Join-Path $Run 'auth/integration.properties'
foreach ($Candidate in @($Run, $StateFile, $PropertiesFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated configuration rejected' }
}
$OriginalHash = (Get-FileHash -LiteralPath $PropertiesFile).Hash
$Properties = [IO.File]::ReadAllText($PropertiesFile)
if ($Properties -match '(?m)^cloudflow\.auth\.totp\.(enabled|encryption-key)=') { throw 'Temporary TOTP regression requires unconfigured isolated TOTP' }
$Previous = @{}
foreach ($Name in @('CLOUDFLOW_TOTP_ENABLED', 'TOTP_ENCRYPTION_KEY')) { $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name) }
$TemporaryKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$Restart = Join-Path $Root 'scripts/restart-isolated-integration-service.ps1'
$Classpath = Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/im-classpath.txt'
$NeedsRestore = $false
try {
    $env:CLOUDFLOW_TOTP_ENABLED = 'true'
    $env:TOTP_ENCRYPTION_KEY = $TemporaryKey
    $NeedsRestore = $true
    & $Restart -StatePath $StateFile -ServiceName auth -ClassPathFile $Classpath -RecoverExited
    if ($LASTEXITCODE -ne 0) { throw 'Temporary isolated auth restart failed' }
    & node (Join-Path $Root 'scripts/verify-batch-g-integration.mjs') $StateFile --login-session-totp-only --im-schema
    if ($LASTEXITCODE -ne 0) { throw 'Real password and TOTP regression failed' }
} finally {
    foreach ($Name in $Previous.Keys) {
        if ($null -eq $Previous[$Name]) { Remove-Item -LiteralPath ('Env:\' + $Name) -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name]) }
    }
    if ($NeedsRestore) {
        & $Restart -StatePath $StateFile -ServiceName auth -ClassPathFile $Classpath -RecoverExited
        if ($LASTEXITCODE -ne 0) { throw 'Isolated auth restoration failed' }
    }
    if ((Get-FileHash -LiteralPath $PropertiesFile).Hash -ne $OriginalHash) { throw 'Isolated configuration changed during TOTP regression' }
    $Matches = 0
    $Files = @(Get-ChildItem -LiteralPath $Run -File -Filter '*.log' -Recurse)
    foreach ($File in $Files) {
        $Stream = [IO.File]::Open($File.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $Reader = [IO.StreamReader]::new($Stream, [Text.Encoding]::UTF8)
        try {
            while (($Line = $Reader.ReadLine()) -ne $null) {
                if ($Line.Contains($TemporaryKey, [StringComparison]::Ordinal)) { $Matches++ }
            }
        } finally { $Reader.Dispose() }
    }
    Write-Output "G4_IM_LOGIN_TEMPORARY_TOTP: configuration_bytes_unchanged=true; environment_restored=true; scanned_logs=$($Files.Count); temporary_secret_matches=$Matches; production_modified=false"
    if ($Matches -ne 0) { throw 'Temporary TOTP secret appeared in service logs' }
}
