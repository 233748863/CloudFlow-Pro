param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r114')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-overtime-database-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original overtime database evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
$Originals=@('scripts/run-h2-overtime-database.ps1','scripts/verify-batch-e-db.ps1','scripts/verify-h2-overtime-database.ps1','scripts/hr-db-checks/Hr09DatabaseChecks.java')
foreach($File in $Originals){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash};Copy-Item -LiteralPath (Join-Path $Root $File) -Destination (Join-Path $Output ('original-'+(Split-Path -Leaf $File)))}
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Classpath=Join-Path $Module 'target/report-classpath.txt'
$BinaryPaths=@($Classpath)
foreach($Entry in @((Join-Path $Module 'target/classes'))+(Get-Content -LiteralPath $Classpath -Raw).Trim().Split([IO.Path]::PathSeparator)){
    if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Overtime dependencies must remain on data drive'}
    if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -Recurse -File|ForEach-Object FullName)}else{$BinaryPaths+=$Entry}
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Overtime database source changed'}}
    foreach($Item in $Binaries){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Overtime database binary changed'}}
}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
$Failure=$null
try{
    & scripts/verify-batch-e-db.ps1 -SkipBuild -SkipBehavior -SkipDemo -HrOvertimeCheck -ArtifactRoot $Output *> (Join-Path $Output 'database.log')
    if($LASTEXITCODE -ne 0){$Failure='NonzeroExit'}
}catch{$Failure=$_.Exception.Message.Split([char]10)[0]}
Assert-Inputs
$Log=Get-Content -LiteralPath (Join-Path $Output 'database.log') -Raw
$Cleaned=$Log -match 'Isolated MySQL stopped; existing services were not used' -and $Log -match 'Temporary data removed; logs retained'
$OwnedDirectories=@(Get-ChildItem -LiteralPath $Output -Directory -Filter 'batch-e-mysql-*')
$RemainingData=@($OwnedDirectories|Where-Object{Test-Path -LiteralPath (Join-Path $_.FullName 'data')}).Count
$RemainingProcesses=@(Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($Output)}).Count
$Passed=$null -eq $Failure -and $Cleaned -and $RemainingData -eq 0 -and $RemainingProcesses -eq 0 -and $Log -match 'PASS HR09 groups=[1-9][0-9]* assertions=(\d+) real-db-races=[1-9][0-9]* database-dropped=true'
$Checks=if($Passed){[int]$Matches[1]}else{0}
$Result=[pscustomobject]@{Passed=$Passed;BackendRound=$BackendRound;Checks=$Checks;SourceInputs=$Inputs.Count;BinaryInputs=$Binaries.Count;InputChanges=0;ScratchCleaned=$Cleaned;RemainingData=$RemainingData;RemainingProcesses=$RemainingProcesses;Http=$false;IdentityDoubles=$true;FormalDemoExecuted=$false;Failure=$Failure;ProductModified=$false;GlobalComplete=$false}
$Result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
Get-Content -LiteralPath (Join-Path $Output 'database.log')|Where-Object{$_ -match '^PASS HR09|^ISOLATION|^CLEANUP|^HR09:|^PASS: Current approved physical tables|^Isolated MySQL stopped|^Temporary data removed'}
"H2_OVERTIME_DATABASE_RUN: passed=$Passed; checks=$Checks; inputs=$($Inputs.Count); binaries=$($Binaries.Count); changed=0; scratch_cleaned=$Cleaned; failure=$Failure"
if(-not $Passed){throw 'Current overtime database validation failed; evidence retained'}
