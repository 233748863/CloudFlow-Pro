param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r150')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-commission-advance-20261011-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original advance verification evidence'}
$Sources=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($Relative in @('scripts/run-h3-commission-advance.ps1','scripts/verify-hr-advance-ledger.ps1','scripts/hr-checks/HrAdvanceLedgerChecks.java')){
    $Sources+=[pscustomobject]@{Path=$Relative;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $Relative)).Hash}
}
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Classpath=Join-Path $Module 'target/batch-d-classpath.txt'
$BinaryPaths=@($Classpath)
foreach($Entry in @((Join-Path $Module 'target/classes'))+(Get-Content -LiteralPath $Classpath -Raw).Trim().Split([IO.Path]::PathSeparator)){
    if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Compiled input outside data drive'}
    if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -Recurse -File|ForEach-Object FullName)}
    else{$BinaryPaths+=$Entry}
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Entry in $Sources){if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Path)).Hash -ne $Entry.Hash){throw 'Advance source input changed'}}
    foreach($Entry in $Binaries){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash){throw 'Advance compiled input changed'}}
}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Sources|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
foreach($Entry in $Sources|Where-Object{$_.Path -like 'scripts/*'}){
    $Copy=Join-Path $Output ('originals/'+$Entry.Path)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Entry.Path),$Copy,$false)
}
$LogPath=Join-Path $Output 'live.log'
$Failure=$null
try{
    & (Join-Path $Root 'scripts/verify-hr-advance-ledger.ps1') *> $LogPath
    if($LASTEXITCODE -ne 0){$Failure='NonzeroExit'}
}catch{$Failure=$_.Exception.GetType().Name}
$Log=Get-Content -LiteralPath $LogPath -Raw
Assert-Inputs
$Modes=@(foreach($Label in @('H2_ADVANCE_LEDGER_DATABASE','H2_ADVANCE_PAYROLL_DATABASE','H2_SETTLEMENT_SALARY_GUARDS_DATABASE','H2_ADVANCE_MANUAL_DATABASE')){
    $MatchesFound=[regex]::Matches($Log,'(?m)^'+$Label+': checks=(\d+); failed=0;[^\r\n]*')
    if($MatchesFound.Count -ne 1){throw 'Required advance verification mode missing; original log retained'}
    [pscustomobject]@{Name=$Label;Checks=[int]$MatchesFound[0].Groups[1].Value;Summary=$MatchesFound[0].Value}
})
$Cleanup=[regex]::Match($Log,'(?m)^H2_ADVANCE_LEDGER_CLEANUP: owned_processes_running=0; success=True; evidence=(.+)$')
if(-not $Cleanup.Success){throw 'Successful owned database cleanup evidence missing'}
$OwnedRun=[IO.Path]::GetFullPath($Cleanup.Groups[1].Value.Trim())
if((Split-Path -Parent $OwnedRun) -ne (Join-Path $Root '.cloudflow-runtime/hr-advance-ledger') -or
    (Split-Path -Leaf $OwnedRun) -notmatch '^[a-f0-9]{32}$' -or
    ((Get-Item -LiteralPath $OwnedRun).Attributes -band [IO.FileAttributes]::ReparsePoint)){
    throw 'Unexpected advance artifact location'
}
if(Test-Path -LiteralPath (Join-Path $OwnedRun 'data')){throw 'Successful owned database data not cleaned'}
$Artifacts=@(Get-ChildItem -LiteralPath $OwnedRun -Recurse -File|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
$Passed=$null -eq $Failure -and $Modes.Count -eq 4 -and $Artifacts.Count -gt 0
[pscustomobject]@{Passed=$Passed;Backend=$BackendRound;Modes=$Modes;SourceInputs=$Sources.Count;BinaryInputs=$Binaries.Count;
    InputChanges=0;FailureType=$Failure;ActualDatabase=$true;Http=$false;ScratchCleaned=$true;OwnedRun=$OwnedRun;
    Artifacts=$Artifacts;ProductionModified=$false;SharedRedisFlush=$false}|ConvertTo-Json -Depth 6|
    Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
foreach($Mode in $Modes){$Mode.Summary}
if(-not $Passed){throw 'Advance regression failed; original diagnostics retained'}
"H3_COMMISSION_ADVANCE: modes=4; inputs=$($Sources.Count); binaries=$($Binaries.Count); changed=0; scratch_cleaned=true; passed=true"
