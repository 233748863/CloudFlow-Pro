param([ValidateSet('Backend','Frontend')][string]$Phase='Backend',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix="h3-portal-finance-20261002-$($Phase.ToLowerInvariant())-$Round"
$InputPath=Join-Path $Evidence "$Prefix-inputs.json"
$LogPath=Join-Path $Evidence "$Prefix.log"
if ((Test-Path -LiteralPath $InputPath) -or (Test-Path -LiteralPath $LogPath)) { throw 'Evidence already exists; use a new round' }
$Module=if ($Phase -eq 'Backend') { 'cloudflow-backend' } else { 'cloudflow-frontend' }
Push-Location $Root
try {
    $Paths=@(rg --files --hidden --no-ignore $Module -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/dist/**' -g '!**/*.log' | Sort-Object)
    $Before=@($Paths | ForEach-Object { [pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash} })
    $Before | ConvertTo-Json | Set-Content -LiteralPath $InputPath -Encoding utf8NoBOM
    Push-Location (Join-Path $Root $Module)
    try {
        if ($Phase -eq 'Backend') {
            & mvn '-DskipTests' install *> $LogPath
            $BuildExit=$LASTEXITCODE
        } else {
            & npm run type-check *> $LogPath
            $BuildExit=$LASTEXITCODE
            if ($BuildExit -eq 0) { & npm run build >> $LogPath 2>&1; $BuildExit=$LASTEXITCODE }
        }
    } finally { Pop-Location }
    $After=@(rg --files --hidden --no-ignore $Module -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/dist/**' -g '!**/*.log' | Sort-Object)
    $Changes=@(Compare-Object $Paths $After).Count + @($Before | Where-Object { -not (Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path -Algorithm SHA256).Hash -ne $_.Hash }).Count
    "FINANCE_BUILD: phase=$Phase; files=$($Before.Count); changed=$Changes; exit=$BuildExit" | Add-Content -LiteralPath $LogPath
    Get-Content -LiteralPath $LogPath | Where-Object { $_ -match '^\[INFO\] (BUILD |Total time:)|^FINANCE_BUILD:|^\[ERROR\]|error TS' } | Select-Object -First 35
    if ($BuildExit -ne 0 -or $Changes -ne 0) { throw 'Finance build failed or inputs changed; preserve this evidence' }
} finally { Pop-Location }
