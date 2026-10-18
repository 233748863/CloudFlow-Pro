param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r110')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-settlement-validation-run-20261006-$Round"
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
if(Test-Path -LiteralPath $Output){throw 'Retain original settlement validation evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($Path in @('scripts/run-h2-settlement-validation.ps1','scripts/verify-hr-settlement-foundation.ps1','scripts/hr-checks/HrSettlementFoundationChecks.java','scripts/hr-checks/HrSettlementReservationChecks.java')){
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
$Originals=Join-Path $Output 'original-source'
[IO.Directory]::CreateDirectory($Originals)|Out-Null
foreach($Item in $Inputs|Where-Object{$_.Path -like 'scripts/*'}){Copy-Item -LiteralPath (Join-Path $Root $Item.Path) -Destination (Join-Path $Originals (Split-Path -Leaf $Item.Path))}
$Modes=@(
    @{Name='foundation';Arguments=@{}},
    @{Name='reservation';Arguments=@{SourceReservation=$true}},
    @{Name='funds-netting';Arguments=@{Funds=$true;FundsKind='NETTING'}},
    @{Name='funds-payment';Arguments=@{Funds=$true;FundsKind='PAYMENT'}},
    @{Name='funds-receipt';Arguments=@{Funds=$true;FundsKind='RECEIPT'}},
    @{Name='reversal-netting';Arguments=@{Funds=$true;FundsKind='NETTING';ReversalLifecycle=$true}},
    @{Name='reversal-payment';Arguments=@{Funds=$true;FundsKind='PAYMENT';ReversalLifecycle=$true}},
    @{Name='reversal-receipt';Arguments=@{Funds=$true;FundsKind='RECEIPT';ReversalLifecycle=$true}}
)
$Results=[Collections.Generic.List[object]]::new()
foreach($Mode in $Modes){
    $Arguments=$Mode.Arguments
    $LogPath=Join-Path $Output "$($Mode.Name).log"
    $Failure=$null
    try{& scripts/verify-hr-settlement-foundation.ps1 -StatePath $StatePath @Arguments *> $LogPath;if($LASTEXITCODE -ne 0){$Failure='NonzeroExit'}}catch{$Failure=$_.Exception.GetType().Name}
    $Log=Get-Content -LiteralPath $LogPath -Raw
    $Cleaned=$Log.Contains('owned_schema_remaining=0; runtime_tables=374; shared_redis_flush=false; production_modified=false')
    $Unchanged=$Log -match 'H2_SETTLEMENT_FOUNDATION_DATABASE_INPUTS: files=\d+; changed=0'
    $Summary=@($Log -split '\r?\n'|Where-Object{$_ -match '^H2_.*checks=\d+'})
    $CommissionSummary=@($Log -split '\r?\n'|Where-Object{$_ -match '^H3_COMMISSION_SETTLEMENT_DATABASE: failed=0;.*original_commission_and_refund=true; actual_payment_return_and_repayment=true; source_audit_rollback=true; concurrent_return=true; late_replay=true;'})
    $CommissionExpected=$Mode.Name -like 'reversal-*'
    $Passed=$null -eq $Failure -and $Cleaned -and $Unchanged -and $Summary.Count -gt 0 -and (-not $CommissionExpected -or $CommissionSummary.Count -eq 1)
    $Results.Add([pscustomobject]@{Name=$Mode.Name;Passed=$Passed;FailureType=$Failure;ScratchCleaned=$Cleaned;InputUnchanged=$Unchanged;Summary=$Summary;CommissionLifecycleExpected=$CommissionExpected;CommissionSummary=$CommissionSummary})
    $Results|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'progress.json') -Encoding utf8NoBOM
    "H2_VALIDATION_MODE: name=$($Mode.Name); passed=$Passed; scratch_cleaned=$Cleaned"
    if(-not $Passed){throw 'Settlement validation failed; retain the original diagnostics'}
}
Assert-Inputs
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Modes=@($Results);SourceInputs=$Inputs.Count;BinaryInputs=$Binaries.Count;InputChanges=0;ProductModified=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H2_VALIDATION_SUMMARY: modes=$($Results.Count); inputs=$($Inputs.Count); binaries=$($Binaries.Count); changed=0; passed=true"
