param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^[a-z0-9-]+$')][string]$Prefix='f4-sign-methods-20261002')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
Push-Location $Root
try {
    foreach($Kind in @('backend','frontend')) {
        $Path=Join-Path $Evidence "$Prefix-$Kind-inputs-$Round.json"
        if(Test-Path -LiteralPath $Path){throw 'Retain existing evidence'}
        $Files=if($Kind -eq 'backend') {
            @(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log'|Sort-Object)
        } else {
            @(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo'|Sort-Object)
        }
        $Inputs=@($Files|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
        $Inputs|ConvertTo-Json|Set-Content -LiteralPath $Path -Encoding utf8
    }
    $Install=Join-Path $Evidence "$Prefix-install-$Round.log"
    if(Test-Path -LiteralPath $Install){throw 'Retain build evidence'}
    Push-Location cloudflow-backend
    try { & mvn '-DskipTests' install *> $Install; if($LASTEXITCODE -ne 0){throw 'Full Maven build failed'} } finally { Pop-Location }
    Push-Location cloudflow-frontend
    try {
        $Types=Join-Path $Evidence "$Prefix-type-check-$Round.log"; $Build=Join-Path $Evidence "$Prefix-frontend-build-$Round.log"
        if((Test-Path -LiteralPath $Types) -or (Test-Path -LiteralPath $Build)){throw 'Retain frontend evidence'}
        & npm run type-check *> $Types; if($LASTEXITCODE -ne 0){throw 'Frontend types failed'}
        & npm run build *> $Build; if($LASTEXITCODE -ne 0){throw 'Frontend build failed'}
    } finally { Pop-Location }
    foreach($Kind in @('backend','frontend')) {
        $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-$Kind-inputs-$Round.json") -Raw|ConvertFrom-Json)
        if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product changed during build'}
        "F4_SIGN_BUILD_INPUTS: kind=$Kind; files=$($Inputs.Count); changed=0"
    }
    'F4_SIGN_BUILD: backend_install=0; frontend_types=0; frontend_build=0'
} finally { Pop-Location }
