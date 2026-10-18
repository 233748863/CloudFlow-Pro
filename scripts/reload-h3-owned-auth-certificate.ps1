param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "h3-auth-certificate-reload-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original certificate reload evidence'}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
$SmtpResult=Join-Path $Evidence 'e5-smtp-maintenance-20261010-r3/result.json'
$Maintenance=Get-Content -LiteralPath $SmtpResult -Raw|ConvertFrom-Json
$StagePath=Join-Path $Evidence 'h3-performance-stage-20261010-r2/result.json'
$Stage=Get-Content -LiteralPath $StagePath -Raw|ConvertFrom-Json
if(-not $Stage.Passed -or $Stage.Backend -ne 'r147' -or $Stage.Frontend -ne 'r101'){throw 'Completed B147/F101 stage required'}
if(-not $Maintenance.Passed -or -not $Maintenance.AuthRestartRequired -or [DateTime]$Maintenance.ExpiresUtc -le [DateTime]::UtcNow){throw 'Current renewed SMTP certificate required'}
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned running reference required'}
$ArgumentPath=Join-Path $Run 'auth/service.args'
$PropertiesPath=Join-Path $Run 'auth/integration.properties'
$CertificatePath=Join-Path $Run 'private/smtp/tls.p12'
foreach($Candidate in @($Root,$Run,$StatePath,(Split-Path -Parent $ArgumentPath),$ArgumentPath,$PropertiesPath,$CertificatePath)){
    if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owned input rejected'}
}
$Arguments=@(Get-Content -LiteralPath $ArgumentPath)
$TrustArguments=@($Arguments|Where-Object {$_ -match '^"?-Djavax.net.ssl.trustStore='})
$ReloadApplicable=$TrustArguments.Count -eq 1
if($TrustArguments.Count -gt 1){throw 'Multiple auth trust stores rejected'}
if($ReloadApplicable){
    $TrustPath=$TrustArguments[0].Trim('"').Substring('-Djavax.net.ssl.trustStore='.Length)
    if([IO.Path]::GetFullPath($TrustPath) -ne $CertificatePath){throw 'Auth must use the renewed local trust store'}
}else{
    $MailSettings=@(Get-Content -LiteralPath $PropertiesPath|Where-Object {$_ -match '^(cloudflow\.message\.smtp\.|spring\.mail\.|mail\.smtp\.)'})
    if($MailSettings.Count -ne 0 -or @($Arguments|Where-Object {$_ -match '(?i)trustStore|smtp|spring.mail'}).Count -ne 0){throw 'Unexpected mail configuration requires inspection'}
}
$ClassPathIndex=[Array]::IndexOf($Arguments,'-cp')
if($ClassPathIndex -lt 0 -or $Arguments[$ClassPathIndex+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Existing layered B147 auth launch required'}
$Layered=[IO.Path]::GetFullPath($Arguments[$ClassPathIndex+1].Trim('"'))
$ArtifactRoot=Join-Path $Run 'auth/artifacts'
if((Split-Path -Parent $Layered) -ne $ArtifactRoot -or (Split-Path -Leaf $Layered) -notmatch '^[a-f0-9]{64}-layered$'){throw 'Owned retained auth package required'}
$ArtifactHash=(Split-Path -Leaf $Layered).Substring(0,64)
$Artifact=Join-Path $ArtifactRoot ($ArtifactHash+'.jar')
. (Join-Path $Root 'scripts/owned-layered-artifact.ps1')
$Verified=Get-OwnedLayeredArtifact $Artifact $ArtifactRoot $ArtifactHash
if($Verified.Path -ne $Layered){throw 'Retained auth classes differ from package'}
$Auth=@($State.processes|Where-Object name -EQ 'auth')
$Smtp=@($State.processes|Where-Object name -EQ 'smtp-fixture')
if($Auth.Count -ne 1 -or $Smtp.Count -ne 1 -or $Smtp[0].id -ne $Maintenance.Process){throw 'Unique current owned auth and SMTP required'}
$ObservedBefore=@(foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity differs'}
    [pscustomobject]@{Name=$Entry.name;Id=$Entry.id;CreationDate=$Observed.CreationDate}
})
foreach($Service in $State.services){if((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -ne 'UP'){throw 'Pre-reload service unhealthy'}}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Access=Get-Acl -LiteralPath $Output
$Access.SetAccessRuleProtection($true,$false)
foreach($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl -LiteralPath $Output -AclObject $Access
$Runner=Join-Path $Root 'scripts/restart-isolated-integration-service.ps1'
$Paths=@($StatePath,$ArgumentPath,$PropertiesPath,$CertificatePath,$SmtpResult,$StagePath,$PSCommandPath,$Runner,(Join-Path $Root 'scripts/owned-layered-artifact.ps1'))
$Before=@(foreach($Path in $Paths){
    $Copy=Join-Path $Output ('before/'+[IO.Path]::GetRelativePath($Root,$Path))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Path).Hash
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Path).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Input changed during preservation'}
    [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
})
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$ObservedBefore|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-processes.json') -Encoding utf8NoBOM
if(-not $ReloadApplicable){
    foreach($Entry in $Before){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash -or (Get-FileHash -LiteralPath $Entry.PreservedAt).Hash -ne $Entry.Hash){throw 'Read-only maintenance inspection changed an input'}}
    [pscustomobject]@{Passed=$true;Backend='r147';Frontend='r101';Mode='FIXTURE_TRUST_NOT_CONFIGURED';Auth=$Auth[0].id;Smtp=$Smtp[0].id;PreservedFiles=$Before.Count;AuthPackageHash=$ArtifactHash;AuthPackageKept=$true;ConfigurationKept=$true;ProcessesKept=9;HealthyServices=6;AuthUsesFixtureTrustStore=$false;AuthReloadPerformed=$false;AuthRestartRequired=$false;GenericMaintenanceRestartFlagNotApplicable=$true;SmtpExpiresUtc=$Maintenance.ExpiresUtc;CertificateExpiresUtc=$Maintenance.CertificateExpiresUtc;BusinessRequests=0;ExternalMessagesSent=$false;ProductionModified=$false;ProductModified=$false;RawStateEmitted=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    'H3_AUTH_CERTIFICATE_INSPECTION: passed=true; auth_fixture_trust_not_configured=true; restart_not_applicable=true; preserved=9; processes_kept=9; healthy=6; configuration_unchanged=true'
    exit 0
}
$Restart=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoLogo','-NoProfile','-File',$Runner,'-StatePath',$StatePath,'-ServiceName','auth') -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Output 'restart.stdout.log') -RedirectStandardError (Join-Path $Output 'restart.stderr.log') -PassThru
$Deadline=[DateTime]::UtcNow.AddSeconds(400)
while(-not $Restart.WaitForExit(1000)){if([DateTime]::UtcNow -ge $Deadline){throw 'Auth reload helper exceeded its deadline; retain original process and logs'}}
$Restart.Refresh()
if($Restart.ExitCode -ne 0){throw 'Auth reload helper failed; original diagnostics retained'}
$After=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
$NewAuth=@($After.processes|Where-Object name -EQ 'auth')
if($NewAuth.Count -ne 1 -or $NewAuth[0].id -eq $Auth[0].id){throw 'Auth process was not uniquely replaced'}
$NormalizedAfter=$After|ConvertTo-Json -Depth 20|ConvertFrom-Json
@($NormalizedAfter.processes|Where-Object name -EQ 'auth')[0].id=$Auth[0].id
if(($NormalizedAfter|ConvertTo-Json -Depth 20 -Compress) -ne ($State|ConvertTo-Json -Depth 20 -Compress)){throw 'Reference state changed beyond auth process identifier'}
foreach($Entry in $ObservedBefore|Where-Object Name -NE 'auth'){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.Id)"
    if($null -eq $Observed -or $Observed.CreationDate -ne $Entry.CreationDate){throw 'Another owned process changed'}
}
$CurrentAuth=Get-CimInstance Win32_Process -Filter "ProcessId=$($NewAuth[0].id)"
if($null -eq $CurrentAuth -or -not $CurrentAuth.CommandLine.Contains($ArgumentPath) -or $CurrentAuth.CreationDate.ToUniversalTime() -le (Get-Item -LiteralPath $CertificatePath).LastWriteTimeUtc){throw 'Fresh auth process using renewed certificate required'}
foreach($Entry in $Before){
    if((Get-FileHash -LiteralPath $Entry.PreservedAt).Hash -ne $Entry.Hash){throw 'Preserved original changed'}
    if($Entry.Path -ne $StatePath -and (Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash){throw 'Configuration or source changed during maintenance'}
}
if((Get-FileHash -LiteralPath $Artifact).Hash -ne $ArtifactHash){throw 'Retained B147 package changed'}
foreach($Service in $After.services){if((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -ne 'UP'){throw 'Post-reload service unhealthy'}}
$Result=[pscustomobject]@{Passed=$true;Backend='r147';Frontend='r101';RestartExit=$Restart.ExitCode;PreviousAuth=$Auth[0].id;Auth=$NewAuth[0].id;Smtp=$Smtp[0].id;PreservedFiles=$Before.Count;AuthPackageHash=$ArtifactHash;AuthPackageKept=$true;ConfigurationKept=$true;StateChangedOnlyAuthProcess=$true;OtherProcessesKept=8;HealthyServices=6;TrustStoreArgumentVerified=$true;FreshAuthAfterCertificateRenewal=$true;AuthRestartRequired=$false;SmtpExpiresUtc=$Maintenance.ExpiresUtc;CertificateExpiresUtc=$Maintenance.CertificateExpiresUtc;BusinessRequests=0;ExternalMessagesSent=$false;ProductionModified=$false;ProductModified=$false;RawStateEmitted=$false}
$Result|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_AUTH_CERTIFICATE_RELOAD: passed=true; backend=r147; frontend=r101; preserved=$($Before.Count); other_processes_kept=8; healthy=6; package_and_config_kept=true; auth_restart_required=false"
