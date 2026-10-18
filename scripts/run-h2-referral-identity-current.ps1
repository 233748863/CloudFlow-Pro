param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r116')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-referral-identity-current-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous referral identity verification'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
$Originals=@('scripts/run-h2-referral-identity-current.ps1','scripts/verify-hr-referral-identities.ps1','scripts/hr-checks/HrReferralIdentityChecks.java')
foreach($File in $Originals){
    $Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}
    Copy-Item -LiteralPath (Join-Path $Root $File) -Destination (Join-Path $Output ('original-'+(Split-Path -Leaf $File)))
}
$Hr=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Auth=Join-Path $Root 'cloudflow-backend/cloudflow-auth'
$Classpaths=@((Join-Path $Hr 'target/report-classpath.txt'),(Join-Path $Auth 'target/im-classpath.txt'))
$Entries=@((Join-Path $Hr 'target/classes'),(Join-Path $Auth 'target/classes'))
foreach($Classpath in $Classpaths){$Entries+=(Get-Content -LiteralPath $Classpath -Raw).Trim().Split([IO.Path]::PathSeparator)}
$BinaryPaths=@($Classpaths)
foreach($Entry in @($Entries|Sort-Object -Unique)){
    if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Identity dependencies must remain on data drive'}
    if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -Recurse -File|ForEach-Object FullName)}else{$BinaryPaths+=$Entry}
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Identity source differs from verified build'}}
    foreach($Item in $Binaries){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Identity binary changed'}}
}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
$Failure=$null;$VerifierExit=$null
try{
    & scripts/verify-hr-referral-identities.ps1 -StatePath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') *> (Join-Path $Output 'database.log')
    $VerifierExit=$LASTEXITCODE
    if($VerifierExit -ne 0){$Failure='NonzeroExit'}
}catch{$Failure=$_.Exception.Message.Split([char]10)[0]}
Assert-Inputs
$Log=Get-Content -LiteralPath (Join-Path $Output 'database.log') -Raw
$Match=[regex]::Match($Log,'H2_REFERRAL_IDENTITIES: checks=(\d+); failed=0; real_mysql=true; same_transaction=true; concurrent_writers=2; nested_rollback=true; resume_scope=true; actual_http=false; contact_output=0')
$Cleaned=$Log -match 'H2_REFERRAL_CORE_DATABASE_CLEANUP: owned_schema_remaining=0; runtime_tables=374; shared_redis_flush=false; production_modified=false'
$Passed=$null -eq $Failure -and $VerifierExit -eq 0 -and $Match.Success -and $Cleaned -and $Log -match 'H2_REFERRAL_CORE_EMPTY_DATABASE: expected=374; actual=374; runtime_tables=374' -and $Log -match 'H2_OFFER_DECISIONS: scenarios=6; checks=70; failed=0; actual_mapper=true; real_mysql=true; actual_http=false'
$Count=if($Match.Success){[int]$Match.Groups[1].Value}else{0}
$Result=[pscustomobject]@{passed=$Passed;backend=$BackendRound;checks=$Count;sourceInputs=$Inputs.Count;binaryInputs=$Binaries.Count;inputsUnchanged=$true;verifierExit=$VerifierExit;scratchCleaned=$Cleaned;formalTables=374;http=$false;concurrentWriters=2;offerDecisionScenarios=6;failure=$Failure;productModified=$false;globalComplete=$false}
$Result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H2_REFERRAL_IDENTITY_CURRENT: passed=$Passed; checks=$Count; sources=$($Inputs.Count); binaries=$($Binaries.Count); scratch_cleaned=$Cleaned; http=false; product_modified=false"
if(-not $Passed){throw 'Current identity verification failed; original diagnostics retained'}
