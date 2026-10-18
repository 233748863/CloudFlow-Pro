param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [string]$BackendInputs='h5-generated-import-20261002-backend-inputs-r1.json')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Log=Join-Path $Evidence "h5-employee-certificate-20261002-http-$Round.log"
$InputPath=Join-Path $Evidence "h5-employee-certificate-20261002-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
function Assert-ProductInputs {
    foreach($File in @($BackendInputs,'h2-asset-reminder-frontend-inputs-20261001-r2.json')) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-hr-employee-certificate-capacity.mjs',
        'scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs','scripts/run-hr-employee-certificate-capacity.ps1')
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args"; Join-Path $Run "$($_.name)/integration.properties"})
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --hr-skills-only --hr-employee-certificate-capacity *> $Log
    $Result=$LASTEXITCODE
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Employee certificate verification or runtime inputs changed'}
    Assert-ProductInputs
    "EMPLOYEE_CERTIFICATE_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |H5_|EMPLOYEE_CERTIFICATE_)'}|Select-Object -Last 9
    if($Result -ne 0){throw 'Employee certificate capacity failed; original evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach($Pattern in @('"identity":true','"capacity":true','"retry":true','"cleanup":true','"secrets":true','failed=0; requests=')) {
        if($Content -notmatch $Pattern){throw 'Employee certificate completion evidence missing'}
    }
    'EMPLOYEE_CERTIFICATE_RUN_EXIT=0'
} finally { Pop-Location }
