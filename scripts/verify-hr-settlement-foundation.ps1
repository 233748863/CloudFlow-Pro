param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$PayrollCreateClose, [switch]$PayrollGenerationResume, [switch]$PayrollReplay, [switch]$SimulatorConfiguration, [switch]$LoginSessionRead, [switch]$AttendanceMonthBatch, [switch]$AttendanceDailyCalendar, [switch]$LeaveExpiryBoundaries, [switch]$ExitInterview, [switch]$TrainingRecovery, [switch]$SeverancePolicy, [switch]$SalarySource, [switch]$AdvanceSource, [switch]$TrainingSource, [switch]$LeaveSource, [switch]$SalarySampling, [switch]$DraftCollection, [switch]$SourceReservation, [switch]$Reconciliation, [switch]$Funds, [switch]$ReversalLifecycle, [ValidateSet('NETTING', 'PAYMENT', 'RECEIPT')][string]$FundsKind = 'NETTING')

$ErrorActionPreference = 'Stop'
if ($ReversalLifecycle -and -not $Funds) { throw 'Reversal lifecycle requires Funds mode' }
if ((@($PayrollCreateClose, $PayrollGenerationResume, $PayrollReplay, $SimulatorConfiguration, $LoginSessionRead, $AttendanceMonthBatch, $AttendanceDailyCalendar, $LeaveExpiryBoundaries, $ExitInterview, $TrainingRecovery, $SeverancePolicy, $SalarySource, $AdvanceSource, $TrainingSource, $LeaveSource, $SalarySampling, $DraftCollection, $SourceReservation, $Reconciliation, $Funds) | Where-Object { $_ }).Count -gt 1) { throw 'Choose one settlement source verification mode' }
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Builds = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains('org.codehaus.plexus.classworlds.launcher.Launcher') -and $_.CommandLine.Contains($Root)
})
if ($Builds.Count -gt 0) { throw 'Wait for the workspace Maven build to finish before using compiled dependencies' }
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
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw 'Owned settlement database checks failed; raw diagnostics withheld' }
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database data directory mismatch' }
}
Confirm-OwnedData
$Database = 'h2_settlement_foundation_' + [Guid]::NewGuid().ToString('N')
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Database';") -ne '0') { throw 'Scratch schema must not exist' }
$Scripts = @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File | Where-Object Name -Match '^0[1-6]\.' | Sort-Object Name)
$Expected = 0
foreach ($Script in $Scripts) { $Expected += [regex]::Matches([IO.File]::ReadAllText($Script.FullName), '(?m)^CREATE TABLE ').Count }
$CheckClass = if ($PayrollCreateClose) { 'HrPayrollCreateCloseChecks' } elseif ($PayrollGenerationResume) { 'HrPayrollGenerationResumeChecks' } elseif ($PayrollReplay) { 'HrPayrollReplayChecks' } elseif ($SimulatorConfiguration) { 'HrCompensationSimulatorChecks' } elseif ($LoginSessionRead) { 'LoginSessionReadChecks' } elseif ($AttendanceDailyCalendar) { 'HrAttendanceDailyCalendarChecks' } elseif ($AttendanceMonthBatch) { 'HrAttendanceMonthBatchChecks' } elseif ($LeaveExpiryBoundaries) { 'HrLeaveExpiryBoundaryChecks' } elseif ($Reconciliation) { 'HrSettlementReconcileChecks' } elseif ($SourceReservation -or $Funds) { 'HrSettlementReservationChecks' } elseif ($DraftCollection) { 'HrSettlementDraftChecks' } elseif ($SalarySampling) { 'HrSettlementSalarySourceChecks' } elseif ($LeaveSource) { 'HrSettlementLeaveSourceChecks' } elseif ($AdvanceSource) { 'HrSettlementAdvanceSourceChecks' } elseif ($SalarySource) { 'HrPayrollComponentSourceChecks' } elseif ($SeverancePolicy) { 'HrSeveranceRuleChecks' } elseif ($ExitInterview -or $TrainingRecovery -or $TrainingSource) { 'HrExitInterviewChecks' } else { 'HrSettlementFoundationChecks' }
$CheckSource = Join-Path $Root ('scripts/hr-checks/' + $CheckClass + '.java')
$Inputs = @($Scripts.FullName) + @($CheckSource)
if ($Reconciliation) { $Inputs += Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfReconcileAlertMapper.xml' }
$Hashes = @($Inputs | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } })
$OriginalCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
try {
    if ($PayrollCreateClose -or $PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds) {
        $RedisOwner = @($State.processes | Where-Object name -EQ 'redis')
        if ($RedisOwner.Count -ne 1 -or $State.redisPort -le 1024 -or $State.redisPort -ge 65536) { throw 'Owned Redis identity required' }
        $RedisConfigurationPath = [IO.Path]::GetFullPath((Join-Path $Run $RedisOwner[0].marker))
        if ((Split-Path -Parent $RedisConfigurationPath) -ne $Run -or (Get-Item -LiteralPath $RedisConfigurationPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Owned Redis configuration path required' }
        $RedisProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($RedisOwner[0].id)"
        if (-not $RedisProcess -or -not $RedisProcess.CommandLine.Contains($RedisOwner[0].marker)) { throw 'Redis process ownership changed' }
        $RedisConfiguration = [IO.File]::ReadAllText($RedisConfigurationPath)
        if ($RedisConfiguration -notmatch '(?m)^bind 127\.0\.0\.1\r?$' -or $RedisConfiguration -notmatch ('(?m)^port ' + $State.redisPort + '\r?$')) { throw 'Owned loopback Redis required' }
        $RedisSecret = [regex]::Match($RedisConfiguration, '(?m)^requirepass (.+)\r?$')
        if (-not $RedisSecret.Success) { throw 'Owned Redis secret missing' }
        $env:HR_SETTLEMENT_TEST_REDIS_PORT = [string]$State.redisPort
        $env:HR_SETTLEMENT_TEST_REDIS_PASSWORD = $RedisSecret.Groups[1].Value.Trim()
        Write-Output 'H2_SETTLEMENT_RESERVATION_REDIS: owned_loopback=true; shared_flush=false'
    }
    foreach ($Script in $Scripts) {
        $Sql = [regex]::Replace([IO.File]::ReadAllText($Script.FullName), '\bcloud_flow_db\b', $Database)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE $Database;" + [Environment]::NewLine + $Sql }
        Invoke-OwnedSql $Sql | Out-Null
        Write-Output "H2_SETTLEMENT_FOUNDATION_EMPTY_DB_SCRIPT: file=$($Script.Name); exit=0"
    }
    $Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE';"
    if ([int]$Count -ne $Expected) { throw 'Scratch table count differs from formal definition' }
    Write-Output "H2_SETTLEMENT_FOUNDATION_EMPTY_DATABASE: expected=$Expected; actual=$Count; runtime_tables=$OriginalCount"
    $HrModule = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
    $AuthModule = Join-Path $Root 'cloudflow-backend/cloudflow-service-oa'
    $Entries = @((Join-Path $HrModule 'target/classes'), (Join-Path $AuthModule 'target/classes')) +
        (Get-Content -LiteralPath (Join-Path $HrModule 'target/report-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator) +
        (Get-Content -LiteralPath (Join-Path $AuthModule 'target/report-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
    if ($Reconciliation) {
        $WorkflowModule = Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow'
        $Entries += @((Join-Path $WorkflowModule 'target/classes')) + (Get-Content -LiteralPath (Join-Path $WorkflowModule 'target/batch-b-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
    }
    $Entries = @($Entries | Select-Object -Unique)
    foreach ($Entry in $Entries) {
        if (-not (Test-Path -LiteralPath $Entry) -or [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne [IO.Path]::GetPathRoot($Root)) { throw 'Installed data-drive dependencies required' }
    }
    $Classpath = $Entries -join [IO.Path]::PathSeparator
    $Output = Join-Path $Run ('hr-settlement-foundation-checks-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    $Compile = Join-Path $Output 'compile.args'
    [IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'),('"' + $CheckSource.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
    & javac "@$Compile"
    if ($LASTEXITCODE -ne 0) { throw 'Settlement foundation database checks compilation failed' }
    $Logback = Join-Path $Output 'logback.xml'
    [IO.File]::WriteAllText($Logback, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $Url = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/${Database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
    $RunArguments = Join-Path $Output 'run.args'
    $CheckPackage = if ($SourceReservation -or $Funds) { 'com.cloudflow.hr.service.' } else { 'com.cloudflow.hr.checks.' }
    $JavaArguments = @('-Dfile.encoding=UTF-8',('"-Dlogback.configurationFile=' + $Logback.Replace('\','/') + '"'),'-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),($CheckPackage + $CheckClass),('"' + $Url + '"'),('"' + $Data.Replace('\','/') + '"'))
    if ($TrainingRecovery) { $JavaArguments += '--training-recovery' }
    if ($TrainingSource) { $JavaArguments += '--training-source' }
    if ($Funds) { $JavaArguments += $(if ($ReversalLifecycle) { '--reversal-' } else { '--funds-' }) + $FundsKind.ToLowerInvariant() }
    [IO.File]::WriteAllLines($RunArguments, $JavaArguments, [Text.UTF8Encoding]::new($false))
    & java "@$RunArguments"
    if ($LASTEXITCODE -ne 0) { throw 'Settlement foundation database checks failed' }
    if (@($Hashes | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -ne 0) { throw 'Settlement foundation inputs changed during validation' }
    Write-Output "H2_SETTLEMENT_FOUNDATION_DATABASE_INPUTS: files=$($Hashes.Count); changed=0"
} finally {
    if ($PayrollCreateClose -or $PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds) { Remove-Item Env:HR_SETTLEMENT_TEST_REDIS_PORT -ErrorAction SilentlyContinue; Remove-Item Env:HR_SETTLEMENT_TEST_REDIS_PASSWORD -ErrorAction SilentlyContinue }
    Confirm-OwnedData
    if ($Database -notmatch '^h2_settlement_foundation_[a-f0-9]{32}$') { throw 'Scratch cleanup target rejected' }
    Invoke-OwnedSql "DROP DATABASE IF EXISTS $Database;" | Out-Null
    $Remaining = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Database';"
    $AfterCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
    if ($Remaining -ne '0' -or $AfterCount -ne $OriginalCount) { throw 'Scratch cleanup or runtime table count mismatch' }
    Write-Output "H2_SETTLEMENT_FOUNDATION_DATABASE_CLEANUP: owned_schema_remaining=$Remaining; runtime_tables=$AfterCount; shared_redis_flush=false; production_modified=false"
}
