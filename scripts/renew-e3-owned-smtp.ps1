$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence 'e3-smtp-state-prep-20261010-r1'
if(Test-Path -LiteralPath $Output){throw 'Retain previous SMTP preparation'}
$Active=@(Get-CimInstance Win32_Process|Where-Object {$_.CommandLine -match '(?:^|\s)(?:scripts[\\/])?(?:run-e3-credit-independent\.ps1|verify-e3-credit\.mjs)(?:\s|$)'})
if($Active.Count -gt 0){throw 'E3 verification must finish before SMTP maintenance'}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned reference runtime required'}
$StateHash=(Get-FileHash -LiteralPath $StatePath -Algorithm SHA256).Hash
$HistoricalBindings=@()
foreach($Round in @('r10','r11','r12','r13')){
    $ManifestPath=Join-Path $Evidence "e3-credit-independent-20261009-$Round/inputs.json"
    $Manifest=Get-Content -LiteralPath $ManifestPath -Raw|ConvertFrom-Json
    $Entry=@($Manifest|Where-Object {[IO.Path]::GetFullPath($_.Path,$Root) -eq $StatePath})
    if($Entry.Count -ne 1 -or $Entry[0].Hash -ne $StateHash){throw 'Current reference state must match all R10-R13 original inputs'}
    $HistoricalBindings+=@{Round=$Round;Manifest=$ManifestPath;ManifestHash=(Get-FileHash -LiteralPath $ManifestPath).Hash;StateHash=$StateHash}
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Access=Get-Acl -LiteralPath $Output
$Access.SetAccessRuleProtection($true,$false)
foreach($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $Output -AclObject $Access
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Before=@()
foreach($Relative in @('state.json','smtp.args','smtp-compile.args','private/smtp/snapshot.json')){
    $Source=Join-Path $Run $Relative
    if((Get-Item -LiteralPath $Source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected SMTP input rejected'}
    $Copy=Join-Path $Output ('before/'+$Relative)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Source).Hash -ne $Hash){throw 'SMTP input changed during preservation'}
    $Before+=@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
}
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Runner=Join-Path $Root 'scripts/restart-isolated-smtp-fixture.ps1'
$RunnerHash=(Get-FileHash -LiteralPath $Runner).Hash
[IO.File]::Copy($Runner,(Join-Path $Output 'restart-original.ps1'),$false)
$Pwsh=(Get-Process -Id $PID).Path
& $Pwsh -NoLogo -NoProfile -File $Runner -StatePath $StatePath -LifetimeSeconds 14400 *> (Join-Path $Output 'restart.log')
$RestartExit=$LASTEXITCODE
if($RestartExit -ne 0){throw 'Owned SMTP restart failed; original output retained'}
$After=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
$OldProcesses=@($State.processes|Where-Object name -NE 'smtp-fixture')
$NewProcesses=@($After.processes|Where-Object name -NE 'smtp-fixture')
if(($OldProcesses|ConvertTo-Json -Depth 10 -Compress) -ne ($NewProcesses|ConvertTo-Json -Depth 10 -Compress)){throw 'Non-SMTP process metadata changed'}
foreach($Entry in $Before){if((Get-FileHash -LiteralPath $Entry.PreservedAt).Hash -ne $Entry.Hash){throw 'Preserved SMTP input changed'}}
$NewSmtp=@($After.processes|Where-Object name -EQ 'smtp-fixture')
if($NewSmtp.Count -ne 1 -or (Get-FileHash -LiteralPath $Runner).Hash -ne $RunnerHash){throw 'SMTP restart source or identity changed'}
$Result=@{Passed=$true;RestartExit=$RestartExit;PreviousStateHash=$StateHash;CurrentStateHash=(Get-FileHash -LiteralPath $StatePath).Hash
    HistoricalInputBindings=$HistoricalBindings;PreservedFiles=$Before.Count;Port=$After.smtpFixture.port;Process=$NewSmtp[0].id;LifetimeSeconds=14400
    ExistingServicesKept=$true;CertificateRenewed=$false;ProductModified=$false;ProductionModified=$false;RawStateEmitted=$false}
$Result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E3_SMTP_MAINTENANCE: passed=true; historical_rounds=4; preserved_files=$($Before.Count); lifetime_seconds=14400; existing_services_kept=true; product_modified=false; production_modified=false"
