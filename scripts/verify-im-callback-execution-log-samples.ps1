param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$') { throw 'Owned callback state required' }
$Evidence = @(Get-ChildItem -LiteralPath $Run -Directory -Filter 'im-callback-execution-*')
$Samples = @($Evidence | ForEach-Object {
    $File = Join-Path $_.FullName 'secret-samples.json'
    if (Test-Path -LiteralPath $File) { Get-Content -LiteralPath $File -Raw | ConvertFrom-Json }
} | Select-Object -Unique)
if ($Samples.Count -eq 0) { throw 'Callback live secret samples required' }
$Files = @(Get-ChildItem -LiteralPath (Join-Path $Run 'auth'), (Join-Path $Run 'workflow') -File -Filter '*.log') +
    @(Get-ChildItem -LiteralPath (Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime') -File -Filter 'g4-im-callback-execution-live-*.log') +
    @($Evidence | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -File -Filter 'round-trip-java.log' })
$Hits = 0
foreach ($File in $Files) {
    $Stream = [IO.File]::Open($File.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $Reader = [IO.StreamReader]::new($Stream)
    try {
        $Content = $Reader.ReadToEnd()
        foreach ($Sample in $Samples) { if ($Content.Contains([string]$Sample)) { $Hits++ } }
    } finally { $Reader.Dispose() }
}
if ($Hits -ne 0) { throw "Callback live secret scan failed; hits=$Hits" }
Write-Output "G4_IM_CALLBACK_EXECUTION_LOG_SAMPLES: files=$($Files.Count); samples=$($Samples.Count); hits=0; raw_auth_workflow_logs=true; historical_owned_logs=true; vendor_credentials=false"
