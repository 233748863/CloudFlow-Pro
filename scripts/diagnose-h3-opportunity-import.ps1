param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1', [ValidatePattern('^r[1-9][0-9]*$')][string]$SourceRound='r13', [switch]$ProbeLocks)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$SourceEvidence=Join-Path $Evidence "h3-core-independent-20261011-$SourceRound"
$Output=Join-Path $Evidence "h3-import-diagnostic-20261011-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous import diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $SourceEvidence 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $SourceEvidence 'original-business-result.json') -Raw|ConvertFrom-Json
if($Launcher.scenario -ne 'OpportunityImport' -or -not $Launcher.processesStopped -or -not $Launcher.inputsUnchanged -or $Business.caseTag -notmatch '^[a-f0-9]{12}$'){throw 'Completed original opportunity import run required'}
$SourceRun=[IO.Path]::GetFullPath($Launcher.run)
if((Split-Path -Parent $SourceRun) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $SourceRun) -notmatch '^[a-f0-9]{32}$'){throw 'Owned source runtime required'}
$State=Get-Content -LiteralPath (Join-Path $SourceRun 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'STOPPED' -or [IO.Path]::GetFullPath($State.run) -ne $SourceRun){throw 'Source must remain stopped'}
foreach($Owned in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)"
    if($Observed -and $Observed.CommandLine -and $Observed.CommandLine.Contains($Owned.marker)){throw 'Source process still running'}
}
$SourceData=Join-Path $SourceRun 'mysql-data'
foreach($Directory in @($Root,$Evidence,$SourceRun,$SourceData)){
    if((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected diagnostic source rejected'}
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Access=Get-Acl -LiteralPath $Output
$Access.SetAccessRuleProtection($true,$false)
foreach($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $Output -AclObject $Access
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
if($ProbeLocks){[IO.File]::Copy((Join-Path $Root 'scripts/diagnose-h3-import-locks.mjs'),(Join-Path $Output 'original-lock-probe.mjs'),$false)}
$CloneData=Join-Path $Output 'private/mysql-data'
[IO.Directory]::CreateDirectory($CloneData)|Out-Null
$SourceFiles=@(Get-ChildItem -LiteralPath $SourceData -Recurse -Force)
if(@($SourceFiles|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Redirected data entry rejected'}
$Inputs=@(foreach($File in $SourceFiles|Where-Object{-not $_.PSIsContainer}){
    $Relative=[IO.Path]::GetRelativePath($SourceData,$File.FullName)
    $Copy=[IO.Path]::GetFullPath((Join-Path $CloneData $Relative))
    if(-not $Copy.StartsWith($CloneData+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Data copy escaped owned clone'}
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $File.FullName).Hash
    [IO.File]::Copy($File.FullName,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Diagnostic copy differs from original database'}
    [pscustomobject]@{Path=$File.FullName;Hash=$Hash;Copy=$Copy}
})
$Inputs|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'source-inputs.json') -Encoding utf8NoBOM
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Reservation=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$Reservation.Start()
try{$Port=$Reservation.LocalEndpoint.Port}finally{$Reservation.Stop()}
function Read-DiagnosticSql([string]$Statement){
    if($Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S'){throw 'Only a single read-only query is permitted'}
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')){$Info.ArgumentList.Add($Argument)}
    $Client=[Diagnostics.Process]::Start($Info)
    $Read=$Client.StandardOutput.ReadToEndAsync();$ErrorRead=$Client.StandardError.ReadToEndAsync()
    $Client.StandardInput.WriteLine($Statement);$Client.StandardInput.Close()
    if(-not $Client.WaitForExit(30000)){$Client.Kill($true);throw 'Diagnostic query timed out'}
    if($Client.ExitCode -ne 0){throw 'Diagnostic SELECT failed'}
    $null=$ErrorRead.GetAwaiter().GetResult()
    return $Read.GetAwaiter().GetResult().Trim()
}
$Process=$null;$Failure=$null;$Observation=$null;$SourceUnchanged=$false;$Stopped=$false;$ProbePassed=$null
try{
    $SuperReadOnly=if($ProbeLocks){'OFF'}else{'ON'}
    $Process=Start-Process -FilePath $Mysqld -ArgumentList @('--no-defaults',"--datadir=`"$CloneData`"",'--bind-address=127.0.0.1',"--port=$Port",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=64M','--max-connections=8',"--super-read-only=$SuperReadOnly",'--read-only=ON',"--log-error=`"$(Join-Path $Output 'mysql.log')`"") -WorkingDirectory $Output -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Output 'mysql.stdout.log') -RedirectStandardError (Join-Path $Output 'mysql.stderr.log')
    $Ready=$false
    for($Attempt=0;$Attempt -lt 120;$Attempt++){
        if($Process.HasExited){throw 'Diagnostic clone exited before readiness'}
        try{if((Read-DiagnosticSql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Read-DiagnosticSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $CloneData){throw 'Diagnostic clone identity or readiness failed'}
    $ExpectedReadOnly=if($ProbeLocks){'10'}else{'11'}
    if((Read-DiagnosticSql 'SELECT CONCAT(@@read_only,@@super_read_only);') -ne $ExpectedReadOnly){throw 'Diagnostic read-only configuration mismatch'}
    $Prefix="H3_IMPORT_$($Business.caseTag)_"
    $Statement="SELECT JSON_OBJECT('tasks',(SELECT JSON_ARRAYAGG(JSON_OBJECT('taskId',task_id,'status',status,'successRows',success_rows,'failRows',fail_rows)) FROM sys_import_task WHERE tenant_id=100000 AND biz_type='OPPORTUNITY'),'opportunities',(SELECT JSON_ARRAYAGG(JSON_OBJECT('id',opportunity_id,'name',opportunity_name,'version',version,'contactId',contact_id,'stage',stage,'amount',expected_amount,'winRate',win_rate,'weightedAmount',weighted_amount,'remark',remark)) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name LIKE '$Prefix%'),'stages',(SELECT JSON_ARRAYAGG(JSON_OBJECT('stage',stage_code,'defaultWinRate',default_win_rate)) FROM crm_sales_stage WHERE tenant_id=100000));"
    $Observation=Read-DiagnosticSql $Statement|ConvertFrom-Json
    if(-not $Observation -or -not $Observation.opportunities){throw 'Original import records missing from diagnostic clone'}
    $Observation|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'observation.json') -Encoding utf8NoBOM
    if($ProbeLocks){
        & node (Join-Path $Root 'scripts/diagnose-h3-import-locks.mjs') $Port $CloneData $Business.caseTag $Output *> (Join-Path $Output 'lock-probe.log')
        $ProbePassed=$LASTEXITCODE -eq 0
        if(-not $ProbePassed){throw 'Owned read-only lock observation failed; original probe result retained'}
    }
}catch{$Failure=$_.Exception.Message}
finally{
    if($Process){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.Id)"
        if($Observed){
            if(-not $Observed.CommandLine.Contains($CloneData)){throw 'Diagnostic process ownership changed'}
            $Process.Kill($true)
        }
        $Stopped=$Process.WaitForExit(30000)
    }
    $SourceUnchanged=$true
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){$SourceUnchanged=$false}}
    $Result=@{Passed=($null -eq $Failure -and $SourceUnchanged -and $Stopped -and $null -ne $Observation);Failure=$Failure;SourceRound=$SourceRound;SourceRun=$SourceRun;SourceFiles=$Inputs.Count;SourceUnchanged=$SourceUnchanged;CloneStopped=$Stopped;ReadOnly=$true;SuperReadOnly=(-not $ProbeLocks);AdministrativeLockingReads=[bool]$ProbeLocks;SqlWrites=0;LockProbePassed=$ProbePassed;ProductModified=$false;OriginalRuntimeWritten=$false}
    $Result|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "H3_IMPORT_DIAGNOSTIC: passed=$($Result.Passed); source_files=$($Inputs.Count); source_unchanged=$SourceUnchanged; clone_stopped=$Stopped; sql_writes=0"
}
if(-not $Result.Passed){throw "Import diagnosis failed: $Failure"}
