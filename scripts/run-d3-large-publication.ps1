param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-large-publication-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous large amount evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
$Inputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
}
$Originals=@('scripts/run-d3-large-publication.ps1','scripts/verify-d3-large-amounts.mjs','scripts/run-d3-large-publication-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs','scripts/runtime-checks/form-browser-auth.mjs')
$Paths=$Originals+@('scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs','scripts/runtime-checks/d3-large-publication.mjs','scripts/runtime-checks/D3SalaryPdfProbe.java',
    'docs/prd/D3-HR-薪资批量与个税-PRD.md','.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-payroll-deductions-20261006-r2/fixture.json')
$Paths+=@($State.services|ForEach-Object{".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($_.name)/service.args"; ".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($_.name)/integration.properties"})
foreach($Service in $State.services){
    foreach($Setting in @(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/integration.properties")|Where-Object {$_ -like 'spring.redis.redisson.file=file:*'})){
        $Config=[IO.Path]::GetFullPath($Setting.Substring('spring.redis.redisson.file=file:'.Length))
        if(-not $Config.StartsWith($Run+'\private\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned Redis pool configuration required'}
        $Paths+=[IO.Path]::GetRelativePath($Root,$Config)
    }
}
foreach($File in $Paths){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Large amount execution input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($File in $Originals){[IO.File]::Copy((Join-Path $Root $File),(Join-Path $Output ('original-'+(Split-Path -Leaf $File))),$false)}
Push-Location $Root
try {
    & node scripts/verify-d3-large-amounts.mjs --d1-leave --d3-large-amounts --d3-large-publication --output $Output *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    Assert-Inputs
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^D3_'}
    "D3_LARGE_PUBLICATION_INPUTS: files=$($Inputs.Count); changed=0; exit=$RunExit"
    if($RunExit -ne 0){throw 'Large amount verification failed; evidence retained'}
    $Result=Get-Content -LiteralPath (Join-Path $Output 'result.json') -Raw|ConvertFrom-Json
    foreach($Property in @('passed','storage','calculation','transport','browser','input','publication','pdf','ess','nextPeriod','presentation','compensationUi','preservation','restoration','secrets')){
        if($Result.$Property -ne $true){throw "Large amount evidence missing: $Property"}
    }
    if($Result.all18Complete -or $Result.globalComplete -or $Result.officialTaxPolicyVerified){throw 'Verification boundary changed'}
    'D3_LARGE_PUBLICATION_RUN_EXIT=0'
} finally {Pop-Location}
