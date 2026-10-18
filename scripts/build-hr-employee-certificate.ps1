param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix="h5-employee-certificate-20261002"
$Log=Join-Path $Evidence "$Prefix-install-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-backend-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence retained'}}
Push-Location $Root
try {
    $Inputs=@(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log'|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    Push-Location cloudflow-backend
    try { & mvn '-DskipTests' install *> $Log; $Result=$LASTEXITCODE } finally { Pop-Location }
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Backend inputs changed during build'}
    "BACKEND_INPUTS: files=$($Inputs.Count); changes=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match 'BUILD SUCCESS|BUILD FAILURE|BACKEND_INPUTS|\[static-rules\]'}|Select-Object -Last 5
    if($Result -ne 0){throw 'Full Maven build failed'}
} finally { Pop-Location }
