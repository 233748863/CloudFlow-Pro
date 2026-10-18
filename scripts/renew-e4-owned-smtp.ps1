param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e4-smtp-maintenance-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original SMTP maintenance evidence'}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned reference runtime required'}
$StateHash=(Get-FileHash -LiteralPath $StatePath).Hash
$ManifestPaths=@(foreach($PriorRound in @('r14','r15','r16','r17','r18')){Join-Path $Evidence "e3-credit-independent-20261009-$PriorRound/inputs.json"})
$ManifestPaths+=Join-Path $Evidence 'e3-all-acceptance-20261010-r1/inputs.json'
$ManifestPaths+=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^e4-profile-independent-20261010-r[1-9][0-9]*$'|ForEach-Object {Join-Path $_.FullName 'inputs.json'})
$CompletedE3=Get-Content -LiteralPath (Join-Path $Evidence 'e3-all-acceptance-20261010-r1/result.json') -Raw|ConvertFrom-Json
if(-not $CompletedE3.Passed -or -not $CompletedE3.All18Complete){throw 'Completed E3 evidence required'}
$HistoricalStates=@{}
foreach($Original in $CompletedE3.HistoricalInputBindings|Where-Object ExecutedPath -EQ $StatePath){$HistoricalStates[$Original.Hash]=$Original.PreservedAt}
foreach($BeforeManifest in @((Join-Path $Evidence 'e4-profile-prep-20261010-r1/before-runtime-inputs.json'))+@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Like 'e4-smtp-maintenance-20261010-*'|ForEach-Object {Join-Path $_.FullName 'before-inputs.json'})){
    if(Test-Path -LiteralPath $BeforeManifest){
        foreach($Original in @(Get-Content -LiteralPath $BeforeManifest -Raw|ConvertFrom-Json)|Where-Object Path -EQ $StatePath){$HistoricalStates[$Original.Hash]=$Original.PreservedAt}
    }
}
$Bindings=@(foreach($ManifestPath in $ManifestPaths){
    $Manifest=Get-Content -LiteralPath $ManifestPath -Raw|ConvertFrom-Json
    $Entry=@($Manifest|Where-Object {[IO.Path]::GetFullPath($_.Path,$Root) -eq $StatePath})
    if($Entry.Count -ne 1){throw 'Completed execution manifest must bind exactly one reference state'}
    $BoundState=$StatePath
    if($Entry[0].Hash -ne $StateHash){
        if(-not $HistoricalStates.ContainsKey($Entry[0].Hash)){throw 'Earlier deployment state lacks its verified original'}
        $BoundState=$HistoricalStates[$Entry[0].Hash]
    }
    if((Get-FileHash -LiteralPath $BoundState).Hash -ne $Entry[0].Hash){throw 'Bound state differs from its actual original input'}
    [pscustomobject]@{Manifest=$ManifestPath;ManifestHash=(Get-FileHash -LiteralPath $ManifestPath).Hash;StateHash=$Entry[0].Hash;BoundState=$BoundState}
})
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Access=Get-Acl -LiteralPath $Output
$Access.SetAccessRuleProtection($true,$false)
foreach($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl -LiteralPath $Output -AclObject $Access
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Before=@(foreach($Relative in @('state.json','smtp.args','smtp-compile.args','private/smtp/snapshot.json')){
    $Path=Join-Path $Run $Relative
    if((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected SMTP input rejected'}
    $Copy=Join-Path $Output ('before/'+$Relative)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Path).Hash
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Path).Hash -ne $Hash){throw 'SMTP input changed during preservation'}
    [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
})
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Bindings|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'historical-input-bindings.json') -Encoding utf8NoBOM
$Runner=Join-Path $Root 'scripts/restart-isolated-smtp-fixture.ps1'
$RunnerHash=(Get-FileHash -LiteralPath $Runner).Hash
[IO.File]::Copy($Runner,(Join-Path $Output 'restart-original.ps1'),$false)
$ObservedBefore=@(foreach($Entry in $State.processes|Where-Object name -NE 'smtp-fixture'){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Existing owned process identity differs'}
    [pscustomobject]@{Name=$Entry.name;Id=$Entry.id;CreationDate=$Observed.CreationDate}
})
$Process=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoLogo','-NoProfile','-File',$Runner,'-StatePath',$StatePath,'-LifetimeSeconds','14400') -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Output 'restart.stdout.log') -RedirectStandardError (Join-Path $Output 'restart.stderr.log') -PassThru
$Deadline=[DateTime]::UtcNow.AddSeconds(180)
while(-not $Process.WaitForExit(1000)){if([DateTime]::UtcNow -ge $Deadline){throw 'SMTP helper exceeded 180 seconds; retain its process and logs for diagnosis'}}
$Process.Refresh()
$RestartExit=$Process.ExitCode
if($RestartExit -ne 0){throw 'Owned SMTP helper failed; original output retained'}
$After=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
$NewSmtp=@($After.processes|Where-Object name -EQ 'smtp-fixture')
$OldSmtp=@($State.processes|Where-Object name -EQ 'smtp-fixture')
if($NewSmtp.Count -ne 1 -or $OldSmtp.Count -ne 1 -or $NewSmtp[0].id -eq $OldSmtp[0].id){throw 'SMTP process was not uniquely replaced'}
$NormalizedAfter=($After|ConvertTo-Json -Depth 20|ConvertFrom-Json)
@($NormalizedAfter.processes|Where-Object name -EQ 'smtp-fixture')[0].id=$OldSmtp[0].id
if(($NormalizedAfter|ConvertTo-Json -Depth 20 -Compress) -ne ($State|ConvertTo-Json -Depth 20 -Compress)){throw 'Reference state changed beyond the SMTP process identifier'}
foreach($Entry in $ObservedBefore){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.Id)";if($null -eq $Observed -or $Observed.CreationDate -ne $Entry.CreationDate){throw 'Another owned process changed'}}
$SmtpObserved=Get-CimInstance Win32_Process -Filter "ProcessId=$($NewSmtp[0].id)"
if($null -eq $SmtpObserved -or -not $SmtpObserved.CommandLine.Contains($NewSmtp[0].marker)){throw 'New SMTP identity differs'}
$Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $After.smtpFixture.port -ErrorAction SilentlyContinue)
if($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1' -or $Listeners[0].OwningProcess -ne $NewSmtp[0].id){throw 'SMTP loopback listener differs'}
foreach($Service in $After.services){if((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -ne 'UP'){throw 'Existing service unhealthy'}}
foreach($Entry in $Before){if((Get-FileHash -LiteralPath $Entry.PreservedAt).Hash -ne $Entry.Hash){throw 'Original SMTP input changed'}}
foreach($Binding in $Bindings){
    if((Get-FileHash -LiteralPath $Binding.Manifest).Hash -ne $Binding.ManifestHash){throw 'Historical E3 manifest changed'}
    $RetainedState=if($Binding.BoundState -eq $StatePath){Join-Path $Output 'before/state.json'}else{$Binding.BoundState}
    if((Get-FileHash -LiteralPath $RetainedState).Hash -ne $Binding.StateHash){throw 'Historical E3 state original changed'}
}
if((Get-FileHash -LiteralPath $Runner).Hash -ne $RunnerHash){throw 'SMTP restart source changed'}
$StartedUtc=$SmtpObserved.CreationDate.ToUniversalTime()
$Result=@{Passed=$true;RestartExit=$RestartExit;PreviousStateHash=$StateHash;CurrentStateHash=(Get-FileHash -LiteralPath $StatePath).Hash;HistoricalInputBindings=$Bindings;PreservedFiles=$Before.Count;Port=$After.smtpFixture.port;Process=$NewSmtp[0].id;LifetimeSeconds=14400;StartedUtc=$StartedUtc.ToString('o');ExpiresUtc=$StartedUtc.AddSeconds(14400).ToString('o');ExistingProcessesKept=$ObservedBefore.Count;HealthyServices=6;StateChangedOnlySmtpProcess=$true;CertificateRenewed=$false;ProductModified=$false;ProductionModified=$false;BusinessWrites=0;ExternalMessagesSent=$false;RawStateEmitted=$false}
$Result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E4_SMTP_MAINTENANCE: passed=true; historical_manifests=$($Bindings.Count); preserved_files=4; lifetime_seconds=14400; other_processes_kept=8; healthy=6; state_changed_only_smtp=true"
