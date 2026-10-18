param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='full-oa-regression-20261002'
$Log=Join-Path $Evidence "$Prefix-database-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-$Round.json"
foreach($Path in @($Log,$InputPath)){if(Test-Path -LiteralPath $Path){throw 'Existing evidence must be retained'}}
Push-Location $Root
try {
    $Backend=@(Get-Content -LiteralPath (Join-Path $Evidence 'f4-sign-methods-20261002-backend-inputs-r8.json') -Raw|ConvertFrom-Json)
    if(@($Backend|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Backend differs from verified build'}
    $Paths=@($Backend.Path)+@(rg --files scripts/oa-checks -g '*.java')+@('scripts/verify-batch-f-db.ps1','scripts/verify-batch-f.ps1',
        'scripts/run-current-oa-regression.ps1','cloudflow-backend/cloudflow-service-oa/target/batch-f-classpath.txt')
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    $Result=1
    try {
        & scripts/verify-batch-f-db.ps1 -SkipBuild *> $Log
        $Result=$LASTEXITCODE
    } catch {
        'CURRENT_OA_FAILURE: inner_verification_failed=true; original_output_retained=true' | Add-Content -LiteralPath $Log
    }
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'OA regression inputs changed'}
    "CURRENT_OA_INPUTS: files=$($Inputs.Count); changed=0; exit=$Result" | Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS:|CURRENT_OA_|Isolated MySQL stopped|Temporary data removed)'}|Select-Object -Last 9
    if($Result -ne 0){throw 'Current OA database regression failed; original evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach($Marker in @('PASS: isolated 01-07 OA database acceptance','PASS: \d+ OA boundary assertions','Temporary data removed; logs retained')) {
        if($Content -notmatch $Marker){throw 'OA database regression completion evidence missing'}
    }
    'CURRENT_OA_REGRESSION: database=true; remote_dependencies_are_doubles=true; real_http=false; production_modified=false'
} finally { Pop-Location }
