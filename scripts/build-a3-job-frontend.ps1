param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='a3-job-management-20261002'
Push-Location $Root
try {
    $SnapshotPath=Join-Path $Evidence "$Prefix-frontend-inputs-$Round.json"
    $Types=Join-Path $Evidence "$Prefix-type-check-$Round.log"
    $Build=Join-Path $Evidence "$Prefix-frontend-build-$Round.log"
    foreach($File in @($SnapshotPath,$Types,$Build)){if(Test-Path -LiteralPath $File){throw 'Retain existing evidence'}}
    $Backend=@(Get-Content -LiteralPath (Join-Path $Evidence 'f4-sign-methods-20261002-backend-inputs-r8.json') -Raw|ConvertFrom-Json)
    if(@($Backend|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Backend differs from R8 build'}
    $Previous=@(Get-Content -LiteralPath (Join-Path $Evidence 'f4-sign-methods-20261002-frontend-inputs-r8.json') -Raw|ConvertFrom-Json)
    $Changed=@($Previous|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash})
    $Expected=@('cloudflow-frontend/src/pages/system/job/Index.tsx','cloudflow-frontend/src/pages/system/job/Log.tsx','cloudflow-frontend/src/index.css')
    if($Changed.Count -ne 3 -or @($Changed|Where-Object{$_.Path.Replace('\','/') -notin $Expected}).Count){throw 'Unexpected product modification'}
    $Files=@(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo'|Sort-Object)
    $Inputs=@($Files|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $SnapshotPath -Encoding utf8
    Push-Location cloudflow-frontend
    try {
        & npm run type-check *> $Types
        if($LASTEXITCODE -ne 0){throw 'Frontend types failed'}
        & npm run build *> $Build
        if($LASTEXITCODE -ne 0){throw 'Frontend build failed'}
    } finally { Pop-Location }
    if(@(@($Backend)+@($Inputs)|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product changed during build'}
    "A3_FRONTEND_INPUTS: backend=$($Backend.Count); frontend=$($Inputs.Count); changed_during_build=0"
    'A3_FRONTEND_BUILD: backend_matches_r8=true; changed_frontend_files=3; frontend_types=0; frontend_build=0; inputs_unchanged=true'
} finally { Pop-Location }
