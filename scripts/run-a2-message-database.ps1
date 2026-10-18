param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Output=Join-Path $Root ".cloudflow-runtime/a2-message-database-20261016-$Round"
if(Test-Path -LiteralPath $Output){throw 'Round already exists; use a new round'}
$Run=Join-Path $Root ('.cloudflow-runtime/batch-g-integration/'+[Guid]::NewGuid().ToString('N'))
$Data=Join-Path $Run 'mysql-data'
foreach($Directory in @($Output,$Run)){
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    $Ancestor=Get-Item -LiteralPath $Directory
    while($null -ne $Ancestor){
        if($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected verification directory rejected'}
        $Ancestor=$Ancestor.Parent
    }
}
$Inputs=@('scripts/run-a2-message-database.ps1','scripts/verify-message-delivery.ps1','cloudflow-backend/DB/01.cloudflow-common.sql','cloudflow-backend/DB/06.cloudflow-business-seed.sql')
$Found=@(rg --files (Join-Path $Root 'cloudflow-backend/cloudflow-auth/src/main') (Join-Path $Root 'cloudflow-backend/cloudflow-common') -g '*.java' -g '*.xml' -g '*.yml' -g '*.yaml')
if($LASTEXITCODE -ne 0){throw 'Source input enumeration failed'}
$Inputs+=@($Found|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_)})
$Inputs+=@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/message-checks') -File -Filter 'Message*Checks.java'|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
$Snapshot=@($Inputs|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
$Snapshot|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$Listener.Start();$Port=$Listener.LocalEndpoint.Port;$Listener.Stop()
$Server=$null;$Passed=$false;$Failure=$null;$Cleaned=$false
try{
    $Init=Start-Process -FilePath $Mysqld -WindowStyle Hidden -PassThru -Wait -ArgumentList @('--no-defaults','--initialize-insecure',"--datadir=`"$Data`"",'--innodb-buffer-pool-size=64M',"--log-error=`"$(Join-Path $Run 'mysql-init.log')`"")
    if($Init.ExitCode -ne 0){throw 'Owned MySQL initialization failed'}
    $Server=Start-Process -FilePath $Mysqld -WindowStyle Hidden -PassThru -ArgumentList @('--no-defaults',"--datadir=`"$Data`"",'--bind-address=127.0.0.1',"--port=$Port",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=64M','--max-connections=40',"--log-error=`"$(Join-Path $Run 'mysql.log')`"")
    $Ready=$false
    for($Attempt=0;$Attempt -lt 60;$Attempt++){
        $Server.Refresh();if($Server.HasExited){throw 'Owned MySQL exited before ready'}
        $Actual=& $Mysql --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$Port" --user=root --batch --skip-column-names '--execute=SELECT @@datadir;' 2>$null
        if($LASTEXITCODE -eq 0){
            if([IO.Path]::GetFullPath([string]$Actual).TrimEnd('\','/') -ne $Data){throw 'Owned MySQL datadir mismatch'}
            $Ready=$true;break
        }
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready){throw 'Owned MySQL readiness timeout'}
    @{run=$Run;data=$Data;mysqlPort=$Port;status='RUNNING';services=@();processes=@(@{name='mysql';id=$Server.Id;marker=$Data})}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Run 'state.json') -Encoding utf8NoBOM
    & (Join-Path $Root 'scripts/verify-message-delivery.ps1') -StatePath ([IO.Path]::GetRelativePath($Root,(Join-Path $Run 'state.json'))) *> (Join-Path $Output 'checks.log')
    if($LASTEXITCODE -ne 0){throw 'Message verification returned nonzero exit'}
    $Passed=$true
}catch{$Failure=$_.Exception.Message}
finally{
    if($null -ne $Server){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Server.Id)"
        if($null -ne $Current){
            if(-not $Current.CommandLine.Contains($Data)){throw 'MySQL owner changed; cleanup refused'}
            $Server.Kill($true);$Server.WaitForExit()
        }
    }
    foreach($Worker in @(Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($Data)})){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Worker.ProcessId)"
        if($Current -and $Current.CommandLine.Contains($Data)){
            $OwnedProcess=[Diagnostics.Process]::GetProcessById($Current.ProcessId)
            $OwnedProcess.Kill($true);$OwnedProcess.WaitForExit()
        }
    }
    if(@(Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($Run)}).Count -ne 0){throw 'Owned database process still running'}
    $Resolved=[IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Run).Path)
    if((Split-Path -Parent $Resolved) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Resolved) -notmatch '^[a-f0-9]{32}$'){throw 'Cleanup path rejected'}
    $Links=@(Get-ChildItem -LiteralPath $Resolved -Recurse -Force -Attributes ReparsePoint)
    if($Links.Count -ne 0){throw 'Cleanup contains redirected files'}
    $Tracked=@(git -C $Root ls-files -- ([IO.Path]::GetRelativePath($Root,$Resolved)))
    if($Tracked.Count -ne 0){throw 'Cleanup includes tracked files'}
    $FreeBefore=[IO.DriveInfo]::new('D:\').AvailableFreeSpace
    $Bytes=([long[]]@(Get-ChildItem -LiteralPath $Resolved -Recurse -File -Force|ForEach-Object Length)|Measure-Object -Sum).Sum
    Remove-Item -LiteralPath $Resolved -Recurse -Force
    $Cleaned=-not(Test-Path -LiteralPath $Resolved)
    $FreeAfter=[IO.DriveInfo]::new('D:\').AvailableFreeSpace
    foreach($Item in $Snapshot){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){$Passed=$false;$Failure='Input changed during verification'}}
    @{passed=$Passed;failure=$Failure;databaseCleaned=$Cleaned;runtime=$Resolved;removedFileBytes=$Bytes;freeBefore=$FreeBefore;freeAfter=$FreeAfter;diskDeltaAttribution='not_attributed';sourceInputs=$Snapshot.Count;scope='actual service and isolated MySQL; no HTTP; no real SMS vendor';globalComplete=$false}|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
}
Get-Content -LiteralPath (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^A2_(SMS|OUTBOX)_|^MESSAGE_.*CHECKS:|AssertionError|Exception|^MESSAGE_DATABASE_'}
"A2_MESSAGE_DATABASE: passed=$Passed; database_cleaned=$Cleaned; failure=$Failure"
if(-not $Passed){throw 'A2 message verification failed; minimal diagnostic evidence retained'}
