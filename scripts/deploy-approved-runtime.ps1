param(
    [Parameter(Mandatory=$true)][ValidateSet('Backup','VerifyArchive','Rebuild','Start','Restore','Status')][string]$Phase,
    [ValidateRange(0,15)][int]$RedisDatabase = 0
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/batch-e-runtime/connection.ps1')
$BackendRoot = Join-Path $Root 'cloudflow-backend'
$Directory = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$StatePath = Join-Path $Directory 'deployment-state.json'
$PrivateDirectory = Join-Path $Directory 'private'
$DatabaseName = 'cloud_flow_db'
$ExpectedTableCount = 374
$ExpectedBackupTableCount = 323
$ExpectedHGMenuCount = 112
$ExpectedEmployeeGrantCount = 218
if ($env:DB_URL -notmatch '^jdbc:mysql://192\.168\.1\.173:3306/cloud_flow_db(?:\?|$)' -or -not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw 'Unexpected database target or missing credentials' }
$MysqlArguments = @('--no-defaults','--host=192.168.1.173','--port=3306','--protocol=TCP',"--user=$env:DB_USERNAME",'--database=cloud_flow_db','--connect-timeout=10','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','--local-infile=0','--binary-mode')
$Services = @(
    @{ Name='gateway'; Port=9000; HealthPort=9100; Module='cloudflow-gateway'; MainClass='com.cloudflow.gateway.GatewayApplication' },
    @{ Name='auth'; Port=9001; HealthPort=9101; Module='cloudflow-auth'; MainClass='com.cloudflow.auth.AuthApplication' },
    @{ Name='workflow'; Port=9002; HealthPort=9102; Module='cloudflow-service-workflow'; MainClass='com.cloudflow.workflow.WorkflowApplication' },
    @{ Name='oa'; Port=9003; HealthPort=9103; Module='cloudflow-service-oa'; MainClass='com.cloudflow.oa.OaApplication' },
    @{ Name='crm'; Port=9004; HealthPort=9104; Module='cloudflow-service-crm'; MainClass='com.cloudflow.crm.CrmApplication' },
    @{ Name='hr'; Port=9005; HealthPort=9105; Module='cloudflow-service-hr'; MainClass='com.cloudflow.hr.HrServiceApplication' }
)

function Save-ApprovedState { $script:State | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $StatePath -Encoding utf8 }

function Invoke-Database([string]$Sql, [string]$Program='mysql.exe', [string[]]$Arguments=$MysqlArguments) {
    $Information = [Diagnostics.ProcessStartInfo]::new((Get-Command $Program -ErrorAction Stop).Source)
    $Information.UseShellExecute=$false; $Information.CreateNoWindow=$true
    $Information.RedirectStandardInput=$true; $Information.RedirectStandardOutput=$true; $Information.RedirectStandardError=$true
    $Information.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
    $Information.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Information.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $Information.Environment['MYSQL_PWD']=$env:DB_PASSWORD
    foreach ($Argument in $Arguments) { $Information.ArgumentList.Add($Argument) }
    $Process=[Diagnostics.Process]::Start($Information)
    $Output=$Process.StandardOutput.ReadToEndAsync(); $Errors=$Process.StandardError.ReadToEndAsync()
    try {
        $WriteFailed=$false
        try {
            if ($Sql) { $Process.StandardInput.Write($Sql) }
            $Process.StandardInput.Close()
        } catch { $WriteFailed=$true }
        if (-not $Process.WaitForExit(900000)) { $Process.Kill(); throw 'Database operation exceeded 900000ms' }
        $ErrorText=$Errors.GetAwaiter().GetResult()
        if ($Process.ExitCode -ne 0) {
            $Code=[regex]::Match($ErrorText,'(?:ERROR|Error) \d+(?: \([A-Z0-9]+\))?(?: at line \d+)?').Value
            throw "Database operation failed: exit=$($Process.ExitCode); code=$Code"
        }
        if ($WriteFailed) { throw 'Database input stream failed before completion' }
        return $Output.GetAwaiter().GetResult().Trim()
    } finally { $Process.Dispose() }
}

function Assert-Scalar([string]$Sql,[string]$Expected,[string]$Label) {
    $Actual=Invoke-Database $Sql
    if ($Actual -cne $Expected) { throw "$Label expected=$Expected actual=$Actual" }
    Write-Output "$Label=$Actual"
}

function Assert-Stopped {
    foreach ($Service in $Services) {
        $Marker=Join-Path $Directory ($Service.Name+'.args')
        $Owned=@(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object {
            $_.CommandLine -and ($_.CommandLine.Contains($Marker) -or ($_.CommandLine.Contains($BackendRoot) -and $_.CommandLine.Contains($Service.MainClass)) -or $_.CommandLine.Contains((Join-Path $BackendRoot $Service.Module)))
        })
        if ($Owned.Count) { throw "Service remains running: $($Service.Name)" }
        foreach ($Port in @($Service.Port,$Service.HealthPort)) {
            if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "Port is occupied: $Port" }
        }
    }
}

function Stop-ApprovedServices {
    foreach ($Service in $Services) {
        $Marker=Join-Path $Directory ($Service.Name+'.args')
        $Owned=@(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object {
            $_.CommandLine -and ($_.CommandLine.Contains($Marker) -or ($_.CommandLine.Contains($BackendRoot) -and $_.CommandLine.Contains($Service.MainClass)) -or $_.CommandLine.Contains((Join-Path $BackendRoot $Service.Module)))
        })
        foreach ($Process in @($Owned | Sort-Object @{Expression={$_.CommandLine.Contains('plexus.classworlds')}})) {
            $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.ProcessId)"
            if (-not $Current) { continue }
            if ($Current.CreationDate -ne $Process.CreationDate -or $Current.CommandLine -cne $Process.CommandLine) { throw 'Process identity changed; refusing to stop it' }
            try { Stop-Process -Id $Current.ProcessId -Force }
            catch { if (Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue) { throw } }
            Wait-Process -Id $Current.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
            Write-Output "STOPPED service=$($Service.Name); process=$($Current.ProcessId)"
        }
    }
    Assert-Stopped
}

function Get-Checksums([string]$Database,[string[]]$Tables) {
    if ($Database -ne $DatabaseName -and $Database -notmatch '^cf_approved_restore_[a-f0-9]{32}$') { throw 'Unsafe checksum target' }
    $Names=@($Tables | ForEach-Object {
        if ($_ -notmatch '^[a-z][a-z0-9_]*$') { throw 'Unsafe table identifier' }
        '`'+$Database+'`.`'+$_+'`'
    })
    $Result=Invoke-Database ('CHECKSUM TABLE '+($Names -join ',')+' EXTENDED;')
    if ($Result -match '\tNULL(?:\r?\n|$)') { throw 'Table checksum unavailable' }
    return $Result.Replace($Database+'.',$DatabaseName+'.')
}

function Assert-Backup {
    if ($script:State.target -ne '192.168.1.173:3306/cloud_flow_db' -or -not $script:State.userAuthorizedRebuild) { throw 'Deployment target or authorization changed' }
    $BackupPath=[IO.Path]::GetFullPath($script:State.backup.file)
    if (-not $BackupPath.StartsWith($PrivateDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Backup path is outside the private workspace' }
    if ((Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -cne $script:State.backup.sha256) { throw 'Backup digest mismatch' }
    if (-not $script:State.backup.restoreVerified -and -not ($script:State.backup.archiveVerified -and $script:State.backup.matchingLogicalTables -eq $script:State.backup.tables.Count -and $script:State.backup.originalDdlPreserved)) { throw 'Backup data recovery was not verified' }
}

function Reset-ApprovedRedis {
    if ($env:REDIS_HOST -ne '192.168.1.173' -or [int]$env:REDIS_PORT -ne 6379 -or ($env:REDIS_DB -and $env:REDIS_DB -ne '0')) { throw 'Redis target mismatch' }
    $Executable=Join-Path $Root '.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-cli.exe'
    $Previous=$env:REDISCLI_AUTH
    try {
        $env:REDISCLI_AUTH=$env:REDIS_PASSWORD
        if ($RedisDatabase -ne 0) {
            $Size=& $Executable -h 192.168.1.173 -p 6379 -n $RedisDatabase --raw DBSIZE
            if ($LASTEXITCODE -ne 0 -or "$Size" -ne '0') { throw 'The isolated deployment Redis database must be empty' }
            $script:State.redis=@{database=$RedisDatabase;before=0;after=0;command='DBSIZE';sharedDatabaseZeroPreserved=$true;completedAt=(Get-Date).ToString('o')}
            Write-Output "REDIS_DB=$RedisDatabase; EMPTY=true; SHARED_DB_0_PRESERVED=true; FLUSH_USED=false"
            return
        }
        $Before=& $Executable -h 192.168.1.173 -p 6379 -n 0 --raw DBSIZE
        if ($LASTEXITCODE -ne 0 -or "$Before" -notmatch '^\d+$') { throw 'Redis preflight failed' }
        $Result=& $Executable -h 192.168.1.173 -p 6379 -n 0 --raw FLUSHDB SYNC
        if ($LASTEXITCODE -ne 0 -or $Result -ne 'OK') { throw 'Redis reset failed' }
        $After=& $Executable -h 192.168.1.173 -p 6379 -n 0 --raw DBSIZE
        if ($LASTEXITCODE -ne 0 -or "$After" -ne '0') { throw 'Redis is not empty while services are stopped' }
        $script:State.redis=@{database=0;before=[long]$Before;after=0;command='FLUSHDB SYNC';completedAt=(Get-Date).ToString('o')}
        Write-Output "REDIS_DB=0; BEFORE=$Before; AFTER=$After; FLUSHALL_USED=false; OLD_EVENT_STREAMS_REMOVED=true"
    } finally { $env:REDISCLI_AUTH=$Previous }
}

if ($Phase -eq 'Status') { Get-Content -LiteralPath $StatePath -Encoding utf8; exit 0 }
$Rehearsal=Get-Content -LiteralPath (Join-Path $Directory 'rehearsal-result.json') -Raw | ConvertFrom-Json -AsHashtable
if ($Phase -ne 'VerifyArchive' -and (-not $Rehearsal.passed -or $Rehearsal.tableCount -ne $ExpectedTableCount -or $Rehearsal.mode -ne 'APPROVED_01_07_HG_APPLIED_RUNTIME_UNCHANGED' -or $Rehearsal.hGMenuCount -ne $ExpectedHGMenuCount -or $Rehearsal.employeeGrantCount -ne $ExpectedEmployeeGrantCount)) { throw 'Approved rehearsal is required' }
foreach ($Source in $Rehearsal.sources) {
    if ($Phase -ne 'VerifyArchive' -and (Get-FileHash -LiteralPath (Join-Path $BackendRoot ('DB/'+$Source.filename)) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Source.sha256) { throw 'Official SQL changed after rehearsal' }
}
$MavenExitFiles=@(
    (Join-Path $Directory 'maven-install.exit.log'),
    (Join-Path $Root '.cloudflow-runtime/full-prd-20260915/delivery-selfcheck/01-maven-install.exit.log'),
    (Join-Path $Root '.cloudflow-runtime/batch-h-delivery-selfcheck-20260915/01-maven-install.exit.log'),
    (Join-Path $Root '.cloudflow-runtime/batch-h-delivery-selfcheck-20260915/01-maven-install-final.exit.log')
) | Where-Object { Test-Path -LiteralPath $_ }
if (-not (@($MavenExitFiles | Where-Object { (Get-Content -LiteralPath $_ -Raw).Trim() -in @('MAVEN_INSTALL_EXIT_CODE=0','MAVEN_INSTALL_EXIT=0','EXIT_CODE=0') }).Count)) { throw 'Successful Maven install is required' }
foreach ($Service in $Services) {
    if (-not (Test-Path -LiteralPath (Join-Path $BackendRoot ($Service.Module+'/target/approved-runtime-classpath.txt')))) { throw 'Runtime dependency classpath is missing' }
    if (-not (Test-Path -LiteralPath (Join-Path $BackendRoot ($Service.Module+'/target/classes/'+$Service.MainClass.Replace('.','/')+'.class')))) { throw 'Configured application entrypoint is not compiled' }
}

if ($Phase -eq 'Backup') {
    if (Test-Path -LiteralPath $StatePath) {
        $PreviousState=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json -AsHashtable
        if ($PreviousState.status -notin @('STOPPING','STOPPED') -or $PreviousState.backup.restoreVerified -or $PreviousState.target -ne '192.168.1.173:3306/cloud_flow_db' -or -not $PreviousState.userAuthorizedRebuild) { throw 'Existing deployment cannot safely resume backup preparation' }
        Write-Output "RESUMING_BACKUP_PREPARATION=$($PreviousState.status); VERIFIED_BACKUP=false"
    }
    [IO.Directory]::CreateDirectory($PrivateDirectory) | Out-Null
    $Access=Get-Acl -LiteralPath $PrivateDirectory
    $Access.SetAccessRuleProtection($true,$false)
    foreach ($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $PrivateDirectory -AclObject $Access
    $script:State=@{status='STOPPING';target='192.168.1.173:3306/cloud_flow_db';userAuthorizedRebuild=$true;approvedOnly=$true;sources=$Rehearsal.sources;services=$Services;startedAt=(Get-Date).ToString('o')}
    Save-ApprovedState
    Stop-ApprovedServices
    $script:State.status='STOPPED'; Save-ApprovedState
    $Tables=@((Invoke-Database "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name;") -split '\r?\n')
    if ($Tables.Count -ne $ExpectedBackupTableCount) { throw "Runtime table count changed; expected the verified $ExpectedBackupTableCount-table pre-deployment baseline" }
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.events WHERE event_schema=DATABASE() AND status='ENABLED';" '0' 'ENABLED_DATABASE_EVENTS'
    $Checksums=Get-Checksums $DatabaseName $Tables
    $Backup=Join-Path $PrivateDirectory ('before-approved-C-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.sql')
    $DumpArguments=@('--no-defaults','--host=192.168.1.173','--port=3306','--protocol=TCP',"--user=$env:DB_USERNAME",'--single-transaction','--routines','--events','--triggers','--hex-blob','--column-statistics=0','--set-gtid-purged=OFF','--default-character-set=utf8mb4',"--result-file=$Backup",$DatabaseName)
    Invoke-Database '' 'mysqldump.exe' $DumpArguments | Out-Null
    $Dump=[IO.File]::ReadAllText($Backup)
    if ((Get-Item -LiteralPath $Backup).Length -lt 1000000 -or [regex]::Matches($Dump,'(?m)^CREATE TABLE ').Count -ne $ExpectedBackupTableCount -or $Dump -notmatch 'Dump completed on') { throw 'Backup completeness check failed' }
    if ($Dump -match '(?m)^(?:USE |CREATE DATABASE )' -or $Dump -match '`cloud_flow_db`\.') { throw 'Backup contains an explicit database target; refusing isolated restore' }
    $script:State.backup=@{file=$Backup;bytes=(Get-Item -LiteralPath $Backup).Length;sha256=(Get-FileHash -LiteralPath $Backup -Algorithm SHA256).Hash;tables=$Tables;checksums=$Checksums;restoreVerified=$false}
    Save-ApprovedState
    $Temporary='cf_approved_restore_'+[Guid]::NewGuid().ToString('N')
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Temporary';" '0' 'BACKUP_RESTORE_TARGET_ABSENT'
    $Created=$false
    try {
        Invoke-Database ('CREATE DATABASE `'+$Temporary+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;') | Out-Null
        $Created=$true
        Invoke-Database ('USE `'+$Temporary+'`;'+"`n"+$Dump) | Out-Null
        $Restored=Get-Checksums $Temporary $Tables
        if ($Restored -cne $Checksums) { throw 'Restored table checksums do not match the stopped runtime' }
        if ((Get-Checksums $DatabaseName $Tables) -cne $Checksums) { throw 'Runtime changed during backup verification' }
        $script:State.backup.restoreVerified=$true
        Write-Output "BACKUP_VERIFIED: tables=$ExpectedBackupTableCount; matching_restored_table_checksums=$ExpectedBackupTableCount; bytes=$($script:State.backup.bytes); sha256=$($script:State.backup.sha256)"
    } finally {
        if ($Created) {
            if ($Temporary -notmatch '^cf_approved_restore_[a-f0-9]{32}$' -or $Temporary -eq $DatabaseName) { throw 'Unsafe restore-test cleanup target' }
            Invoke-Database ('DROP DATABASE `'+$Temporary+'`;') | Out-Null
            Assert-Scalar "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Temporary';" '0' 'BACKUP_RESTORE_DATABASES_REMAINING'
        }
        Save-ApprovedState
    }
    $script:State.status='BACKUP_READY'; Save-ApprovedState
    exit 0
}

$script:State=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json -AsHashtable
if ($Phase -eq 'VerifyArchive') {
    Assert-Stopped
    if ($script:State.status -ne 'STOPPED' -or $script:State.backup.restoreVerified -or $script:State.target -ne '192.168.1.173:3306/cloud_flow_db') { throw 'Stopped runtime with a failed ordinary restore is required' }
    $BackupPath=[IO.Path]::GetFullPath($script:State.backup.file)
    if (-not $BackupPath.StartsWith($PrivateDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -cne $script:State.backup.sha256) { throw 'Original backup ownership or checksum failed' }
    if ((Get-Checksums $DatabaseName $script:State.backup.tables) -cne $script:State.backup.checksums) { throw 'Runtime changed after backup' }
    & node (Join-Path $PSScriptRoot 'check-runtime-backup-constraints.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Existing duplicate constraint inspection failed' }
    $Inspection=Get-Content -LiteralPath (Join-Path $Directory 'backup-constraint-audit.json') -Raw | ConvertFrom-Json -AsHashtable
    $OriginalSchema=$Inspection.anomalies.Count -eq 0
    $Archive=[IO.File]::ReadAllText($BackupPath)
    foreach ($Anomaly in $Inspection.anomalies) {
        if ($Anomaly.table -notmatch '^[a-z][a-z0-9_]*$' -or $Anomaly.index -notmatch '^[a-z][a-z0-9_]*$' -or $Anomaly.groups -le 0) { throw 'Invalid recovery archive constraint manifest' }
        $Pattern='(?ms)^CREATE TABLE `'+[regex]::Escape($Anomaly.table)+'` \(.*?^\) ENGINE=.*?;'
        $Definition=[regex]::Match($Archive,$Pattern)
        if (-not $Definition.Success) { throw 'Original table DDL is absent from the backup' }
        $IndexPattern='(?m)^  UNIQUE KEY `'+[regex]::Escape($Anomaly.index)+'`[^\r\n]*\r?\n'
        if ([regex]::Matches($Definition.Value,$IndexPattern).Count -ne 1) { throw 'Original unique index is not unambiguous' }
        $ArchiveDefinition=[regex]::Replace($Definition.Value,$IndexPattern,'')
        $ArchiveDefinition=[regex]::Replace($ArchiveDefinition,',\r?\n\) ENGINE',"`n) ENGINE")
        $Archive=$Archive.Substring(0,$Definition.Index)+$ArchiveDefinition+$Archive.Substring($Definition.Index+$Definition.Length)
    }
    if (-not $OriginalSchema) { $Archive=[regex]::Replace($Archive,'(?m)^(  `[^`]+`) json(?=\s)','$1 longtext COLLATE utf8mb4_bin') }
    $ReuseRecovery=$false
    $Temporary=$script:State.backup.recoveryDatabase
    if ($OriginalSchema -and $Temporary -match '^cf_approved_restore_[a-f0-9]{32}$' -and $script:State.backup.recoverySourceSha256 -ceq $script:State.backup.sha256 -and $script:State.backup.recoveryFormat -eq 'ORIGINAL_SCHEMA_V1') {
        $ReuseRecovery=(Invoke-Database "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Temporary';") -eq '1'
    }
    if (-not $ReuseRecovery) {
        $Temporary='cf_approved_restore_'+[Guid]::NewGuid().ToString('N')
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Temporary';" '0' 'RECOVERY_ARCHIVE_TARGET_ABSENT'
    }
    $Created=$false
    try {
        if (-not $ReuseRecovery) { Invoke-Database ('CREATE DATABASE `'+$Temporary+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;') | Out-Null }
        $Created=$true
        $script:State.backup.recoveryDatabase=$Temporary
        $script:State.backup.recoverySourceSha256=$script:State.backup.sha256
        $script:State.backup.recoveryFormat=if ($OriginalSchema) { 'ORIGINAL_SCHEMA_V1' } else { 'JSON_TEXT_V1' }
        $script:State.backup.existingUniqueConflicts=$Inspection.anomalies
        Save-ApprovedState
        if (-not $ReuseRecovery) { Invoke-Database ('USE `'+$Temporary+'`;'+"`n"+$Archive) | Out-Null }
        $PhysicalChecksums=Get-Checksums $Temporary $script:State.backup.tables
        $MismatchCount=@(Compare-Object ($script:State.backup.checksums -split '\r?\n') ($PhysicalChecksums -split '\r?\n') | Where-Object SideIndicator -EQ '<=').Count
        Write-Output "PHYSICAL_CHECKSUM_DIFFERENT_TABLES=$MismatchCount; VERIFYING_EVERY_LOGICAL_ROW=true"
        $env:CLOUDFLOW_RESTORED_DATABASE=$Temporary
        try {
            & node (Join-Path $PSScriptRoot 'check-backup-restored-rows.mjs')
            if ($LASTEXITCODE -ne 0) { throw 'Recovery archive logical row verification failed' }
        } finally { $env:CLOUDFLOW_RESTORED_DATABASE=$null }
        if ((Get-Checksums $DatabaseName $script:State.backup.tables) -cne $script:State.backup.checksums) { throw 'Original runtime changed during archive verification' }
        if ((Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -cne $script:State.backup.sha256) { throw 'Original backup changed' }
        $script:State.backup.archiveVerified=$true
        $BackupTableCount=$script:State.backup.tables.Count
        $script:State.backup.matchingTableChecksums=$BackupTableCount-$MismatchCount
        $script:State.backup.matchingLogicalTables=$BackupTableCount
        $script:State.backup.originalDdlPreserved=$true
        $script:State.backup.restoreMode='EXACT_ROW_AND_JSON_TEXT_ARCHIVE_WITH_ORIGINAL_DDL_PRESERVED'
        if ($OriginalSchema) { $script:State.backup.restoreMode='ORIGINAL_SCHEMA_AND_EXACT_LOGICAL_ROWS' }
        $script:State.backup.existingUniqueConflicts=$Inspection.anomalies
        $script:State.status='BACKUP_READY'
        Write-Output "RECOVERY_ARCHIVE_VERIFIED: tables=$BackupTableCount; matching_logical_tables=$BackupTableCount; source_rows_removed=0; archive_only_unique_indexes_omitted=$($Inspection.anomalies.Count); original_dump_unchanged=true"
        Write-Output "ORIGINAL_SCHEMA_RESTORE=$OriginalSchema; ORIGINAL_DDL_PRESERVED=true; RUNTIME_WRITES=0"
    } finally {
        if ($Created -and $script:State.backup.archiveVerified) {
            if ($Temporary -notmatch '^cf_approved_restore_[a-f0-9]{32}$' -or $Temporary -eq $DatabaseName) { throw 'Unsafe recovery archive cleanup target' }
            Invoke-Database ('DROP DATABASE `'+$Temporary+'`;') | Out-Null
            Assert-Scalar "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Temporary';" '0' 'RECOVERY_ARCHIVE_DATABASES_REMAINING'
        }
        if ($Created -and -not $script:State.backup.archiveVerified) { Write-Output "OWNED_RECOVERY_DATABASE_RETAINED=$Temporary; ORIGINAL_RUNTIME_UNCHANGED=true" }
        Save-ApprovedState
    }
    exit 0
}
Assert-Backup
if ($Phase -eq 'Restore') {
    if (-not $script:State.backup.restoreVerified) { throw 'Existing duplicate constraints require reconciliation before original-schema restoration; use the verified data archive without overwriting the runtime' }
    if ($script:State.status -notin @('IMPORT_FAILED','START_FAILED','INITIALIZED')) { throw 'Explicit failed-deployment recovery state is required' }
    Stop-ApprovedServices
    Invoke-Database ([IO.File]::ReadAllText($script:State.backup.file)) | Out-Null
    if ((Get-Checksums $DatabaseName $script:State.backup.tables) -cne $script:State.backup.checksums) { throw 'Runtime restore checksum mismatch' }
    Reset-ApprovedRedis
    $script:State.status='RESTORED_SERVICES_STOPPED'; Save-ApprovedState
    Write-Output "RUNTIME_DATABASE_RESTORED=$($script:State.backup.tables.Count)_MATCHING_TABLES; SERVICES_REMAIN_STOPPED=true"
    exit 0
}
if ($Phase -eq 'Rebuild') {
    Assert-Stopped
    if ($script:State.status -ne 'BACKUP_READY') { throw 'Verified backup state is required' }
    if ((Get-Checksums $DatabaseName $script:State.backup.tables) -cne $script:State.backup.checksums) { throw 'Runtime changed after verified backup' }
    Assert-Scalar "SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (1400,1401) AND ((menu_id=1400 AND menu_name='表单版本历史' AND perms='workflow:form:history') OR (menu_id=1401 AND menu_name='表单版本回滚' AND perms='workflow:form:rollback'));" '2' 'C_IMPORTED_MENU_BASELINE'
    Assert-Scalar 'SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1400 AND 1449;' '2' 'C_PREIMPORT_MENU_COUNT'
    $script:State.status='IMPORTING'; $script:State.sources=$Rehearsal.sources; $script:State.imports=@(); Save-ApprovedState
    try {
        foreach ($Source in $Rehearsal.sources) {
            Write-Output "IMPORT_BEGIN=$($Source.filename)"
            Invoke-Database ([IO.File]::ReadAllText((Join-Path $BackendRoot ('DB/'+$Source.filename)))) | Out-Null
            $script:State.imports+=@{file=$Source.filename;sha256=$Source.sha256;passed=$true;completedAt=(Get-Date).ToString('o')}
            Save-ApprovedState
            Write-Output "IMPORT_PASS=$($Source.filename); MYSQL_EXIT=0"
        }
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE';" "$ExpectedTableCount" 'RUNTIME_TABLES'
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='wf_form_definition' AND column_name='id' AND column_key='PRI';" '1' 'C_VERSION_PRIMARY_KEY'
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='wf_process_instance' AND column_name='form_version';" '1' 'C_INSTANCE_VERSION_COLUMN'
        Assert-Scalar 'SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND tenant_id=100000;' "$ExpectedEmployeeGrantCount" 'EMPLOYEE_GRANTS'
        Assert-Scalar 'SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1400 AND 1449;' '0' 'EMPLOYEE_C_GRANTS'
        Assert-Scalar "SELECT COUNT(*) FROM sys_role_menu grants LEFT JOIN sys_role roles ON roles.role_id=grants.role_id AND roles.tenant_id=grants.tenant_id WHERE grants.menu_id BETWEEN 1400 AND 1449 AND (roles.role_key IS NULL OR roles.role_key<>'admin' OR roles.status<>'0' OR roles.deleted<>0);" '0' 'NON_ADMIN_C_GRANTS'
        Assert-Scalar 'SELECT COUNT(*) FROM sys_role_menu WHERE menu_id IN (1400,1401);' '100' 'ADMIN_C_GRANTS'
        Assert-Scalar 'SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1780 AND 1799 OR menu_id BETWEEN 1850 AND 2099;' "$ExpectedHGMenuCount" 'H_G_MENUS'
        Reset-ApprovedRedis
        $script:State.status='INITIALIZED'; Save-ApprovedState
        Write-Output "APPROVED_DATABASE_REBUILD=PASS; H_G_DESIGN_MENUS_APPLIED=$ExpectedHGMenuCount; EMPLOYEE_GRANTS=$ExpectedEmployeeGrantCount; EXTERNAL_DEPENDENCIES=DEFERRED"
    } catch {
        $script:State.status='IMPORT_FAILED'; Save-ApprovedState
        throw
    }
    exit 0
}

if ($Phase -eq 'Start') {
    if ($script:State.status -eq 'START_FAILED') { Stop-ApprovedServices }
    Assert-Stopped
    if ($script:State.status -notin @('INITIALIZED','START_FAILED')) { throw 'Approved database initialization is required' }
    $script:State.processes=@(); $script:State.status='STARTING'; Save-ApprovedState
    try {
        foreach ($Service in $Services) {
            $Module=Join-Path $BackendRoot $Service.Module
            $Dependencies=(Get-Content -LiteralPath (Join-Path $Module 'target/approved-runtime-classpath.txt') -Raw).Trim()
            $Classpath=(Join-Path $Module 'target/classes')+';'+$Dependencies
            $ArgumentFile=Join-Path $Directory ($Service.Name+'.args')
            $RuntimeArguments=@('-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',('"'+$Classpath.Replace('\','/')+'"'),$Service.MainClass)
            if ($RuntimeArguments.Count -ne 6) { throw 'JVM argument boundaries are invalid' }
            [IO.File]::WriteAllLines($ArgumentFile,$RuntimeArguments,[Text.UTF8Encoding]::new($false))
            $Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
            $Process=Start-Process -FilePath (Join-Path $env:JAVA_HOME 'bin/java.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Module -ArgumentList ('"@'+$ArgumentFile+'"') -RedirectStandardOutput (Join-Path $Directory ($Service.Name+'-'+$Stamp+'.out.log')) -RedirectStandardError (Join-Path $Directory ($Service.Name+'-'+$Stamp+'.err.log'))
            $script:State.processes+=@{name=$Service.Name;id=$Process.Id;marker=$ArgumentFile}
            Save-ApprovedState
            Write-Output "STARTED service=$($Service.Name); process=$($Process.Id)"
        }
        $Deadline=(Get-Date).AddMinutes(8); $Remaining=@($Services); $Healthy=@()
        while ($Remaining.Count -and (Get-Date) -lt $Deadline) {
            foreach ($Owned in $script:State.processes) {
                if (-not (Get-Process -Id $Owned.id -ErrorAction SilentlyContinue)) { throw "Owned application exited before readiness: $($Owned.name)" }
            }
            $Pending=@()
            foreach ($Service in $Remaining) {
                try {
                    $Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.HealthPort)/actuator/health" -TimeoutSec 3
                    if ($Health.status -ne 'UP') { throw 'Not healthy' }
                    $Healthy+=@{name=$Service.Name;port=$Service.Port;healthPort=$Service.HealthPort;status='UP'}
                    Write-Output "SERVICE_HEALTH $($Service.Name)=UP"
                } catch { $Pending+=$Service }
            }
            $Remaining=$Pending
            if ($Remaining.Count) { Start-Sleep -Seconds 3 }
        }
        if ($Remaining.Count) { throw 'Approved service health check failed' }
        $script:State.health=@{passed=$true;services=$Healthy;checkedAt=(Get-Date).ToString('o')}
        $script:State.status='RUNNING'; Save-ApprovedState
        Write-Output 'APPROVED_RUNTIME_SERVICES=6; HEALTHY=6; STATUS=RUNNING'
    } catch {
        $script:State.status='START_FAILED'; Save-ApprovedState
        throw
    }
}
