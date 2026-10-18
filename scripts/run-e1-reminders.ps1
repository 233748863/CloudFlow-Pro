param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [switch]$Queued)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix=if($Queued){'e1-reminder-queued'}else{'e1-reminder'}
$Fixture=Join-Path $Evidence "$Prefix-mail-20261007-$Round"
if(Test-Path -LiteralPath $Fixture){throw 'Retain original reminder mail evidence'}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.processes.Count -ne 9){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity differs'}
}
$MailRoot=[IO.Path]::GetFullPath($State.smtpFixture.directory)
if($MailRoot -ne (Join-Path $Run 'private/smtp') -or -not $State.smtpFixture.loopback){throw 'Owned SMTP fixture required'}
$OwnedSmtp=@($State.processes|Where-Object name -eq 'smtp-fixture')
$Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $State.smtpFixture.port)
if($OwnedSmtp.Count -ne 1 -or $Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1' -or $Listeners[0].OwningProcess -ne $OwnedSmtp[0].id){throw 'SMTP listener outside fixture'}
$ArgumentPath=Join-Path $Run 'auth/service.args'
$ConfigurationPath=Join-Path $Run 'auth/integration.properties'
foreach($Item in @($Run,$ArgumentPath,$ConfigurationPath,$MailRoot,(Join-Path $MailRoot 'tls.p12'),(Join-Path $MailRoot 'store-password.txt'))){
    if((Get-Item -LiteralPath $Item).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected mail input rejected'}
}
$Arguments=[IO.File]::ReadAllLines($ArgumentPath)
$Settings=[IO.File]::ReadAllLines($ConfigurationPath)
if(@($Arguments|Where-Object{$_ -match 'javax.net.ssl.trustStore|cloudflow.message.smtp'}).Count -or @($Settings|Where-Object{$_ -match '^cloudflow\.message\.smtp\.'}).Count){throw 'Unexpected original mail configuration'}
$Secret=[IO.File]::ReadAllText((Join-Path $MailRoot 'store-password.txt'))
$Certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new((Join-Path $MailRoot 'tls.p12'),$Secret,[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
try {
    if($Certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or $Certificate.NotAfter.ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(1)){throw 'SMTP certificate must remain valid through verification'}
} finally {$Certificate.Dispose()}
[IO.Directory]::CreateDirectory($Fixture)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Fixture 'run-e1-reminders.original.ps1'),$false)
$Files=@($ArgumentPath,$ConfigurationPath)|ForEach-Object{
    $Backup=Join-Path $Fixture ((Split-Path -Leaf $_)+'.original')
    [IO.File]::Copy($_,$Backup,$false)
    [pscustomobject]@{Path=$_;Backup=$Backup;OriginalHash=(Get-FileHash -LiteralPath $_).Hash;AppliedHash=$null}
}
$Manifest=[ordered]@{StatePath=$StatePath;Files=$Files;Restored=$false;ProductionModified=$false;Backend=$BackendRound;Frontend=$FrontendRound}
$ManifestPath=Join-Path $Fixture 'manifest.json'
$Failure=$null
$RestartRequired=$false
function Restart-Auth([string]$Log){
    $Child=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoLogo','-NoProfile','-File','scripts/restart-isolated-integration-service.ps1','-StatePath',$StatePath,'-ServiceName','auth') -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $Log -RedirectStandardError ($Log+'.err') -PassThru
    $Child.WaitForExit()
    $Child.Refresh()
    if($Child.ExitCode -ne 0){throw 'Owned auth restart failed; retain diagnostics'}
}
try {
    $Trust=@(('"-Djavax.net.ssl.trustStore='+(Join-Path $MailRoot 'tls.p12').Replace('\','/')+'"'),"-Djavax.net.ssl.trustStorePassword=$Secret")
    $Policy=@('cloudflow.message.smtp.allowed-hosts=localhost','cloudflow.message.smtp.allowed-addresses=127.0.0.1,::1,0:0:0:0:0:0:0:1',"cloudflow.message.smtp.extra-tls-ports=$($State.smtpFixture.port)")
    $AppliedContents=@([string[]](@($Trust)+@($Arguments)),[string[]](@($Settings)+$Policy))
    for($Index=0;$Index -lt $Files.Count;$Index++){
        $Target=$Files[$Index]
        $Applied=Join-Path $Fixture ((Split-Path -Leaf $Target.Path)+'.applied')
        [IO.File]::WriteAllLines($Applied,$AppliedContents[$Index],[Text.UTF8Encoding]::new($false))
        $Target.AppliedHash=(Get-FileHash -LiteralPath $Applied).Hash
    }
    $Manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $ManifestPath -Encoding utf8NoBOM
    foreach($File in $Files){
        if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.OriginalHash){throw 'Original configuration changed'}
        [IO.File]::Copy((Join-Path $Fixture ((Split-Path -Leaf $File.Path)+'.applied')),$File.Path,$true)
        $RestartRequired=$true
    }
    $Secret=$null
    Restart-Auth (Join-Path $Fixture 'enable.log')
    'E1_REMINDER_MAIL: local_only=true; temporary_files=2; auth_ready=true'
    $Flags=@($Round,$BackendRound,$FrontendRound)
    if($Queued){$Flags+='--queued'}
    & node scripts/run-e1-reminder-allowance.mjs @Flags *> (Join-Path $Fixture 'allowance.log')
    $RunExit=$LASTEXITCODE
    Get-Content -LiteralPath (Join-Path $Fixture 'allowance.log')|Where-Object{$_ -match '^(E1_|OWNED_CAPTCHA_)'}
    if($RunExit -ne 0){throw 'Reminder verification failed; retain original evidence'}
} catch {$Failure=$_}
finally {
    foreach($File in $Files){
        if((Get-FileHash -LiteralPath $File.Backup).Hash -ne $File.OriginalHash -or (Get-FileHash -LiteralPath $File.Path).Hash -notin @($File.OriginalHash,$File.AppliedHash)){throw 'Mail configuration changed; inspect before restoration'}
    }
    foreach($File in $Files){[IO.File]::Copy($File.Backup,$File.Path,$true)}
    if($RestartRequired){Restart-Auth (Join-Path $Fixture 'restore.log')}
    foreach($File in $Files){if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.OriginalHash){throw 'Mail configuration restoration differs'}}
    $Manifest.Restored=$true
    $Manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $ManifestPath -Encoding utf8NoBOM
    'E1_REMINDER_MAIL_RESTORED: files=2; production_modified=false'
}
if($Failure){throw $Failure}
