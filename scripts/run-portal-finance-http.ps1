param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r6',
    [ValidateSet('Finance','Contract','Receivable')][string]$Scenario='Finance')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix=if($Scenario -eq 'Finance'){'h3-portal-finance-http'}else{"h3-portal-finance-neighbor-$($Scenario.ToLowerInvariant())"}
$Mode=switch($Scenario){'Finance'{'portal-finance-http'} 'Contract'{'portal-contract-http'} 'Receivable'{'finance-receivable-http'}}
$Log=Join-Path $Evidence "$Prefix-20261002-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-20261002-$Round.json"
$Fixture=Join-Path $Evidence "$Prefix-fixture-20261002-$Round"
foreach ($Item in @($Log,$InputPath,$Fixture)) { if (Test-Path -LiteralPath $Item) { throw 'Retain existing finance evidence' } }
function Assert-ProductInputs {
    foreach ($Build in @("backend-$BackendRound","frontend-$FrontendRound")) {
        $Snapshot=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw | ConvertFrom-Json
        if (@($Snapshot | Where-Object { (Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash }).Count) { throw 'Product differs from verified build' }
    }
}
Assert-ProductInputs
$State=Get-Content $StatePath -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Owned running fixture required' }
$MailRoot=[IO.Path]::GetFullPath($State.smtpFixture.directory)
if ($MailRoot -ne (Join-Path $Run 'private/smtp') -or -not $State.smtpFixture.loopback) { throw 'Owned SMTP fixture required' }
$ArgumentPath=Join-Path $Run 'auth/service.args'; $ConfigurationPath=Join-Path $Run 'auth/integration.properties'
foreach ($Item in @($Run,$ArgumentPath,$ConfigurationPath,$MailRoot)) { if ((Get-Item $Item).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected input rejected' } }
$Arguments=[IO.File]::ReadAllLines($ArgumentPath); $Settings=[IO.File]::ReadAllLines($ConfigurationPath)
if (@($Arguments | Where-Object { $_ -match 'javax.net.ssl.trustStore' }).Count -or @($Settings | Where-Object { $_ -match '^cloudflow\.message\.smtp\.' }).Count) { throw 'Unexpected original mail configuration' }
[IO.Directory]::CreateDirectory($Fixture) | Out-Null
$Files=@($ArgumentPath,$ConfigurationPath) | ForEach-Object {
    $Backup=Join-Path $Fixture ((Split-Path -Leaf $_)+'.original')
    Copy-Item -LiteralPath $_ -Destination $Backup
    [pscustomobject]@{Path=$_;Backup=$Backup;OriginalHash=(Get-FileHash -LiteralPath $_).Hash;AppliedHash=$null}
}
$Manifest=[ordered]@{StatePath=$StatePath;Files=$Files;Restored=$false;ProductionModified=$false}
$ManifestPath=Join-Path $Fixture 'manifest.json'
$Failure=$null
try {
    $Secret=[IO.File]::ReadAllText((Join-Path $MailRoot 'store-password.txt'))
    $Trust=@(('"-Djavax.net.ssl.trustStore='+(Join-Path $MailRoot 'tls.p12').Replace('\','/')+'"'),"-Djavax.net.ssl.trustStorePassword=$Secret")
    [IO.File]::WriteAllLines($ArgumentPath,@($Trust)+@($Arguments),[Text.UTF8Encoding]::new($false))
    $Policy=@('cloudflow.message.smtp.allowed-hosts=localhost','cloudflow.message.smtp.allowed-addresses=127.0.0.1,::1,0:0:0:0:0:0:0:1',"cloudflow.message.smtp.extra-tls-ports=$($State.smtpFixture.port)")
    [IO.File]::WriteAllLines($ConfigurationPath,@($Settings)+$Policy,[Text.UTF8Encoding]::new($false))
    foreach ($File in $Files) { $File.AppliedHash=(Get-FileHash -LiteralPath $File.Path).Hash }
    $Manifest | ConvertTo-Json -Depth 5 | Set-Content $ManifestPath -Encoding utf8
    & scripts/restart-isolated-integration-service.ps1 -StatePath $StatePath -ServiceName auth *> $Log
    $Paths=@(rg --files scripts -g '!**/node_modules/**')
    $State=Get-Content $StatePath -Raw | ConvertFrom-Json
    $Paths+=@($State.services | ForEach-Object { Join-Path $Run "$($_.name)/service.args"; Join-Path $Run "$($_.name)/integration.properties" })
    $Inputs=@($Paths | Sort-Object -Unique | ForEach-Object { [pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash} })
    $Inputs | ConvertTo-Json | Set-Content $InputPath -Encoding utf8
    & node scripts/run-owned-captcha-allowance.mjs $Mode $Round *>> $Log
    $Result=$LASTEXITCODE
    if (@($Inputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Finance verification inputs changed' }
    Assert-ProductInputs
    "H3_FINANCE_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result" | Add-Content $Log
    if ($Result -ne 0) { throw 'Finance HTTP verification failed; retained diagnostic' }
} catch { $Failure=$_ }
finally {
    foreach ($File in $Files) {
        if ((Get-FileHash -LiteralPath $File.Backup).Hash -ne $File.OriginalHash -or (Get-FileHash -LiteralPath $File.Path).Hash -notin @($File.OriginalHash,$File.AppliedHash)) { throw 'Owned mail configuration changed; inspect before restoration' }
    }
    foreach ($File in $Files) { Copy-Item -LiteralPath $File.Backup -Destination $File.Path }
    & scripts/restart-isolated-integration-service.ps1 -StatePath $StatePath -ServiceName auth *>> $Log
    $Manifest.Restored=$true
    $Manifest | ConvertTo-Json -Depth 5 | Set-Content $ManifestPath -Encoding utf8
    'H3_FINANCE_MAIL_CONFIG_RESTORED: files=2; production_modified=false' | Add-Content $Log
}
Get-Content $Log | Where-Object { $_ -match '^(PASS |H3_|FAIL )' } | Select-Object -Last 10
if ($Failure) { throw $Failure }
