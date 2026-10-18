param([Parameter(Mandatory = $true)][string]$StatePath, [ValidateSet('ImCallback','All')][string]$Scenario = 'ImCallback')

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running isolated environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned database marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Database ownership mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
$Mysql = (Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database data directory mismatch' }
}
Confirm-OwnedData
$Database = 'g4_im_workflow_' + [Guid]::NewGuid().ToString('N')
if ($Database -notmatch '^g4_im_workflow_[a-f0-9]{32}$' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Database';") -ne '0') { throw 'Scratch schema must not exist' }
$Scripts = @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File | Where-Object Name -Match '^0[1-6]\.' | Sort-Object Name)
$Inputs = @($Scripts.FullName) + @('scripts/workflow-checks/WorkflowAgentDatabaseChecks.java','scripts/workflow-checks/WorkflowDatabaseTaskFixture.java','scripts/workflow-checks/WorkflowImCompletionChecks.java','scripts/workflow-checks/WorkflowImCallbackDatabaseChecks.java','scripts/workflow-checks/WorkflowImTodoDatabaseChecks.java') | ForEach-Object { if ([IO.Path]::IsPathRooted($_)) { $_ } else { Join-Path $Root $_ } }
$Hashes = @($Inputs | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } })
$OriginalCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
try {
    foreach ($Script in $Scripts) {
        if ($Script.Name.StartsWith('06.')) {
            $Conflicts = Invoke-OwnedSql "SELECT menu_id,menu_name,perms FROM $Database.sys_menu WHERE menu_id BETWEEN 1780 AND 1799;"
            if ($Conflicts) { throw 'G4 reserved menu range conflict before scratch seed' }
            Write-Output 'G4_IM_WORKFLOW_EMPTY_DB_PREINSERT: range=1780-1799; rows=0'
        }
        $Sql = [regex]::Replace([IO.File]::ReadAllText($Script.FullName), '\bcloud_flow_db\b', $Database)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE $Database;`n" + $Sql }
        Invoke-OwnedSql $Sql | Out-Null
        Write-Output "G4_IM_WORKFLOW_EMPTY_DB_SCRIPT: file=$($Script.Name); exit=0"
    }
    $Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE';"
    if ($Count -ne '366') { throw "Expected 366 scratch tables, found $Count" }
    Write-Output "G4_IM_WORKFLOW_EMPTY_DATABASE: scripts=01-06; expected=366; actual=$Count; runtime_tables=$OriginalCount; runtime_unchanged=true"
    $Workflow = Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow'
    $Entries = @((Join-Path $Workflow 'target/classes')) + (Get-Content -LiteralPath (Join-Path $Workflow 'target/batch-h-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach ($Entry in $Entries) {
        if (-not (Test-Path -LiteralPath $Entry) -or [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne [IO.Path]::GetPathRoot($Root)) { throw 'Installed data-drive workflow dependencies required' }
    }
    $Classpath = $Entries -join [IO.Path]::PathSeparator
    $Output = Join-Path $Root 'cloudflow-backend/target/im-workflow-database'
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    $Sources = @('WorkflowAgentDatabaseChecks.java','WorkflowDatabaseTaskFixture.java','WorkflowImCompletionChecks.java','WorkflowImCallbackDatabaseChecks.java','WorkflowImTodoDatabaseChecks.java') | ForEach-Object { Join-Path $Root ('scripts/workflow-checks/' + $_) }
    $Compile = Join-Path $Output 'compile.args'
    [IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\','/') + '"' }), [Text.UTF8Encoding]::new($false))
    & javac "@$Compile"
    if ($LASTEXITCODE -ne 0) { throw 'IM workflow database checks compilation failed' }
    $Logback = Join-Path $Output 'logback.xml'
    [IO.File]::WriteAllText($Logback, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $Url = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/${Database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
    $RunArguments = Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($RunArguments, @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai',('"-Dlogback.configurationFile=' + $Logback.Replace('\','/') + '"'),'-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'WorkflowAgentDatabaseChecks',('"' + $Url + '"'),('"' + $Data.Replace('\','/') + '"'),$Scenario), [Text.UTF8Encoding]::new($false))
    & java "@$RunArguments"
    if ($LASTEXITCODE -ne 0) { throw 'IM workflow database checks failed' }
    $Changed = @($Hashes | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
    if ($Changed.Count -ne 0) { throw 'IM workflow database check inputs changed during validation' }
    Write-Output "G4_IM_WORKFLOW_DATABASE_INPUTS: files=$($Hashes.Count); changed=0"
} finally {
    Confirm-OwnedData
    if ($Database -notmatch '^g4_im_workflow_[a-f0-9]{32}$') { throw 'Scratch cleanup target rejected' }
    Invoke-OwnedSql "DROP DATABASE IF EXISTS $Database;" | Out-Null
    $Remaining = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Database';"
    $AfterCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
    if ($Remaining -ne '0' -or $AfterCount -ne $OriginalCount) { throw 'Scratch cleanup or runtime table count mismatch' }
    Write-Output "G4_IM_WORKFLOW_DATABASE_CLEANUP: owned_schema_remaining=$Remaining; runtime_tables=$AfterCount; shared_redis_flush=false; production_modified=false"
}
