param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r116')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-current-compensation-checks-20261007-$Round"
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
if(Test-Path -LiteralPath $Output){throw 'Retain original settlement validation evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($Path in @('scripts/run-h2-current-compensation-checks.ps1','scripts/verify-hr-settlement-foundation.ps1','scripts/verify-hr-settlement-calculation.ps1','scripts/hr-checks/HrSettlementCalculationChecks.java','scripts/hr-checks/HrSettlementSalarySourceChecks.java','scripts/hr-checks/HrSeveranceRuleChecks.java')){
    $Inputs+=[pscustomobject]@{Path=$Path;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $Path)).Hash}
}
$BinaryPaths=@()
foreach($Module in @('cloudflow-service-hr','cloudflow-service-oa')){
    $ModuleRoot=Join-Path $Root "cloudflow-backend/$Module"
    $Classpath=Join-Path $ModuleRoot 'target/report-classpath.txt'
    $BinaryPaths+=$Classpath
    $Entries=@((Join-Path $ModuleRoot 'target/classes'))+(Get-Content -LiteralPath $Classpath -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach($Entry in $Entries){
        if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Dependency must remain on data drive'}
        if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -Recurse -File|ForEach-Object FullName)}else{$BinaryPaths+=$Entry}
    }
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Settlement validation source changed'}}
    foreach($Item in $Binaries){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Settlement validation binary changed'}}
}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
$ReferenceHash=(Get-FileHash -LiteralPath $StatePath).Hash
$Reference=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
function Assert-Reference {
    if($Reference.status -ne 'RUNNING' -or $Reference.processes.Count -ne 9 -or $Reference.services.Count -ne 6 -or (Get-FileHash -LiteralPath $StatePath).Hash -ne $ReferenceHash){throw 'Reference runtime changed'}
    foreach($Entry in $Reference.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Reference process ownership changed'}
    }
    foreach($Service in $Reference.services){
        if((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -ne 'UP'){throw 'Reference service unhealthy'}
    }
}
Assert-Reference
$Originals=Join-Path $Output 'original-source'
[IO.Directory]::CreateDirectory($Originals)|Out-Null
foreach($Item in $Inputs|Where-Object{$_.Path -like 'scripts/*'}){Copy-Item -LiteralPath (Join-Path $Root $Item.Path) -Destination (Join-Path $Originals (Split-Path -Leaf $Item.Path))}
$Modes=@(
    @{Name='calculation';Database=$false;Arguments=@{};Expected='^H2_SETTLEMENT_CALCULATION: checks=111; failed=0;'},
    @{Name='salary-sampling';Database=$true;Arguments=@{SalarySampling=$true};Expected='^H2_SETTLEMENT_SALARY_SAMPLING_DATABASE: checks=67; failed=0;'},
    @{Name='severance-policy';Database=$true;Arguments=@{SeverancePolicy=$true};Expected='^H2_SEVERANCE_POLICY_DATABASE: checks=61; failed=0;'}
)
$Results=[Collections.Generic.List[object]]::new()
$CalculationArtifacts=@()
foreach($Mode in $Modes){
    $Arguments=$Mode.Arguments
    $LogPath=Join-Path $Output "$($Mode.Name).log"
    $Failure=$null
    try{
        if($Mode.Database){& scripts/verify-hr-settlement-foundation.ps1 -StatePath $StatePath @Arguments *> $LogPath}
        else{& scripts/verify-hr-settlement-calculation.ps1 *> $LogPath}
        if($LASTEXITCODE -ne 0){$Failure='NonzeroExit'}
    }catch{$Failure=$_.Exception.GetType().Name}
    $Log=Get-Content -LiteralPath $LogPath -Raw
    $Cleaned=if($Mode.Database){$Log.Contains('owned_schema_remaining=0; runtime_tables=374; shared_redis_flush=false; production_modified=false')}else{$null}
    $Unchanged=if($Mode.Database){$Log -match 'H2_SETTLEMENT_FOUNDATION_DATABASE_INPUTS: files=\d+; changed=0'}else{$Log -match 'H2_SETTLEMENT_CALCULATION_EVIDENCE='}
    Assert-Inputs
    $Summary=@($Log -split '\r?\n'|Where-Object{$_ -match '^H2_.*checks=\d+'})
    $Passed=$null -eq $Failure -and (-not $Mode.Database -or $Cleaned) -and $Unchanged -and @($Summary|Where-Object{$_ -match $Mode.Expected}).Count -eq 1
    $Results.Add([pscustomobject]@{Name=$Mode.Name;Database=$Mode.Database;Passed=$Passed;FailureType=$Failure;ScratchCleaned=$Cleaned;InputUnchanged=$Unchanged;Summary=$Summary})
    $Results|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'progress.json') -Encoding utf8NoBOM
    "H2_COMPENSATION_MODE: name=$($Mode.Name); passed=$Passed; scratch_cleaned=$Cleaned"
    if(-not $Passed){throw 'Compensation verification failed; retain original diagnostics'}
    if(-not $Mode.Database){
        $Match=[regex]::Match($Log,'(?m)^H2_SETTLEMENT_CALCULATION_EVIDENCE=(.+)$')
        $CalculationDirectory=[IO.Path]::GetFullPath($Match.Groups[1].Value.Trim())
        if((Split-Path -Parent $CalculationDirectory) -ne (Join-Path $Root '.cloudflow-runtime/hr-settlement-calculation') -or (Split-Path -Leaf $CalculationDirectory) -notmatch '^[a-f0-9]{32}$'){throw 'Unexpected calculation artifact path'}
        $CalculationArtifacts=@(Get-ChildItem -LiteralPath $CalculationDirectory -Recurse -File|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
        if($CalculationArtifacts.Count -lt 2){throw 'Calculation artifacts missing'}
    }
}
Assert-Inputs
Assert-Reference
[pscustomobject]@{Passed=$true;ReferenceProcesses=9;ReferenceHealthyServices=6;BackendRound=$BackendRound;Modes=@($Results);CalculationArtifacts=$CalculationArtifacts;SourceInputs=$Inputs.Count;BinaryInputs=$Binaries.Count;InputChanges=0;ProductModified=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H2_COMPENSATION_SUMMARY: modes=$($Results.Count); inputs=$($Inputs.Count); binaries=$($Binaries.Count); changed=0; passed=true"
