param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r156',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r111',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound='r42')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
& (Join-Path $PSScriptRoot 'run-h3-core-independent.ps1') -Round $Round -BackendRound $BackendRound -FrontendRound $FrontendRound -PackageRound $PackageRound -Scenario AssetLifecycle
