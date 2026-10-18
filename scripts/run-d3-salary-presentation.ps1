param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-salary-presentation-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous salary PDF evidence'}
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
$Originals=@('scripts/run-d3-salary-presentation.ps1','scripts/verify-d3-salary-presentation.mjs','scripts/run-d3-salary-presentation-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs','scripts/runtime-checks/D3SalaryPdfProbe.java')
$Paths=$Originals+@('scripts/runtime-checks/form-browser-auth.mjs','scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs',
    'docs/prd/D3-HR-薪资批量与个税-PRD.md')
$Paths+=@($State.services|ForEach-Object{".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($_.name)/service.args"; ".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($_.name)/integration.properties"})
foreach($Service in $State.services){
    foreach($Setting in @(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/integration.properties")|Where-Object {$_ -like 'spring.redis.redisson.file=file:*'})){
        $Config=[IO.Path]::GetFullPath($Setting.Substring('spring.redis.redisson.file=file:'.Length))
        if(-not $Config.StartsWith($Run+'\private\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned Redis pool configuration required'}
        $Paths+=[IO.Path]::GetRelativePath($Root,$Config)
    }
}
foreach($File in $Paths){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Salary PDF execution input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($File in $Originals){[IO.File]::Copy((Join-Path $Root $File),(Join-Path $Output ('original-'+(Split-Path -Leaf $File))),$false)}
Push-Location $Root
try {
    & node scripts/verify-d3-salary-presentation.mjs --d1-leave --d3-salary-presentation --output $Output *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    Assert-Inputs
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^D3_'}
    "D3_SALARY_PRESENTATION_INPUTS: files=$($Inputs.Count); changed=0; exit=$RunExit"
    if($RunExit -ne 0){throw 'Salary PDF verification failed; evidence retained'}
    $Result=Get-Content -LiteralPath (Join-Path $Output 'result.json') -Raw|ConvertFrom-Json
    foreach($Property in @('passed','content','preservation','secrets')){
        if($Result.$Property -ne $true){throw "Salary PDF evidence missing: $Property"}
    }
    if($Result.all18Complete -or $Result.globalComplete -or $Result.officialTaxPolicyVerified){throw 'Verification boundary changed'}
    'D3_SALARY_PRESENTATION_RUN_EXIT=0'
} finally {Pop-Location}
