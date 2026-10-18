param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d2-month-batch-checks-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous D2 month batch evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
$ExecutionSources=@('scripts/run-d2-month-batch-checks.ps1','scripts/verify-hr-settlement-foundation.ps1','scripts/hr-checks/HrAttendanceMonthBatchChecks.java')
foreach($Name in $ExecutionSources){
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
foreach($Source in $ExecutionSources){
    [IO.File]::Copy((Join-Path $Root $Source),(Join-Path $Output ('original-'+(Split-Path -Leaf $Source))),$false)
}
Push-Location $Root
try {
    & scripts/verify-hr-settlement-foundation.ps1 -StatePath (Join-Path $Run 'state.json') -AttendanceMonthBatch *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    Assert-Inputs
    $Log=Get-Content -LiteralPath (Join-Path $Output 'live.log') -Raw
    $BoundaryMatch=[regex]::Match($Log,'D2_MONTH_BATCH: checks=(\d+); actual_mysql=true; actual_service=true; production_tenant_interceptor=true;')
    if($RunExit -ne 0 -or -not $BoundaryMatch.Success){throw 'D2 month batch boundary verification failed; evidence retained'}
    $Checks=[int]$BoundaryMatch.Groups[1].Value
    if(-not $Log.Contains('owned_schema_remaining=0; runtime_tables=374; shared_redis_flush=false; production_modified=false')){throw 'Scratch cleanup evidence missing'}
    $Result=[pscustomobject]@{Passed=$true;Checks=$Checks;BackendRound=$BackendRound;SourceInputs=$Inputs.Count;BinaryInputs=$Binaries.Count;InputChanges=0;ActualDatabase=$true;ActualService=$true;DistributedLock=$false;Http=$false;SystemClockChanged=$false;ScratchCleaned=$true}
    $Result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^D2_|^H2_SETTLEMENT_FOUNDATION_DATABASE_CLEANUP:'}
    "D2_MONTH_BATCH_INPUTS: files=$($Inputs.Count); binaries=$($Binaries.Count); changed=0; exit=0"
    'D2_MONTH_BATCH_RUN_EXIT=0'
} finally {Pop-Location}
