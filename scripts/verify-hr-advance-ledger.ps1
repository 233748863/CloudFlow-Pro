$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root).TrimEnd('\') -ieq $env:SystemDrive) { throw 'Verification must not write to the system drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Module = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Run = Join-Path $Root ('.cloudflow-runtime/hr-advance-ledger/' + [guid]::NewGuid().ToString('N'))
$Data = Join-Path $Run 'data'
$Classes = Join-Path $Run 'classes'
[IO.Directory]::CreateDirectory($Classes) | Out-Null
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
function JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}
$Sources = @(
    'src/main/java/com/cloudflow/hr/service/HrAdvanceAmounts.java',
    'src/main/java/com/cloudflow/hr/service/HrAdvanceDraftRules.java',
    'src/main/java/com/cloudflow/hr/service/HrAdvanceLedgerService.java',
    'src/main/java/com/cloudflow/hr/service/HrAdvancePayrollPolicy.java',
    'src/main/java/com/cloudflow/hr/service/HrAdvancePayrollService.java',
    'src/main/java/com/cloudflow/hr/domain/dto/HrAdvanceRequests.java',
    'src/main/java/com/cloudflow/hr/domain/entity/HrEmployeeAdvance.java',
    'src/main/java/com/cloudflow/hr/domain/entity/HrAdvanceRepayment.java',
    'src/main/java/com/cloudflow/hr/mapper/HrEmployeeAdvanceMapper.java',
    'src/main/java/com/cloudflow/hr/mapper/HrAdvanceRepaymentMapper.java'
) | ForEach-Object { JavaArgument (Join-Path $Module $_) }
$Sources += JavaArgument (Join-Path $Root 'scripts/hr-checks/HrAdvanceLedgerChecks.java')
$Compile = Join-Path $Run 'compile.args'
[IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',(JavaArgument $ClassPath),'-d',(JavaArgument $Classes)) + $Sources, [Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if ($LASTEXITCODE -ne 0) { throw 'Advance ledger compilation failed' }
$Server = (Get-Command mysqld.exe -ErrorAction Stop).Source
$Bin = Split-Path -Parent $Server
$Client = Join-Path $Bin 'mysql.exe'
$Admin = Join-Path $Bin 'mysqladmin.exe'
$Base = Split-Path -Parent $Bin
$ErrorLog = Join-Path $Run 'mysql-error.log'
$Initialize = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -Wait -ArgumentList @(
    '--no-defaults','--initialize-insecure',"--basedir=`"$Base`"","--datadir=`"$Data`"","--log-error=`"$ErrorLog`"",'--innodb-buffer-pool-size=64M'
)
if ($Initialize.ExitCode -ne 0) { throw "Owned MySQL initialization failed: $ErrorLog" }
$Reservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Reservation.Start()
$Port = ([Net.IPEndPoint]$Reservation.LocalEndpoint).Port
$Reservation.Stop()
$ClientArguments = @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--skip-password','--default-character-set=utf8mb4','--batch','--raw','--skip-column-names','--connect-timeout=2')
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
$Database = $null
$Succeeded = $false
try {
    $Database = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -ArgumentList @(
        '--no-defaults',"--basedir=`"$Base`"","--datadir=`"$Data`"","--port=$Port",'--bind-address=127.0.0.1','--mysqlx=OFF','--skip-log-bin',
        '--innodb-buffer-pool-size=64M','--max-connections=20',"--log-error=`"$ErrorLog`"","--pid-file=`"$(Join-Path $Run 'mysql.pid')`""
    )
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 45; $Attempt++) {
        $ActualData = & $Client @ClientArguments '--execute=SELECT @@datadir;' 2>$null
        if ($LASTEXITCODE -eq 0 -and $ActualData) {
            if ([IO.Path]::GetFullPath($ActualData.Trim()).TrimEnd('\','/') -ne [IO.Path]::GetFullPath($Data).TrimEnd('\','/')) { throw 'Database data directory mismatch' }
            $Ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $Ready) { throw 'Owned MySQL did not become ready' }
    $Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port)
    if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Verification database must be loopback-only' }
    $Owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
    if ($Owner.Name -ne 'mysqld.exe' -or -not $Owner.CommandLine.Contains($Data)) { throw 'Database process ownership mismatch' }
    $Formal = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql'))
    $Statements = @('CREATE DATABASE cloud_flow_db DEFAULT CHARACTER SET utf8mb4; USE cloud_flow_db;')
    foreach ($Table in @('hr_employee','hr_salary_slip','hr_audit_log','hr_employee_advance','hr_advance_repayment','hr_payroll_correction')) {
        $Create = [regex]::Match($Formal, "(?ms)^CREATE TABLE $Table \(.*?^\) ENGINE=[^\r\n]*;").Value
        if (-not $Create) { throw "Complete approved table definition missing: $Table" }
        $Statements += $Create
    }
    $Schema = $Statements -join "`n"
    [IO.File]::WriteAllText((Join-Path $Run 'approved-schema.sql'), $Schema, [Text.UTF8Encoding]::new($false))
    $Schema | & $Client @ClientArguments
    if ($LASTEXITCODE -ne 0) { throw 'Approved ledger schemas could not be created' }
    Write-Output "H2_ADVANCE_LEDGER_OWNED_MYSQL: port=$Port; tables=6; formal_schema=true; loopback=true; data_directory=$Data; production_modified=false"
    $RunArguments = Join-Path $Run 'run.args'
    [IO.File]::WriteAllLines($RunArguments, @(
        '-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai','-cp',(JavaArgument ($Classes + [IO.Path]::PathSeparator + $ClassPath)),
        'com.cloudflow.hr.checks.HrAdvanceLedgerChecks',
        (JavaArgument "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"),
        (JavaArgument $Data),(JavaArgument $Module)
    ), [Text.UTF8Encoding]::new($false))
    & java "@$RunArguments" 2>&1 | Tee-Object -FilePath (Join-Path $Run 'console.log')
    if ($LASTEXITCODE -ne 0) { throw 'Advance ledger database checks failed; evidence retained' }
    $Succeeded = $true
} finally {
    $Owned = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Data) })
    if ($Owned.Count -gt 0) {
        & $Admin '--no-defaults' '--protocol=TCP' '--host=127.0.0.1' "--port=$Port" '--user=root' '--skip-password' 'shutdown' *> $null
        foreach ($Process in $Owned) {
            Wait-Process -Id $Process.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
            $Remaining = Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.ProcessId)" -ErrorAction SilentlyContinue
            if ($Remaining -and $Remaining.Name -eq 'mysqld.exe' -and $Remaining.CommandLine.Contains($Data)) {
                Stop-Process -Id $Remaining.ProcessId -Force
                Wait-Process -Id $Remaining.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
            }
        }
    }
    $Remaining = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Data) })
    if ($Remaining.Count -gt 0) { throw 'Owned MySQL is still running; data files retained' }
    if ($Succeeded -and (Test-Path -LiteralPath $Data -PathType Container)) {
        $ResolvedData = (Resolve-Path -LiteralPath $Data).ProviderPath
        $ResolvedRun = (Resolve-Path -LiteralPath $Run).ProviderPath
        if (-not $ResolvedRun.StartsWith((Join-Path $Root '.cloudflow-runtime/hr-advance-ledger') + '\', [StringComparison]::OrdinalIgnoreCase) -or
            -not $ResolvedData.StartsWith($ResolvedRun + '\', [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($ResolvedData) -ne 'data') { throw 'Unsafe cleanup path' }
        Remove-Item -LiteralPath $ResolvedData -Recurse
    }
    Write-Output "H2_ADVANCE_LEDGER_CLEANUP: owned_processes_running=$($Remaining.Count); success=$Succeeded; evidence=$Run"
}
