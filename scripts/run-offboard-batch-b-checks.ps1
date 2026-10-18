param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r42')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix="a3-offboard-batch-b-20261003-$Round"
$Stdout=Join-Path $Evidence "$Prefix.log"
$Stderr=Join-Path $Evidence "$Prefix.stderr.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs.json"
foreach($File in @($Stdout,$Stderr,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Previous evidence retained'}}
$Product=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
function Assert-Product {foreach($Item in $Product){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Dependencies=Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow/target/batch-b-classpath.txt'
foreach($Entry in ((Get-Content -LiteralPath $Dependencies -Raw).Trim().Split(';'))){
    if([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Entry).Path) -ne 'D:\'){throw 'Only data drive dependencies allowed'}
}
$Sources=@('WorkflowBatchBChecks.java','WorkflowBatchBConfigChecks.java','WorkflowMonitorMappingChecks.java','WorkflowGatewayModelChecks.java','WorkflowNodeEventOrderingChecks.java','WorkflowBusinessLockFixture.java')|
    ForEach-Object {Join-Path $Root "scripts/workflow-checks/$_"}
$Paths=@($PSCommandPath,(Join-Path $Root 'scripts/verify-batch-b.ps1'),$Dependencies)+@($Sources)
$Inputs=@($Paths|ForEach-Object {[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8NoBOM
$CheckProcess=Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @('-NoProfile','-File',(Join-Path $Root 'scripts/verify-batch-b.ps1'),'-SkipBuild') -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
$CheckProcess.WaitForExit()
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
$Summary="OFFBOARD_BATCH_B: inputs=$($Inputs.Count); backend=$BackendRound; product_changed=0; changed=0; exit=$($CheckProcess.ExitCode)"
Add-Content -LiteralPath $Stdout -Value $Summary
Get-Content -LiteralPath $Stdout | Where-Object {$_ -match '^PASS: [0-9]|^PASS: SQL table|^OFFBOARD_BATCH_B:'}
exit $CheckProcess.ExitCode
