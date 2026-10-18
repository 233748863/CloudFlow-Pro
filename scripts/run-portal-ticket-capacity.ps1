param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Log=Join-Path $Evidence "h5-portal-capacity-20261002-http-$Round.log"
$RestoreLog=Join-Path $Evidence "h5-portal-capacity-20261002-restore-$Round.log"
foreach ($File in @($Log,$RestoreLog)) { if (Test-Path -LiteralPath $File) { throw 'Existing evidence must be retained' } }
if ((Get-Content -LiteralPath (Join-Path $Evidence 'h5-settlement-capacity-20261002-checklist-r2.log') -Raw) -notmatch 'H5_SETTLEMENT_CAPACITY_CHECKLIST: items=14; missing=0') { throw 'Finish the receipt capacity stage before enabling portal fixtures' }
$State=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Owned running fixture required' }
function Assert-ProductInputs {
    foreach($Name in @('h5-generated-import-20261002-backend-inputs-r1.json','h2-asset-reminder-frontend-inputs-20261001-r2.json')) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence $Name) -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    }
}
Assert-ProductInputs
$Fixture=Join-Path $Run ('private/h5-portal-capacity-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Fixture) | Out-Null
$ManifestPath=Join-Path $Fixture 'manifest.json'
$Files=@()
foreach ($Service in @('auth','gateway')) {
    foreach ($Name in @('integration.properties','service.args')) {
        $Path=Join-Path $Run "$Service/$Name"
        if ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected service input rejected' }
        $Backup=Join-Path $Fixture "$Service-$Name.original"
        [IO.File]::WriteAllBytes($Backup,[IO.File]::ReadAllBytes($Path))
        $Hash=(Get-FileHash -LiteralPath $Path).Hash
        $Files+=[pscustomobject]@{Path=$Path;Backup=$Backup;OriginalHash=$Hash;AppliedHash=$Hash}
    }
}
$Manifest=[ordered]@{StatePath=$StatePath;Files=$Files;Restored=$false;ProductionModified=$false}
function Save-Manifest { [IO.File]::WriteAllText($ManifestPath,($Manifest|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false)) }
function Capture-Applied { foreach($File in $Files){$File.AppliedHash=(Get-FileHash -LiteralPath $File.Path).Hash}; Save-Manifest }
Save-Manifest
$InputPaths=@(rg --files scripts -g 'verify-portal-*.mjs') + @('scripts/verify-batch-g-integration.mjs',
    'scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs','scripts/oauth2-checks/logs.mjs',
    'scripts/prepare-portal-integration.ps1','scripts/start-isolated-smtp-fixture.ps1','scripts/restart-isolated-smtp-fixture.ps1',
    'scripts/control-batch-g-service.ps1','scripts/run-portal-ticket-capacity.ps1') + @(rg --files scripts/message-checks -g 'Message*Checks.java')
$InputPaths+='cloudflow-backend/cloudflow-auth/target/message-delivery-classpath.txt'
$Inputs=@($InputPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Evidence "h5-portal-capacity-20261002-inputs-$Round.json") -Encoding utf8
Write-Output "PORTAL_CAPACITY_FIXTURE: manifest=$ManifestPath; scope=owned_auth_gateway_smtp; production_modified=false"
$NeedsRestore=$false; $Failure=$null; $RestorationFailure=$null
try {
    $NeedsRestore=$true
    if (-not $State.smtpFixture) {
        & scripts/start-isolated-smtp-fixture.ps1 -StatePath $StatePath *> $Log
        Capture-Applied
    } else {
        & scripts/restart-isolated-smtp-fixture.ps1 -StatePath $StatePath >> $Log 2>&1
        $State=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        $MailRoot=[IO.Path]::GetFullPath($State.smtpFixture.directory)
        if ($MailRoot -ne (Join-Path $Run 'private/smtp') -or -not $State.smtpFixture.loopback) { throw 'Owned SMTP fixture required' }
        $ArgumentPath=Join-Path $Run 'auth/service.args'; $ConfigurationPath=Join-Path $Run 'auth/integration.properties'
        $Arguments=[IO.File]::ReadAllLines($ArgumentPath); $Settings=[IO.File]::ReadAllLines($ConfigurationPath)
        if (@($Arguments|Where-Object{$_ -match 'javax.net.ssl.trustStore'}).Count -or @($Settings|Where-Object{$_ -match '^cloudflow\.message\.smtp\.'}).Count) { throw 'Unexpected original mail configuration' }
        $Secret=[IO.File]::ReadAllText((Join-Path $MailRoot 'store-password.txt'))
        $Trust=@(('"-Djavax.net.ssl.trustStore='+(Join-Path $MailRoot 'tls.p12').Replace('\','/')+'"'),"-Djavax.net.ssl.trustStorePassword=$Secret")
        [IO.File]::WriteAllLines($ArgumentPath,@($Trust)+@($Arguments),[Text.UTF8Encoding]::new($false))
        $Policy=@('cloudflow.message.smtp.allowed-hosts=localhost','cloudflow.message.smtp.allowed-addresses=127.0.0.1,::1,0:0:0:0:0:0:0:1',"cloudflow.message.smtp.extra-tls-ports=$($State.smtpFixture.port)")
        [IO.File]::WriteAllLines($ConfigurationPath,@($Settings)+$Policy,[Text.UTF8Encoding]::new($false))
        Capture-Applied
    }
    & scripts/prepare-portal-integration.ps1 -StatePath $StatePath -EnablePortal -CurrentSchema >> $Log 2>&1
    Capture-Applied
    foreach ($Service in @('auth','gateway')) {
        & scripts/control-batch-g-service.ps1 -StatePath $StatePath -ServiceName $Service -Action Stop >> $Log 2>&1
        & scripts/control-batch-g-service.ps1 -StatePath $StatePath -ServiceName $Service -Action Start >> $Log 2>&1
    }
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --portal-ticket-only --portal-ticket-capacity >> $Log 2>&1
    $Result=$LASTEXITCODE
    if (@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count) { throw 'Portal verification inputs changed during execution' }
    "PORTAL_CAPACITY_INPUTS: files=$($Inputs.Count); changed=0; exit=$Result" | Add-Content -LiteralPath $Log
    Assert-ProductInputs
    if ($Result -ne 0) { throw 'Portal capacity verification failed; original log retained' }
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach($Marker in @('"storagePortalFile":true','"storagePortalFileCleanup":true','failed=0; requests=')) {
        if($Content -notmatch $Marker){throw 'Portal capacity completion evidence missing'}
    }
} catch { $Failure=$_ }
finally {
    if($NeedsRestore) {
        try {
            foreach($File in $Files) {
                if((Get-FileHash -LiteralPath $File.Backup).Hash -ne $File.OriginalHash -or (Get-FileHash -LiteralPath $File.Path).Hash -notin @($File.OriginalHash,$File.AppliedHash)) { throw 'Service input differs from completed preparation; manual restoration inspection required' }
            }
            foreach($Service in @('auth','gateway')) {
                $Latest=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
                $Owner=@($Latest.processes|Where-Object name -eq $Service)
                if($Owner.Count -ne 1){throw 'Ambiguous service owner'}
                if(Get-Process -Id $Owner[0].id -ErrorAction SilentlyContinue) { & scripts/control-batch-g-service.ps1 -StatePath $StatePath -ServiceName $Service -Action Stop >> $RestoreLog 2>&1 }
                foreach($File in $Files|Where-Object{(Split-Path -Leaf (Split-Path -Parent $_.Path)) -eq $Service}){[IO.File]::WriteAllBytes($File.Path,[IO.File]::ReadAllBytes($File.Backup))}
                & scripts/control-batch-g-service.ps1 -StatePath $StatePath -ServiceName $Service -Action Start >> $RestoreLog 2>&1
            }
            if(@($Files|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.OriginalHash}).Count){throw 'Original configuration bytes not restored'}
            $Manifest.Restored=$true; Save-Manifest
            'PORTAL_CAPACITY_RESTORED: original_configurations_and_arguments=true; auth_gateway_healthy=true; production_modified=false'|Add-Content -LiteralPath $RestoreLog
            & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --tenant-package-disabled-only >> $RestoreLog 2>&1
            if($LASTEXITCODE -ne 0){throw 'Original default configuration check failed'}
            $Latest=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
            $MailOwner=@($Latest.processes|Where-Object name -eq 'smtp-fixture')
            if($MailOwner.Count -eq 1) {
                $MailProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($MailOwner[0].id)"
                if($MailProcess) {
                    if($MailOwner[0].marker -ne (Join-Path $Run 'smtp.args') -or $MailProcess.Name -ne 'java.exe' -or -not $MailProcess.CommandLine.Contains($MailOwner[0].marker)){throw 'SMTP fixture owner changed; unrelated process untouched'}
                    $MailHandle=[Diagnostics.Process]::GetProcessById($MailProcess.ProcessId)
                    try{$MailHandle.Kill($true);if(-not $MailHandle.WaitForExit(20000)){throw 'SMTP fixture has not stopped'}}finally{$MailHandle.Dispose()}
                }
                'PORTAL_CAPACITY_SMTP_STOPPED: owned_process_only=true; fixture_metadata_retained=true'|Add-Content -LiteralPath $RestoreLog
            }
        } catch { $RestorationFailure=$_ }
    }
}
foreach($File in @($Log,$RestoreLog)){if(Test-Path -LiteralPath $File){Get-Content -LiteralPath $File|Where-Object{$_ -match '^(H3_PORTAL_TICKET_REAL_RESULT|H5_TENANT_PACKAGE_REAL_RESULT|PORTAL_CAPACITY_)'}|Select-Object -Last 3}}
if($Failure){'PORTAL_CAPACITY_FAILED: original_failure_retained=true'}
if($RestorationFailure){throw $RestorationFailure}
if($Failure){throw $Failure}
'PORTAL_CAPACITY_RUN_EXIT=0'
