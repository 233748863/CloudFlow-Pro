param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Allowed = (Join-Path $Root '.cloudflow-runtime/batch-g-integration').TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$StatePath = (Resolve-Path -LiteralPath $StatePath).Path
if (-not $StatePath.StartsWith($Allowed, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $StatePath) -ne 'state.json') { throw 'Integration state is outside the expected workspace' }
$State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($State.run) -ne (Split-Path -Parent $StatePath)) { throw 'Integration state run directory mismatch' }
$ExpectedData = [IO.Path]::GetFullPath((Join-Path $State.run 'mysql-data'))
if ([IO.Path]::GetFullPath($State.data) -ne $ExpectedData) { throw 'Integration MySQL directory mismatch' }
foreach ($Owned in @($State.processes | Sort-Object { if ($_.name -eq 'mysql') { 1 } else { 0 } })) {
    $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
    if (-not $Current) { continue }
    if (-not $Current.CommandLine -or -not $Current.CommandLine.Contains($Owned.marker)) { Write-Warning "Process identity changed: $($Owned.name); leaving the unrelated process untouched"; continue }
    if ($Owned.name -eq 'mysql' -and -not $Current.CommandLine.Contains($State.data)) { throw 'MySQL process data directory mismatch' }
    [Diagnostics.Process]::GetProcessById($Owned.id).Kill($true)
    Wait-Process -Id $Owned.id -Timeout 20 -ErrorAction SilentlyContinue
}
foreach ($Worker in @(Get-CimInstance Win32_Process -Filter "Name = 'mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ExpectedData) })) {
    $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Worker.ProcessId)"
    if ($Current -and $Current.CommandLine.Contains($ExpectedData)) {
        [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill($true)
        Wait-Process -Id $Current.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
    }
}
$State.status = 'STOPPED'
$State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding utf8
Write-Output 'Owned integration processes stopped; diagnostics and data retained.'
