param([Parameter(Mandatory = $true)][string]$StatePath, [ValidateSet('Prepare','Restore')][string]$Action = 'Prepare', [string]$FixturePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running isolated environment required' }
$Private = Join-Path $Run 'private'
$Configuration = Join-Path $Run 'auth/integration.properties'
foreach ($Candidate in @($Root,$Run,$StateFile,$Private,(Split-Path -Parent $Configuration),$Configuration)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected path rejected' }
}
function Hash([byte[]]$Bytes) { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)) }
if ($Action -eq 'Restore') {
    $ManifestFile = (Resolve-Path -LiteralPath $FixturePath).Path
    $Fixture = Split-Path -Parent $ManifestFile
    if ((Split-Path -Parent $Fixture) -ne $Private -or (Split-Path -Leaf $Fixture) -notmatch '^im-config-[a-f0-9]{32}$' -or (Split-Path -Leaf $ManifestFile) -ne 'fixture.json') { throw 'Owned IM fixture required' }
    $Backup = Join-Path $Fixture 'auth.properties.before'
    foreach ($Candidate in @($Fixture,$ManifestFile,$Backup)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected fixture rejected' }
    }
    $Manifest = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
    if ($Manifest.statePath -ne $StateFile -or $Manifest.status -ne 'PREPARED' -or (Hash ([IO.File]::ReadAllBytes($Backup))) -ne $Manifest.originalHash -or (Hash ([IO.File]::ReadAllBytes($Configuration))) -ne $Manifest.appliedHash) { throw 'Fixture ownership or configuration changed; restore refused' }
    [IO.File]::WriteAllBytes($Configuration, [IO.File]::ReadAllBytes($Backup))
    if ((Hash ([IO.File]::ReadAllBytes($Configuration))) -ne $Manifest.originalHash) { throw 'Exact IM configuration restoration failed' }
    $Manifest.status = 'RESTORED'
    [IO.File]::WriteAllText($ManifestFile, ($Manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-Output 'G4_IM_FIXTURE_RESTORED=true; original_bytes_restored=true; restart_required=true; production_modified=false'
    exit 0
}
$Original = [IO.File]::ReadAllBytes($Configuration)
$OriginalText = [Text.Encoding]::UTF8.GetString($Original)
if ($OriginalText -match '(?m)^\s*cloudflow\.im\.') { throw 'Existing IM configuration must not be overwritten' }
$Fixture = Join-Path $Private ('im-config-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Fixture) | Out-Null
[IO.File]::WriteAllBytes((Join-Path $Fixture 'auth.properties.before'), $Original)
$Key = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$Append = "`ncloudflow.im.enabled=false`ncloudflow.im.secret-key=$Key`ncloudflow.im.public-url=https://im-config.example.invalid`n"
$Applied = [Text.UTF8Encoding]::new($false).GetBytes($OriginalText + $Append)
$Manifest = [ordered]@{ statePath=$StateFile; status='PREPARED'; originalHash=(Hash $Original); appliedHash=(Hash $Applied) }
$ManifestFile = Join-Path $Fixture 'fixture.json'
[IO.File]::WriteAllText($ManifestFile, ($Manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllBytes($Configuration, $Applied)
Write-Output 'G4_IM_FIXTURE_PREPARED=true; isolated_key=true; external_connections_enabled=false; restart_required=true; production_modified=false'
Write-Output "G4_IM_FIXTURE_PATH=$ManifestFile"
