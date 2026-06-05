param(
    [string]$Mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    [string]$DbHost = "192.168.1.173",
    [int]$DbPort = 3306,
    [string]$DbName = "cloud_flow_db",
    [string]$DbUser = "root",
    [string]$DbPassword = $env:MYSQL_PWD,
    [string]$Root = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
    [int[]]$HealthPorts = @(9100, 9101, 9102, 9103, 9104, 9105)
)

$ErrorActionPreference = "Stop"

$RequiredCircuitBreakers = @(
    "oaRemoteWorkflowService",
    "crmRemoteWorkflowService",
    "hrWorkflowServiceClient",
    "authRemoteWorkflowService",
    "workflowRemoteUserService"
)

$RequiredTables = @(
    "wf_escalation_chain",
    "wf_escalation_log",
    "wf_reconcile_alert",
    "wf_process_monitor",
    "wf_task_monitor",
    "sys_audit_archive_policy",
    "sys_audit_log"
)

$Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param(
        [string]$Name,
        [bool]$Pass,
        [string]$Detail
    )

    $Results.Add([pscustomobject]@{
        Check = $Name
        Status = if ($Pass) { "PASS" } else { "FAIL" }
        Detail = $Detail
    })
}

function Invoke-Mysql {
    param([string]$Sql)

    if (-not (Test-Path -LiteralPath $Mysql)) {
        throw "mysql client not found: $Mysql"
    }
    if ([string]::IsNullOrWhiteSpace($DbPassword)) {
        throw "DbPassword is required. Set MYSQL_PWD or pass -DbPassword."
    }

    $previous = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $DbPassword
        & $Mysql -h $DbHost -P $DbPort -u $DbUser -D $DbName -N -B -e $Sql
        if ($LASTEXITCODE -ne 0) {
            throw "mysql exited with code $LASTEXITCODE"
        }
    } finally {
        $env:MYSQL_PWD = $previous
    }
}

function Get-LatestLog {
    param(
        [string]$Service,
        [string]$Kind
    )

    $logRoot = Join-Path $Root ".cloudflow-runtime\logs"
    Get-ChildItem -Path $logRoot -Filter "$Service-*.$Kind.log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

try {
    $healthFailures = @()
    foreach ($port in $HealthPorts) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/actuator/health" -TimeoutSec 5
            if ($null -eq $health -or $health.status -ne "UP") {
                $healthFailures += "$port=$($health.status)"
            }
        } catch {
            $healthFailures += "$port=$($_.Exception.Message)"
        }
    }
    Add-Result "health" ($healthFailures.Count -eq 0) ($(if ($healthFailures.Count -eq 0) { "all management ports are UP" } else { $healthFailures -join "; " }))

    $cbFailures = @()
    foreach ($port in @(9101, 9102, 9103, 9104, 9105)) {
        try {
            $body = Invoke-RestMethod -Uri "http://127.0.0.1:$port/actuator/circuitbreakers" -TimeoutSec 5
            $names = @($body.circuitBreakers.PSObject.Properties.Name)
            $missing = @($RequiredCircuitBreakers | Where-Object { $names -notcontains $_ })
            if ($missing.Count -gt 0) {
                $cbFailures += "$port missing $($missing -join ',')"
            }
        } catch {
            $cbFailures += "$port=$($_.Exception.Message)"
        }
    }
    Add-Result "circuitbreakers" ($cbFailures.Count -eq 0) ($(if ($cbFailures.Count -eq 0) { "required workflow circuit breakers registered" } else { $cbFailures -join "; " }))

    $tableList = "'" + ($RequiredTables -join "','") + "'"
    $tableCount = Invoke-Mysql "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($tableList);"
    Add-Result "m4_tables" ([int]$tableCount -eq $RequiredTables.Count) "found $tableCount/$($RequiredTables.Count) required tables"

    $counts = Invoke-Mysql @"
SELECT CONCAT('active_escalation_chains=', COUNT(*)) FROM wf_escalation_chain WHERE status=1;
SELECT CONCAT('reconcile_alerts=', COUNT(*)) FROM wf_reconcile_alert;
SELECT CONCAT('audit_archive_policies=', COUNT(*)) FROM sys_audit_archive_policy WHERE status='ACTIVE';
"@
    Add-Result "m4_runtime_rows" $true (($counts | Where-Object { $_ }) -join "; ")

    $recentReconcileAlerts = Invoke-Mysql "SELECT COUNT(*) FROM wf_reconcile_alert WHERE detected_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY);"
    Add-Result "reconcile_daily_gate" ([int]$recentReconcileAlerts -le 10) "recent24h=$recentReconcileAlerts; threshold<=10"

    $dryRunConfig = Join-Path $Root "config\cloudflow-common.yaml"
    $dryRunEnabled = (Select-String -LiteralPath $dryRunConfig -Pattern "dry-run:\s*true" -Quiet)
    Add-Result "audit_archive_dry_run_config" $dryRunEnabled "cloudflow.audit.archive.dry-run should stay true during dry-run gate"

    $beforeCount = Invoke-Mysql "SELECT COUNT(*) FROM sys_audit_log;"
    $candidateRows = Invoke-Mysql @"
SELECT CONCAT(p.biz_module, '=', COUNT(l.audit_id))
FROM sys_audit_archive_policy p
LEFT JOIN sys_audit_log l
  ON l.biz_module=p.biz_module
 AND l.create_time < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL p.retain_days DAY)
WHERE p.status='ACTIVE'
GROUP BY p.biz_module
ORDER BY p.biz_module;
"@
    $afterCount = Invoke-Mysql "SELECT COUNT(*) FROM sys_audit_log;"
    Add-Result "audit_archive_dry_run_probe" ($beforeCount -eq $afterCount) "before=$beforeCount; after=$afterCount; candidates=$(($candidateRows | Where-Object { $_ }) -join ';')"

    $errFailures = @()
    foreach ($service in @("gateway", "auth", "workflow", "oa", "crm", "hr")) {
        $log = Get-LatestLog -Service $service -Kind "err"
        if ($null -eq $log) {
            $errFailures += "$service=no err log"
        } elseif ($log.Length -ne 0) {
            $errFailures += "$service=$($log.Name):$($log.Length)"
        }
    }
    Add-Result "latest_err_logs" ($errFailures.Count -eq 0) ($(if ($errFailures.Count -eq 0) { "latest service err logs are empty" } else { $errFailures -join "; " }))

    $workflowLog = Get-LatestLog -Service "workflow" -Kind "out"
    $timeoutScanSeen = $false
    if ($null -ne $workflowLog) {
        $timeoutScanSeen = Select-String -LiteralPath $workflowLog.FullName -Pattern "TimeoutDetectionServiceImpl.*检测完成" -Quiet
    }
    Add-Result "workflow_timeout_scan" $timeoutScanSeen ($(if ($workflowLog) { $workflowLog.Name } else { "no workflow out log" }))

} catch {
    Add-Result "fatal" $false $_.Exception.Message
}

$Results | Format-Table -AutoSize

if (($Results | Where-Object { $_.Status -eq "FAIL" }).Count -gt 0) {
    exit 1
}
