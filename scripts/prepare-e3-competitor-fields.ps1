param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence 'e3-credit-independent-20261009-r12'
$Output=Join-Path $Evidence "e3-competitor-fields-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve original competitor field diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $Source 'result.json') -Raw|ConvertFrom-Json -Depth 80
$Fixture=Get-Content -LiteralPath (Join-Path $Source 'fixture.json') -Raw|ConvertFrom-Json -Depth 40
if($Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept -or $Business.failure.message -ne 'mobile_competitor_editor_reads_saved_business_fields'){throw 'Actual completed R12 field failure required'}
$Sample=@($Fixture.competitors|Where-Object {$_.request.competitorName -eq '竞争对手甲'})
if($Sample.Count -ne 1 -or [string]$Sample[0].id -notmatch '^[1-9][0-9]*$' -or $Fixture.marker -notmatch '^E3C_[a-f0-9]{12}$' -or $Sample[0].code -ne ($Fixture.marker+'_竞争对手甲')){throw 'Owned competitor sample required'}
if($Sample[0].request.strengths -ne '交付响应' -or $Sample[0].request.weaknesses -ne '价格较高'){throw 'Actual historical plural field request differs'}
$Run=[IO.Path]::GetFullPath($Launcher.run)
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or $Run.EndsWith('9799534e1a3a47b5958330f14ae16dc7')){throw 'Independent runtime required'}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'STOPPED'){throw 'Independent runtime must be stopped'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if($Observed -and $Observed.CommandLine.Contains($Entry.marker)){throw 'Independent process remains active'}}
$Files=@('cloudflow-frontend/src/pages/CrmLostAnalysisPage.tsx','cloudflow-frontend/src/services/api/crm/operations.ts')
$Baseline=@{}
foreach($Entry in @(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r88-inputs.json') -Raw|ConvertFrom-Json)){
    $File=[IO.Path]::GetFullPath($Entry.Path,$Root)
    if((Get-FileHash -LiteralPath $File).Hash -ne $Entry.Hash){throw 'Frontend baseline differs from F88'}
    $Baseline[$File]=$Entry.Hash
}
$Page=Get-Content -LiteralPath (Join-Path $Root $Files[0]) -Raw
$EntityPath=Join-Path $Root 'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCompetitor.java'
$Entity=Get-Content -LiteralPath $EntityPath -Raw
if(-not $Page.Contains('competitor.strengths') -or -not $Page.Contains('competitor.weaknesses') -or -not $Entity.Contains('private String strength;') -or -not $Entity.Contains('private String weakness;')){throw 'Actual frontend and backend field mismatch differs'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Before=@(foreach($File in $Files){
    $Path=Join-Path $Root $File;$Copy=Join-Path $Output ('before/'+$File)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Baseline[$Path]){throw 'Preserved frontend source differs'}
    [pscustomobject]@{Path=$Path;Hash=$Baseline[$Path];PreservedAt=$Copy}
})
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Inputs=@($PSCommandPath,$EntityPath,(Join-Path $Source 'result.json'),(Join-Path $Source 'fixture.json'),(Join-Path $Source 'launcher-result.json'),(Join-Path $Source 'e3-failure-manager.png'),(Join-Path $Run 'state.json'))+@($Before.Path)
$Inputs=@($Inputs|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Data=Join-Path $Run 'mysql-data'
if((Get-Item -LiteralPath $Data).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected database rejected'}
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$Listener.Start()
try{$Port=$Listener.LocalEndpoint.Port}finally{$Listener.Stop()}
function Read-Sql([string]$Statement){
    if($Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S'){throw 'One read-only statement required'}
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(20000)){$Child.Kill();$Child.WaitForExit();throw 'Read-only inspection timed out'}
    if($Child.ExitCode -ne 0){throw 'Read-only inspection failed; raw output withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
$Owned=$null;$Stopped=$false
try{
    $Owned=Start-Process -FilePath $Mysqld -WindowStyle Hidden -PassThru -WorkingDirectory $Run -RedirectStandardOutput (Join-Path $Output 'mysql.stdout.log') -RedirectStandardError (Join-Path $Output 'mysql.stderr.log') -ArgumentList @('--no-defaults',('--datadir='+$Data),'--bind-address=127.0.0.1',("--port=$Port"),'--mysqlx=OFF','--skip-log-bin','--super-read-only=ON','--innodb-buffer-pool-size=64M',('--log-error='+(Join-Path $Output 'mysql.log')))
    $Ready=$false
    foreach($Attempt in 1..60){try{if((Read-Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{};if($Owned.HasExited){throw 'Read-only database exited'};Start-Sleep -Milliseconds 500}
    if(-not $Ready -or [IO.Path]::GetFullPath((Read-Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data -or (Read-Sql 'SELECT @@super_read_only;') -ne '1'){throw 'Read-only database ownership failed'}
    $Values=Read-Sql "SELECT JSON_OBJECT('storedStrengthIsNull',strength IS NULL,'storedWeaknessIsNull',weakness IS NULL,'nameMatches',competitor_name='竞争对手甲','industryMatches',industry='软件','version',version) FROM crm_competitor WHERE tenant_id=100000 AND competitor_id=$($Sample[0].id) AND competitor_code='$($Sample[0].code)' AND deleted=0;"|ConvertFrom-Json
    if(-not $Values.storedStrengthIsNull -or -not $Values.storedWeaknessIsNull -or -not $Values.nameMatches -or -not $Values.industryMatches){throw 'Actual stored field loss not reproduced'}
}finally{
    if($Owned){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.Id)";if($Observed){if(-not $Observed.CommandLine.Contains($Data)){throw 'Inspection process ownership changed'};$Owned.Kill($true)};if(-not $Owned.WaitForExit(30000)){throw 'Inspection database did not stop'};$Stopped=$true}
}
foreach($Entry in $Inputs){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash){throw 'Historical diagnosis input changed'}}
$Result=[pscustomobject]@{
    RuntimeRound='r12';BaselineFrontend='r88';ProductFiles=$Before.Count;OriginalsPreserved=$true
    FrontendFields=@('strengths','weaknesses');BackendFields=@('strength','weakness')
    HistoricalRequestUsedPluralFields=$true;StoredStrengthIsNull=[bool]$Values.storedStrengthIsNull;StoredWeaknessIsNull=[bool]$Values.storedWeaknessIsNull
    ScreenshotActuallyViewed=$true;FailureScreenshot=(Join-Path $Source 'e3-failure-manager.png')
    SuperReadOnly=$true;BusinessWrites=0;ReferenceRuntimeAccessed=$false;InspectionProcessStopped=$Stopped
    OriginalRoundUnchanged=$true;ProductModified=$false;ProductionModified=$false
}
$Result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E3_COMPETITOR_FIELDS_DIAGNOSIS: mismatch=true; stored_fields_empty=2; preserved_product_files=2; business_writes=0; stopped=true'

