param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-create-close-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous D3 payroll replay evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($Name in @('scripts/run-d3-create-close.ps1','scripts/verify-hr-settlement-foundation.ps1','scripts/hr-checks/HrPayrollCreateCloseChecks.java')){
    $Inputs+=[pscustomobject]@{Path=$Name;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $Name)).Hash}
}
$BinaryPaths=@()
foreach($Module in @('cloudflow-service-hr','cloudflow-service-oa')){
    $ModuleRoot=Join-Path $Root "cloudflow-backend/$Module"
    $ClasspathFile=Join-Path $ModuleRoot 'target/report-classpath.txt'
    $BinaryPaths+=$ClasspathFile
    $Entries=@((Join-Path $ModuleRoot 'target/classes'))+(Get-Content -LiteralPath $ClasspathFile -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach($Entry in $Entries){
        if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Dependency outside data drive'}
        if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -Recurse -File|ForEach-Object FullName)}
        else{$BinaryPaths+=$Entry}
    }
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Boundary source changed'}}
    foreach($Input in $Binaries){if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash){throw 'Boundary compiled dependency changed'}}
}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
foreach($Name in @('scripts/run-d3-create-close.ps1','scripts/verify-hr-settlement-foundation.ps1','scripts/hr-checks/HrPayrollCreateCloseChecks.java')){[IO.File]::Copy((Join-Path $Root $Name),(Join-Path $Output ('original-'+(Split-Path -Leaf $Name))),$false)}
Push-Location $Root
try {
    try {
        & scripts/verify-hr-settlement-foundation.ps1 -StatePath (Join-Path $Run 'state.json') -PayrollCreateClose *> (Join-Path $Output 'live.log')
        $RunExit=$LASTEXITCODE
    } catch { $RunExit=1 }
    Assert-Inputs
    $Log=Get-Content -LiteralPath (Join-Path $Output 'live.log') -Raw
    $BoundaryMatch=[regex]::Match($Log,'D3_PAYROLL_CREATE_CLOSE: checks=(\d+); actual_mysql=true; actual_redis=true; actual_batch_create=true; actual_close=true; actual_precheck=true; controlled_overlap=true; http=false; official_tax_policy=false')
    $Passed=$RunExit -eq 0 -and $BoundaryMatch.Success
    $Checks=[int]$BoundaryMatch.Groups[1].Value
    if(-not $Log.Contains('owned_schema_remaining=0; runtime_tables=374; shared_redis_flush=false; production_modified=false')){throw 'Scratch cleanup evidence missing'}
    $Result=[pscustomobject]@{Passed=$Passed;Checks=$Checks;BackendRound=$BackendRound;SourceInputs=$Inputs.Count;BinaryInputs=$Binaries.Count;InputChanges=0;ActualDatabase=$true;ActualService=$true;ActualBatchCreate=$true;ActualClose=$true;ActualPrecheck=$true;ControlledOverlap=$true;FreshCalculation=$false;OfficialTaxPolicy=$false;NaturalScheduler=$false;DistributedLock=$true;Http=$false;SystemClockChanged=$false;ScratchCleaned=$true}
    $Result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^D3_PAYROLL_CREATE_CLOSE:|^H2_SETTLEMENT_FOUNDATION_DATABASE_CLEANUP:|^Exception in thread'}
    if(-not $Passed){throw 'D3 payroll replay boundary verification failed; original evidence and scratch cleanup retained'}
    "D3_PAYROLL_CREATE_CLOSE_INPUTS: files=$($Inputs.Count); binaries=$($Binaries.Count); changed=0; exit=0"
    'D3_PAYROLL_CREATE_CLOSE_RUN_EXIT=0'
} finally {Pop-Location}
