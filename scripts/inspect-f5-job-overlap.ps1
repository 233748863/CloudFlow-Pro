param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound='r4')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence "f5-rfq-independent-20261015-$IndependentRound"
$Output=Join-Path $Evidence "f5-job-overlap-diagnosis-20261016-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve the previous F5 job diagnosis'}
$LauncherPath=Join-Path $Source 'launcher-result.json'
$TerminalPath=Join-Path $Source 'terminal-receipt.json'
$Launcher=Get-Content -LiteralPath $LauncherPath -Raw|ConvertFrom-Json
$Terminal=Get-Content -LiteralPath $TerminalPath -Raw|ConvertFrom-Json
if($Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept -or -not $Terminal.TerminalCollected){throw 'A stopped failed F5 round with its terminal receipt is required'}
$Run=[IO.Path]::GetFullPath($Launcher.run)
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $Run) -eq '9799534e1a3a47b5958330f14ae16dc7'){throw 'An independent F5 database is required'}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
$Data=Join-Path $Run 'mysql-data'
if($State.status -ne 'STOPPED' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Stopped independent state required'}
foreach($Directory in @($Root,$Run,$Data)){
    if((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected diagnosis directory rejected'}
}
foreach($Owner in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owner.id)"
    if($Observed -and $Observed.CommandLine.Contains($Owner.marker)){throw 'The original independent process is still running'}
}
if(@(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort -ErrorAction SilentlyContinue).Count){throw 'The retained database port is occupied'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath $Run)
$Inputs=@(foreach($File in @($PSCommandPath,$LauncherPath,$TerminalPath,$StatePath,(Join-Path $Source 'result.json'),(Join-Path $Run 'auth/logs/auth-service.log'))){
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$File))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($File,$Copy,$false)
    [pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash;Original=$Copy}
})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Mysql=(Get-Command mysql.exe).Source
function Sql([string]$Statement){
    if($Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S|\bINTO\s+(OUTFILE|DUMPFILE)\b'){throw 'Only one read is allowed'}
    $Start=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Start.UseShellExecute=$false;$Start.CreateNoWindow=$true
    $Start.RedirectStandardInput=$true;$Start.RedirectStandardOutput=$true;$Start.RedirectStandardError=$true
    $Start.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Start.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')){$Start.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Start)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(30000)){$Child.Kill();$Child.WaitForExit();throw 'Diagnosis read timed out'}
    if($Child.ExitCode -ne 0){throw 'Diagnosis read failed; raw diagnostics withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
$DatabaseProcess=$null;$Stopped=$false;$Failure=$null;$Rows=@()
try{
    $Start=[Diagnostics.ProcessStartInfo]::new((Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'))
    $Start.UseShellExecute=$false;$Start.CreateNoWindow=$true
    foreach($Argument in @('--no-defaults',"--datadir=$Data",'--bind-address=127.0.0.1',"--port=$($State.mysqlPort)",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=128M','--max-connections=10','--read-only=ON','--super-read-only=ON','--event-scheduler=OFF',('--log-error='+(Join-Path $Output 'mysql-diagnosis.log')))){$Start.ArgumentList.Add($Argument)}
    $DatabaseProcess=[Diagnostics.Process]::Start($Start)
    $Ready=$false
    for($Attempt=0;$Attempt -lt 90;$Attempt++){
        try{if((Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        if($DatabaseProcess.HasExited){throw 'Readonly diagnosis database exited'}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data){throw 'Readonly database ownership differs'}
    if((Sql "SELECT CONCAT(@@read_only,':',@@super_read_only);") -ne '1:1'){throw 'Readonly enforcement is missing'}
    $Raw=Sql "SELECT JSON_OBJECT('executeNo',execute_no,'triggerType',trigger_type,'status',execute_status,'result',result_msg,'started',CAST(start_time AS CHAR),'ended',CAST(end_time AS CHAR),'reported',CAST(report_time AS CHAR)) FROM sys_job_log WHERE tenant_id=100000 AND handler_name='messageDeliveryRecovery' ORDER BY log_id;"
    $Rows=@($Raw -split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
    if($Rows.Count -eq 0){throw 'No original message recovery task records were found'}
}catch{$Failure=$_.Exception.Message}
finally{
    if($DatabaseProcess){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($DatabaseProcess.Id)"
        if($Observed){
            if(-not $Observed.CommandLine.Contains($Data)){throw 'Diagnosis process ownership changed'}
            $DatabaseProcess.Kill($true)
        }
        $Stopped=$DatabaseProcess.WaitForExit(30000)
    }
    foreach($Input in $Inputs){
        if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash -or (Get-FileHash -LiteralPath $Input.Original).Hash -ne $Input.Hash){$Failure='Original F5 diagnosis input changed'}
    }
    if(-not $Stopped){$Failure='Readonly diagnosis process did not stop'}
}
$Result=[ordered]@{Passed=($null -eq $Failure);Failure=$Failure;IndependentRound=$IndependentRound;Rows=$Rows;Readonly=$true;SuperReadonly=$true;Stopped=$Stopped;BusinessWrites=0;OriginalInputsKept=($null -eq $Failure);ProductModified=$false;ReferenceRuntimeWritten=$false}
$Result|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
if($Failure){throw $Failure}
$Result|ConvertTo-Json -Depth 7
"F5_JOB_OVERLAP_DIAGNOSIS: passed=true; rows=$($Rows.Count); readonly=true; stopped=true; business_writes=0"
