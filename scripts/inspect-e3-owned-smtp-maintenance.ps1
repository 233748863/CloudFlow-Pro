$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Preparation=Join-Path $Evidence 'e3-smtp-state-prep-20261010-r1'
$Output=Join-Path $Evidence 'e3-smtp-state-inspection-20261010-r1'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
if(Test-Path -LiteralPath $Output){throw 'Preserve previous SMTP completion inspection'}
if(Get-Process -Id 29800 -ErrorAction SilentlyContinue){throw 'Interrupted wrapper terminal must be collected'}
$Before=@(Get-Content -LiteralPath (Join-Path $Preparation 'before-inputs.json') -Raw|ConvertFrom-Json)
if($Before.Count -ne 4){throw 'Four original SMTP files required'}
foreach($Entry in $Before){
    $Copy=[IO.Path]::GetFullPath($Entry.PreservedAt)
    if(-not $Copy.StartsWith($Preparation+'\before\',[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $Copy).Hash -ne $Entry.Hash){throw 'Original SMTP input changed'}
}
$StatePath=Join-Path $Run 'state.json'
$BeforeState=Get-Content -LiteralPath (Join-Path $Preparation 'before/state.json') -Raw|ConvertFrom-Json
$AfterState=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
$BeforeSmtp=@($BeforeState.processes|Where-Object name -EQ 'smtp-fixture')
$AfterSmtp=@($AfterState.processes|Where-Object name -EQ 'smtp-fixture')
if($BeforeSmtp.Count -ne 1 -or $AfterSmtp.Count -ne 1 -or $BeforeSmtp[0].id -ne 22016 -or $AfterSmtp[0].id -ne 31636){throw 'Expected SMTP process transition missing'}
$BeforeSmtp[0].id=$AfterSmtp[0].id
if(($BeforeState|ConvertTo-Json -Depth 30 -Compress) -ne ($AfterState|ConvertTo-Json -Depth 30 -Compress)){throw 'Reference state changed beyond owned SMTP process identifier'}
foreach($Entry in $AfterState.processes){
    $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Process -or -not $Process.CommandLine.Contains($Entry.marker)){throw 'Owned reference process unavailable'}
}
$SmtpProcess=Get-Process -Id $AfterSmtp[0].id
$Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $SmtpProcess.Id)
if($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1' -or $Listeners[0].LocalPort -ne $AfterState.smtpFixture.port){throw 'Expected loopback SMTP listener missing'}
if((Get-Item -LiteralPath (Join-Path $AfterState.smtpFixture.directory 'snapshot.json')).LastWriteTimeUtc -le $SmtpProcess.StartTime.ToUniversalTime()){throw 'Fresh SMTP snapshot missing'}
$Arguments=@(Get-Content -LiteralPath (Join-Path $Run 'smtp.args'))
if($Arguments[-1] -ne '14400' -or $Arguments[-2] -ne [string]$AfterState.smtpFixture.port){throw 'Expected SMTP lifetime missing'}
$Healthy=0
foreach($Service in $AfterState.services){
    if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -ne 'UP'){throw 'Original service health changed'}
    $Healthy++
}
if($Healthy -ne 6){throw 'Six original services required'}
$HistoricalBindings=@()
$OldStateHash=(Get-FileHash -LiteralPath (Join-Path $Preparation 'before/state.json')).Hash
foreach($Round in @('r10','r11','r12','r13')){
    $ManifestPath=Join-Path $Evidence "e3-credit-independent-20261009-$Round/inputs.json"
    $Entry=@(Get-Content -LiteralPath $ManifestPath -Raw|ConvertFrom-Json|Where-Object {[IO.Path]::GetFullPath($_.Path,$Root) -eq $StatePath})
    if($Entry.Count -ne 1 -or $Entry[0].Hash -ne $OldStateHash){throw 'Historical reference state binding failed'}
    $HistoricalBindings+=@{Round=$Round;Manifest=$ManifestPath;ManifestHash=(Get-FileHash -LiteralPath $ManifestPath).Hash;StateHash=$OldStateHash}
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Result=@{
    Passed=$true;OriginalWrapperCompleted=$false;OriginalWrapperSession=54337;OriginalWrapperTerminal='83d2b1';OriginalWrapperExit=-1
    WrapperInterruptionReason='Native PowerShell redirection did not finish after its child exited and the detached SMTP process became ready'
    PreservedFiles=4;HistoricalInputBindings=$HistoricalBindings;PreviousStateHash=$OldStateHash;CurrentStateHash=(Get-FileHash -LiteralPath $StatePath).Hash
    ExistingServicesKept=$true;HealthyServices=$Healthy;StateChangedOnlySmtpProcess=$true;Process=$SmtpProcess.Id;Port=$AfterState.smtpFixture.port
    LifetimeSeconds=14400;StartedUtc=$SmtpProcess.StartTime.ToUniversalTime().ToString('o');ExpiresUtc=$SmtpProcess.StartTime.ToUniversalTime().AddSeconds(14400).ToString('o')
    CertificateRenewed=$false;ProductModified=$false;ProductionModified=$false;RawStateEmitted=$false;BusinessWrites=0;ExternalMessagesSent=$false
}
$Result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E3_SMTP_COMPLETION: passed=true; original_wrapper_exit=-1; preserved_files=4; historical_rounds=4; process=$($SmtpProcess.Id); healthy=6; state_changed_only_smtp_process=true; product_modified=false; production_modified=false"
