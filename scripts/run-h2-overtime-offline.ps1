param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-overtime-offline-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original overtime evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Classpath=Join-Path $Module 'target/report-classpath.txt'
$Sources=@('scripts/hr-checks/verify-h-hr09-offline.ps1','scripts/hr-checks/HrHOvertimeChecks.java','scripts/run-h2-overtime-offline.ps1')
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r114-inputs.json') -Raw|ConvertFrom-Json)
$Inputs+=@($Sources|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
$BinaryPaths=@($Classpath)
$CommonClasses=@(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-common') -Directory|ForEach-Object{Join-Path $_.FullName 'target/classes'}|Where-Object{Test-Path -LiteralPath $_ -PathType Container})
foreach($Entry in $CommonClasses+(Get-Content -LiteralPath $Classpath -Raw).Trim().Split([IO.Path]::PathSeparator)){
    if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Overtime dependencies must remain on data drive'}
    if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -Recurse -File|ForEach-Object FullName)}else{$BinaryPaths+=$Entry}
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Overtime source differs from B114'}}
    foreach($Item in $Binaries){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Overtime compiled dependency changed'}}
}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
foreach($Source in $Sources){Copy-Item -LiteralPath (Join-Path $Root $Source) -Destination (Join-Path $Output (Split-Path -Leaf $Source))}
$Failure=$null
Push-Location $Root
try {
    try { & scripts/hr-checks/verify-h-hr09-offline.ps1 -ClassPathFile $Classpath *> (Join-Path $Output 'checks.log'); if($LASTEXITCODE -ne 0){$Failure='NonzeroExit'} }
    catch {$Failure=$_.Exception.Message.Split([char]10)[0]}
    Assert-Inputs
    $Log=Get-Content -LiteralPath (Join-Path $Output 'checks.log') -Raw
    $Passed=$null -eq $Failure -and $Log -match 'PASS: (\d+) HR-09离线断言；未连接数据库、未发起流程、未启动服务'
    $Checks=if($Passed){[int]$Matches[1]}else{0}
    [pscustomobject]@{passed=$Passed;backend='r114';checks=$Checks;inputs=$Inputs.Count;binaries=$Binaries.Count;inputChanges=0;database=$false;http=$false;failure=$Failure;productModified=$false;globalComplete=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "H2_OVERTIME_OFFLINE: passed=$Passed; checks=$Checks; inputs=$($Inputs.Count); binaries=$($Binaries.Count); changed=0; database=false; http=false"
    if(-not $Passed){throw 'Current overtime offline validation failed; evidence retained'}
} finally {Pop-Location}
