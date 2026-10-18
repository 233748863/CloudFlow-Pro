param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1', [ValidatePattern('^r[1-9][0-9]*$')][string]$SourceRound='r27')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$SourceEvidence=Join-Path $Evidence "h3-core-independent-20261011-$SourceRound"
$Output=Join-Path $Evidence "h3-portal-knowledge-menus-diagnostic-20261012-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous portal lock diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $SourceEvidence 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $SourceEvidence 'original-business-result.json') -Raw|ConvertFrom-Json
if($Launcher.scenario -ne 'PortalKnowledge' -or -not $Launcher.processesStopped -or -not $Launcher.inputsUnchanged -or $Business.caseTag -notmatch '^[a-f0-9]{12}$'){throw 'Completed original portal knowledge run required'}
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
$Process=$null;$Failure=$null;$Observation=$null;$SourceUnchanged=$false;$Stopped=$false
try{
    $Process=Start-Process -FilePath $Mysqld -ArgumentList @('--no-defaults',"--datadir=`"$CloneData`"",'--bind-address=127.0.0.1',"--port=$Port",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=64M','--max-connections=8','--super-read-only=ON','--read-only=ON',"--log-error=`"$(Join-Path $Output 'mysql.log')`"") -WorkingDirectory $Output -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Output 'mysql.stdout.log') -RedirectStandardError (Join-Path $Output 'mysql.stderr.log')
    $Ready=$false
    for($Attempt=0;$Attempt -lt 120;$Attempt++){
        if($Process.HasExited){throw 'Diagnostic clone exited before readiness'}
        try{if((Read-DiagnosticSql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Read-DiagnosticSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $CloneData){throw 'Diagnostic clone identity or readiness failed'}
    if((Read-DiagnosticSql 'SELECT CONCAT(@@read_only,@@super_read_only);') -ne '11'){throw 'Diagnostic SQL must be read-only'}
    $Statement="SELECT JSON_OBJECT('allGrants',(SELECT GROUP_CONCAT(CONCAT(tenant_id,':',role_id) ORDER BY tenant_id,role_id) FROM sys_role_menu WHERE menu_id=1915),'businessGrants',(SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1915),'foreignGrantRole',(SELECT role_key FROM sys_role WHERE tenant_id=100001 AND role_id=990000701),'foreignGrantCount',(SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100001 AND role_id=990000701 AND menu_id=1915),'employeeGrants',(SELECT COUNT(*) FROM sys_role_menu binding JOIN sys_role role ON role.role_id=binding.role_id AND role.tenant_id=binding.tenant_id WHERE role.role_key='employee' AND binding.menu_id=1915),'parentPermission',(SELECT parent.perms FROM sys_menu menu JOIN sys_menu parent ON parent.menu_id=menu.parent_id WHERE menu.menu_id=1915),'orphanGrants',(SELECT COUNT(*) FROM sys_role_menu binding LEFT JOIN sys_role role ON role.role_id=binding.role_id AND role.tenant_id=binding.tenant_id WHERE binding.menu_id=1915 AND role.role_id IS NULL));"
    $Observation=Read-DiagnosticSql $Statement|ConvertFrom-Json
    if(-not $Observation -or -not $Observation.allGrants){throw 'Original knowledge menu grants missing from diagnostic clone'}
    $Observation|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'observation.json') -Encoding utf8NoBOM
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
    $Result=@{Passed=($null -eq $Failure -and $SourceUnchanged -and $Stopped -and $null -ne $Observation);Failure=$Failure;SourceRound=$SourceRound;SourceRun=$SourceRun;SourceFiles=$Inputs.Count;SourceUnchanged=$SourceUnchanged;CloneStopped=$Stopped;ReadOnly=$true;SqlWrites=0;Observation=$Observation;ProductModified=$false;OriginalRuntimeWritten=$false}
    $Result|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "H3_PORTAL_KNOWLEDGE_MENUS_DIAGNOSTIC: passed=$($Result.Passed); source_files=$($Inputs.Count); source_unchanged=$SourceUnchanged; clone_stopped=$Stopped; sql_writes=0"
}
if(-not $Result.Passed){throw "Portal knowledge menu diagnosis failed: $Failure"}


