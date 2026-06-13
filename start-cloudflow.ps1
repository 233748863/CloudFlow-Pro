param(
[int]$TimeoutSeconds = 180,
[string]$BackendBuildThreads = "1C",
[switch]$All,
[switch]$Backend,
[Alias("React")]
[switch]$ReactFrontend,
[Alias("Tauri")]
[switch]$TauriDesktop
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Join-Path $Root "cloudflow-backend"
$ReactFrontendRoot = Join-Path $Root "cloudflow-frontend"
$RuntimeRoot = Join-Path $Root ".cloudflow-runtime"
$LogRoot = Join-Path $RuntimeRoot "logs"
$LocalDefaultSharedPassword = "Juwangkeji@2025"

$BackendServices = @(
    @{
        Name = "gateway"
        Port = 9000
        ManagementPort = 9100
        Module = "cloudflow-gateway"
        MainClass = "com.cloudflow.gateway.GatewayApplication"
    },
    @{
        Name = "auth"
        Port = 9001
        ManagementPort = 9101
        Module = "cloudflow-auth"
        MainClass = "com.cloudflow.auth.AuthApplication"
        ExtraPorts = @(19001, 19101)
    },
    @{
        Name = "workflow"
        Port = 9002
        ManagementPort = 9102
        Module = "cloudflow-service-workflow"
        MainClass = "com.cloudflow.workflow.WorkflowApplication"
    },
    @{
        Name = "oa"
        Port = 9003
        ManagementPort = 9103
        Module = "cloudflow-service-oa"
        MainClass = "com.cloudflow.oa.OaApplication"
    },
    @{
        Name = "crm"
        Port = 9004
        ManagementPort = 9104
        Module = "cloudflow-service-crm"
        MainClass = "com.cloudflow.crm.CrmApplication"
    },
    @{
        Name = "hr"
        Port = 9005
        ManagementPort = 9105
        Module = "cloudflow-service-hr"
        MainClass = "com.cloudflow.hr.HrServiceApplication"
    }
)

$FrontendServices = @(
    @{
        Name = "frontend"
        DisplayName = "React 前端"
        Port = 3000
        Root = $ReactFrontendRoot
        PackageManager = "npm.cmd"
        Arguments = @("run", "dev", "--", "--host", "0.0.0.0", "--port", "3000")
        ProcessPatterns = @("cloudflow-frontend\node_modules", "vite", "3000")
    },
    @{
        Name = "frontend-tauri"
        DisplayName = "Tauri 桌面端"
        Port = 3001
        Root = $ReactFrontendRoot
        PackageManager = "npm.cmd"
        Arguments = @("run", "tauri:dev")
        ProcessPatterns = @("cloudflow-frontend", "tauri")
        ReadyProcessPatterns = @("cloudflow-frontend\node_modules", "vite", "3001")
        WindowStyle = "Hidden"
        LaunchMessage = "已拉起桌面应用（devUrl http://localhost:3001）"
    }
)

$noLaunchTargetSpecified = -not ($All -or $Backend -or $ReactFrontend -or $TauriDesktop)
$StartBackend = $All -or $Backend -or $noLaunchTargetSpecified
$StartReactFrontend = $All -or $ReactFrontend -or $noLaunchTargetSpecified
$StartTauriDesktop = $All -or $TauriDesktop -or $noLaunchTargetSpecified

$selectedFrontendNames = @()
if ($StartReactFrontend) {
    $selectedFrontendNames += "frontend"
}
if ($StartTauriDesktop) {
    $selectedFrontendNames += "frontend-tauri"
}

$SelectedFrontendServices = @(
    $FrontendServices | Where-Object {
        $selectedFrontendNames -contains $_.Name
    }
)

function Test-ServiceField {
    param(
        [object]$Service,
        [string]$Name
    )

    if ($Service -is [System.Collections.IDictionary]) {
        return $Service.Contains($Name)
    }

    return $Service.PSObject.Properties.Name -contains $Name
}

function Get-ServiceField {
    param(
        [object]$Service,
        [string]$Name
    )

    if (-not (Test-ServiceField -Service $Service -Name $Name)) {
        return $null
    }

    if ($Service -is [System.Collections.IDictionary]) {
        return $Service[$Name]
    }

    return $Service.$Name
}

function Get-EnvValue {
    param([string]$Name)

    $item = Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        return $null
    }

    return $item.Value
}

function Test-EnvDefined {
    param([string]$Name)

    return $null -ne (Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue)
}

function Test-TemplatePlaceholderValue {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return $false
    }

    return $Value.Trim() -match '^(REPLACE_WITH_|CHANGE_ME(_TO)?_)'
}

function Test-StaleLocalValue {
    param(
        [string]$Name,
        [AllowNull()][string]$Value
    )

    if ($null -eq $Value) {
        return $false
    }

    switch ($Name) {
        "DB_URL" {
            return $Value -match 'characterEncoding=utf8mb4'
        }
        "DB_PASSWORD" {
            return $Value -in @("cloudflow_2026", "cloudflow_redis_2026")
        }
        "MYSQL_ROOT_PASSWORD" {
            return $Value -eq "cloudflow_2026"
        }
        "MYSQL_APP_PASSWORD" {
            return $Value -eq "cloudflow_2026"
        }
        "REDIS_PASSWORD" {
            return $Value -eq "cloudflow_redis_2026"
        }
        default {
            return $false
        }
    }
}

function Get-ConfiguredEnvValue {
    param([string]$Name)

    if (-not (Test-EnvDefined -Name $Name)) {
        return $null
    }

    $value = Get-EnvValue -Name $Name
    if ([string]::IsNullOrWhiteSpace($value) -or
        (Test-TemplatePlaceholderValue -Value $value) -or
        (Test-StaleLocalValue -Name $Name -Value $value)) {
        return $null
    }

    return $value
}

function Set-ProcessEnvDefault {
    param(
        [string]$Name,
        [string]$Value
    )

    if ($null -ne (Get-ConfiguredEnvValue -Name $Name)) {
        return
    }

    Set-Item -Path "Env:$Name" -Value $Value
}

function Import-DotEnvFile {
    $envFiles = @(
        (Join-Path $Root ".env.local"),
        (Join-Path $Root ".env"),
        (Join-Path $Root "deploy\cloudflow.env.local"),
        (Join-Path $Root "deploy\cloudflow.env")
    )

    foreach ($envFile in $envFiles) {
        if (-not (Test-Path $envFile)) {
            continue
        }

        foreach ($line in Get-Content -Path $envFile) {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
                continue
            }

            $parts = $trimmed -split '=', 2
            if ($parts.Count -ne 2) {
                continue
            }

            $name = $parts[0].Trim()
            $value = $parts[1].Trim()

            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }

            if (Test-TemplatePlaceholderValue -Value $value) {
                continue
            }

            Set-ProcessEnvDefault -Name $name -Value $value
        }
    }
}

function Initialize-LocalEnvironment {
    Set-ProcessEnvDefault -Name "MYSQL_SSL_PARAMS" -Value "useSSL=true&verifyServerCertificate=false&allowPublicKeyRetrieval=true"
    Set-ProcessEnvDefault -Name "DB_URL" -Value ("jdbc:mysql://192.168.1.173:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&connectionCollation=utf8mb4_0900_ai_ci&zeroDateTimeBehavior=convertToNull&{0}&serverTimezone=Asia/Shanghai" -f (Get-EnvValue -Name "MYSQL_SSL_PARAMS"))
    Set-ProcessEnvDefault -Name "DB_USERNAME" -Value "root"
    Set-ProcessEnvDefault -Name "MYSQL_ROOT_PASSWORD" -Value $LocalDefaultSharedPassword
    Set-ProcessEnvDefault -Name "MYSQL_APP_PASSWORD" -Value $LocalDefaultSharedPassword
    Set-ProcessEnvDefault -Name "REDIS_HOST" -Value "192.168.1.173"
    Set-ProcessEnvDefault -Name "REDIS_PORT" -Value "6379"
    Set-ProcessEnvDefault -Name "REDIS_PASSWORD" -Value $LocalDefaultSharedPassword

    if ($null -eq (Get-ConfiguredEnvValue -Name "DB_PASSWORD")) {
        $dbPasswordCandidate = $null
        $dbUsername = Get-ConfiguredEnvValue -Name "DB_USERNAME"
        $mysqlAppUsername = Get-ConfiguredEnvValue -Name "MYSQL_APP_USERNAME"

        if (-not [string]::IsNullOrWhiteSpace($dbUsername) -and
            -not [string]::IsNullOrWhiteSpace($mysqlAppUsername) -and
            $dbUsername -eq $mysqlAppUsername) {
            $dbPasswordCandidate = Get-ConfiguredEnvValue -Name "MYSQL_APP_PASSWORD"
        }

        if ($null -eq $dbPasswordCandidate) {
            $dbPasswordCandidate = Get-ConfiguredEnvValue -Name "MYSQL_ROOT_PASSWORD"
        }

        if ($null -eq $dbPasswordCandidate) {
            $dbPasswordCandidate = Get-ConfiguredEnvValue -Name "MYSQL_APP_PASSWORD"
            if ($null -ne $dbPasswordCandidate -and
                $null -eq (Get-ConfiguredEnvValue -Name "DB_USERNAME") -and
                -not [string]::IsNullOrWhiteSpace($mysqlAppUsername)) {
                Set-Item -Path "Env:DB_USERNAME" -Value $mysqlAppUsername
            }
        }

        if ($null -eq $dbPasswordCandidate) {
            $dbPasswordCandidate = $LocalDefaultSharedPassword
        }

        Set-Item -Path "Env:DB_PASSWORD" -Value $dbPasswordCandidate
    }

    Set-ProcessEnvDefault -Name "NACOS_SERVER" -Value "192.168.1.173:8848"
    Set-ProcessEnvDefault -Name "NACOS_NAMESPACE" -Value "0ccb9313-39d8-4a58-9fa5-ce834b77e60d"
    Set-ProcessEnvDefault -Name "NACOS_USERNAME" -Value "nacos"
    Set-ProcessEnvDefault -Name "NACOS_PASSWORD" -Value "nacos"
    Set-ProcessEnvDefault -Name "CLOUDFLOW_ENCRYPT_ENABLED" -Value "false"
    Set-ProcessEnvDefault -Name "LOG_LEVEL_APP" -Value "INFO"
    Set-ProcessEnvDefault -Name "LOG_LEVEL_MAPPER" -Value "WARN"
    Set-ProcessEnvDefault -Name "MYBATIS_LOG_IMPL" -Value "org.apache.ibatis.logging.nologging.NoLoggingImpl"

    $nacosServer = Get-EnvValue -Name "NACOS_SERVER"
    if (-not [string]::IsNullOrWhiteSpace($nacosServer) -and $nacosServer -match '^https?://') {
        $normalized = ($nacosServer -replace '^https?://', '').TrimEnd('/')
        Set-Item -Path "Env:NACOS_SERVER" -Value $normalized
    }
}

function Test-TcpEndpoint {
    param(
        [string]$HostName,
        [int]$Port
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne(2000, $false)) {
            $client.Close()
            return $false
        }
        $client.EndConnect($asyncResult)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Get-HostPortFromAddress {
    param(
        [string]$Address,
        [int]$DefaultPort
    )

    if ([string]::IsNullOrWhiteSpace($Address)) {
        return @{
            Host = "localhost"
            Port = $DefaultPort
        }
    }

    $normalized = $Address.Trim()
    if ($normalized -match '^(?<host>[^:\/]+)(:(?<port>\d+))?$') {
        return @{
            Host = $matches["host"]
            Port = if ($matches["port"]) { [int]$matches["port"] } else { $DefaultPort }
        }
    }

    return @{
        Host = "localhost"
        Port = $DefaultPort
    }
}

function Get-HostPortFromJdbcUrl {
    param([string]$JdbcUrl)

    if (-not [string]::IsNullOrWhiteSpace($JdbcUrl) -and $JdbcUrl -match '^jdbc:mysql://(?<host>[^:/?#]+)(:(?<port>\d+))?/') {
        return @{
            Host = $matches["host"]
            Port = if ($matches["port"]) { [int]$matches["port"] } else { 3306 }
        }
    }

    return @{
        Host = "localhost"
        Port = 3306
    }
}

function Assert-LocalDependencies {
    $missing = @()

    $nacos = Get-HostPortFromAddress -Address (Get-EnvValue -Name "NACOS_SERVER") -DefaultPort 8848
    if (-not (Test-TcpEndpoint -HostName $nacos.Host -Port $nacos.Port)) {
        $missing += "Nacos-HTTP=$($nacos.Host):$($nacos.Port)"
    }

    $nacosGrpcPort = $nacos.Port + 1000
    if (-not (Test-TcpEndpoint -HostName $nacos.Host -Port $nacosGrpcPort)) {
        $missing += "Nacos-GRPC=$($nacos.Host):$($nacosGrpcPort)"
    }

    if ($missing.Count -gt 0) {
        throw ("基础依赖未就绪: {0}" -f ($missing -join ", "))
    }
}

function New-RuntimeDirectories {
    New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\data\cloudflow\profile" | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\data\cloudflow\uploads" | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\data\cloudflow\hr\profile" | Out-Null
}

function Get-ListenerProcess {
    param([int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($null -eq $connection) {
        return $null
    }

    return Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
}

function Get-ServiceManagementPort {
    param([object]$Service)

    $managementPort = Get-ServiceField -Service $Service -Name "ManagementPort"
    if ($managementPort -is [int] -and $managementPort -gt 0) {
        return [int]$managementPort
    }

    return $null
}

function Test-BackendProcess {
    param(
        [object]$Service,
        [object]$Process
    )

    return $null -ne $Process -and
        $Process.CommandLine -like "*$($Service.MainClass)*"
}

function Test-FrontendProcess {
    param(
        [object]$Service,
        [object]$Process
    )

    if ($null -eq $Process -or [string]::IsNullOrWhiteSpace($Process.CommandLine)) {
        return $false
    }

    foreach ($pattern in $Service.ProcessPatterns) {
        if ($Process.CommandLine -notlike "*$pattern*") {
            return $false
        }
    }

    return $true
}

function Test-FrontendReadyProcess {
    param(
        [object]$Service,
        [object]$Process
    )

    if ($null -eq $Process -or [string]::IsNullOrWhiteSpace($Process.CommandLine)) {
        return $false
    }

    $readyProcessPatterns = Get-ServiceField -Service $Service -Name "ReadyProcessPatterns"
    $patterns = if ($null -ne $readyProcessPatterns) {
        @($readyProcessPatterns)
    } else {
        @($Service.ProcessPatterns)
    }

    foreach ($pattern in $patterns) {
        if ($Process.CommandLine -notlike "*$pattern*") {
            return $false
        }
    }

    return $true
}

function Test-BackendHealth {
    param([object]$Service)

    $managementPort = Get-ServiceManagementPort -Service $Service
    if ($null -eq $managementPort) {
        return $true
    }

    if ($null -eq (Get-ListenerProcess -Port $managementPort)) {
        return $false
    }

    try {
        $response = Invoke-RestMethod `
            -Uri ("http://127.0.0.1:{0}/actuator/health" -f $managementPort) `
            -Method Get `
            -TimeoutSec 3 `
            -ErrorAction Stop
        return $null -ne $response -and $response.status -eq "UP"
    } catch {
        return $false
    }
}

function Test-BackendReady {
    param(
        [object]$Service,
        [object]$Process
    )

    return (Test-BackendProcess -Service $Service -Process $Process) -and
        (Test-BackendHealth -Service $Service)
}

function Get-StartupFailureHint {
    param(
        [string]$OutLog,
        [string]$ErrLog
    )

    $logFiles = @($OutLog, $ErrLog) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path $_) }

    $markers = @(
        "APPLICATION FAILED TO START",
        "Error starting ApplicationContext",
        "UnsatisfiedDependencyException",
        "No qualifying bean of type",
        "BUILD FAILURE",
        "Failed to execute goal"
    )

    foreach ($logFile in $logFiles) {
        try {
            $tail = Get-Content -Path $logFile -Tail 120 -ErrorAction SilentlyContinue
            if ($null -eq $tail) {
                continue
            }

            $text = $tail -join "`n"
            foreach ($marker in $markers) {
                if ($text -like "*$marker*") {
                    return @{
                        Log = $logFile
                        Marker = $marker
                        Tail = $tail
                    }
                }
            }
        } catch {
        }
    }

    return $null
}

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $allTerminated = @()
    $maxIterations = 5
    $iteration = 0

    while ($iteration -lt $maxIterations) {
        $processIds = @()
        $queue = @($RootProcessId)

        while ($queue.Count -gt 0) {
            $current = $queue[0]
            $queue = if ($queue.Count -eq 1) { @() } else { $queue[1..($queue.Count - 1)] }

            if ($processIds -notcontains $current -and $allTerminated -notcontains $current) {
                $processIds += $current
            }

            $children = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                Where-Object { $_.ParentProcessId -eq $current } |
                Select-Object -ExpandProperty ProcessId

            foreach ($child in $children) {
                if ($processIds -notcontains [int]$child -and $allTerminated -notcontains [int]$child) {
                    $queue += [int]$child
                }
            }
        }

        if ($processIds.Count -eq 0) {
            break
        }

        $processIds | Sort-Object -Descending -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            $allTerminated += $_
        }

        Start-Sleep -Milliseconds 200
        $iteration++
    }
}

function Get-ServicePorts {
    param([object]$Service)

    $ports = @($Service.Port)
    $managementPort = Get-ServiceManagementPort -Service $Service
    if ($null -ne $managementPort) {
        $ports += $managementPort
    }
    $extraPorts = Get-ServiceField -Service $Service -Name "ExtraPorts"
    if ($null -ne $extraPorts) {
        $ports += $extraPorts
    }

    return $ports |
        Where-Object { $_ -is [int] -and $_ -gt 0 } |
        Sort-Object -Unique
}

function Stop-BackendModuleProcesses {
    param([object]$Service)

    $patterns = @(
        $Service.Module,
        $Service.MainClass,
        ("{0}\target\" -f $Service.Module)
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    $matchedProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            if ($null -eq $_ -or [string]::IsNullOrWhiteSpace($_.CommandLine)) {
                return $false
            }
            foreach ($pattern in $patterns) {
                if ($_.CommandLine -like "*$pattern*") {
                    return $true
                }
            }
            return $false
        }

    $matchedProcesses | Sort-Object ProcessId -Unique | ForEach-Object {
        Write-Host ("{0,-10} 清理残留进程 PID {1}" -f $Service.Name, $_.ProcessId)
        Stop-ProcessTree -RootProcessId $_.ProcessId
    }
}

function Stop-FrontendProcesses {
    param([object[]]$Services = $FrontendServices)

    $matchedProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            foreach ($service in $Services) {
                if (Test-FrontendProcess -Service $service -Process $_) {
                    return $true
                }
            }
            return $false
        }

    $matchedProcesses | Sort-Object ProcessId -Unique | ForEach-Object {
        Write-Host ("{0,-10} 清理残留进程 PID {1}" -f "frontend", $_.ProcessId)
        Stop-ProcessTree -RootProcessId $_.ProcessId
    }
}

function Stop-PortListeners {
    param([object]$Service)

    $portsByProcess = @{}

    foreach ($port in Get-ServicePorts -Service $Service) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($null -eq $connections) {
            continue
        }

        $processIds = $connections |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 }

        foreach ($processId in $processIds) {
            $processKey = [string]$processId
            if (-not $portsByProcess.ContainsKey($processKey)) {
                $portsByProcess[$processKey] = @()
            }
            $portsByProcess[$processKey] += $port
        }
    }

    foreach ($processKey in ($portsByProcess.Keys | Sort-Object { [int]$_ })) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processKey" -ErrorAction SilentlyContinue
        if ($null -ne $process) {
            $ports = ($portsByProcess[$processKey] | Sort-Object -Unique) -join ","
            Write-Host ("{0,-10} 清理端口 {1}, PID {2}" -f $Service.Name, $ports, $process.ProcessId)
            Stop-ProcessTree -RootProcessId $process.ProcessId
        }
    }
}

function Wait-PortsReleased {
    param(
        [object]$Service,
        [int]$MaxWaitSeconds = 10
    )

    $ports = Get-ServicePorts -Service $Service
    $deadline = (Get-Date).AddSeconds($MaxWaitSeconds)

    while ((Get-Date) -lt $deadline) {
        $occupied = @()
        foreach ($port in $ports) {
            if ($null -ne (Get-ListenerProcess -Port $port)) {
                $occupied += $port
            }
        }

        if ($occupied.Count -eq 0) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    $stillOccupied = @()
    foreach ($port in $ports) {
        if ($null -ne (Get-ListenerProcess -Port $port)) {
            $stillOccupied += $port
        }
    }

    if ($stillOccupied.Count -gt 0) {
        Write-Host ("{0,-10} 警告：端口 {1} 仍被占用" -f $Service.Name, ($stillOccupied -join ","))
        return $false
    }

    return $true
}

function Install-BackendDependencies {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $LogRoot "backend-install-$stamp.out.log"
    $errLog = Join-Path $LogRoot "backend-install-$stamp.err.log"
    $mvnArgs = @(
        "clean",
        "-T",
        $BackendBuildThreads,
        "-pl",
        "cloudflow-gateway,cloudflow-auth,cloudflow-service-workflow,cloudflow-service-oa,cloudflow-service-crm,cloudflow-service-hr",
        "-am",
        "-DskipTests",
        "-Dmaven.test.skip=true",
        "-Dmdep.analyze.skip=true",
        "install"
    )

    Write-Host ("backend    并行编译并安装内部依赖，线程 {0}..." -f $BackendBuildThreads)
    $process = Start-Process `
        -FilePath "mvn.cmd" `
        -ArgumentList $mvnArgs `
        -WorkingDirectory $BackendRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -Wait `
        -PassThru

    $exitCode = if ($null -eq $process.ExitCode) { 1 } else { $process.ExitCode }

    return @{
        Success = ($exitCode -eq 0)
        ExitCode = $exitCode
        OutLog = $outLog
        ErrLog = $errLog
    }
}

function Start-NacosConfigurationSync {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $pythonCommand) {
        $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
    }

    if ($null -eq $pythonCommand) {
        Write-Host "nacos      跳过配置同步，未找到 python/py"
        return $null
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $LogRoot "nacos-sync-$stamp.out.log"
    $errLog = Join-Path $LogRoot "nacos-sync-$stamp.err.log"
    $arguments = if ($pythonCommand.Name -eq "py.exe" -or $pythonCommand.Name -eq "py") {
        @("-3", ".\push_nacos_config.py")
    } else {
        @(".\push_nacos_config.py")
    }

    Write-Host "nacos      同步本地 config 到 Nacos..."
    $process = Start-Process `
        -FilePath $pythonCommand.Source `
        -ArgumentList $arguments `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru

    return @{
        Process = $process
        OutLog = $outLog
        ErrLog = $errLog
    }
}

function Wait-NacosConfigurationSync {
    param($SyncJob)

    if ($null -eq $SyncJob) {
        return
    }

    $process = $SyncJob.Process
    if ($null -eq $process) {
        return
    }

    $process.WaitForExit()
    if (($null -eq $process.ExitCode) -or ($process.ExitCode -ne 0)) {
        Write-Host "nacos      配置同步失败，继续启动。日志：$($SyncJob.OutLog)"
        if (Test-Path $SyncJob.ErrLog) {
            Write-Host "nacos      错误日志：$($SyncJob.ErrLog)"
        }
    }
}

function Start-BackendService {
    param([object]$Service)

    $moduleDir = Join-Path $BackendRoot $Service.Module
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $LogRoot "$($Service.Name)-$stamp.out.log"
    $errLog = Join-Path $LogRoot "$($Service.Name)-$stamp.err.log"
    $mvnArgs = @(
        "-Dmaven.test.skip=true",
        "-Dspring-boot.run.mainClass=$($Service.MainClass)",
        "-Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8",
        "spring-boot:run"
    )

    Start-Process `
        -FilePath "mvn.cmd" `
        -ArgumentList $mvnArgs `
        -WorkingDirectory $moduleDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru |
        Out-Null

    $managementPort = Get-ServiceManagementPort -Service $Service
    if ($null -ne $managementPort) {
        Write-Host ("{0,-10} 启动中，端口 {1}，健康检查 {2}" -f $Service.Name, $Service.Port, $managementPort)
    } else {
        Write-Host ("{0,-10} 启动中，端口 {1}" -f $Service.Name, $Service.Port)
    }

    return @{
        Service = $Service
        OutLog = $outLog
        ErrLog = $errLog
    }
}

function Retry-BackendServicesConcurrently {
    param(
        [object[]]$Services,
        [datetime]$Deadline
    )

    $retryTargets = @($Services | Where-Object { $null -ne $_ } | Sort-Object Name -Unique)
    if ($retryTargets.Count -eq 0) {
        return @()
    }

    foreach ($service in $retryTargets) {
        Write-Host ("{0,-10} 准备并行重试启动，第 2/2 次" -f $service.Name)
        Stop-BackendModuleProcesses -Service $service
        Stop-PortListeners -Service $service
    }

    Start-Sleep -Seconds 2

    $restartedServices = @()
    foreach ($service in $retryTargets) {
        $started = Start-BackendService -Service $service
        $restartedServices += @{
            Service = $started.Service
            OutLog = $started.OutLog
            ErrLog = $started.ErrLog
        }
    }

    return @(Wait-BackendServicesReady -PendingServices $restartedServices -Deadline $Deadline)
}

function Wait-BackendServicesReady {
    param(
        [object[]]$PendingServices,
        [datetime]$Deadline
    )

    $remaining = @($PendingServices)
    $failed = @()

    while ($remaining.Count -gt 0 -and (Get-Date) -lt $Deadline) {
        $nextRemaining = @()

        foreach ($item in $remaining) {
            $failureHint = Get-StartupFailureHint -OutLog $item.OutLog -ErrLog $item.ErrLog
            if ($null -ne $failureHint) {
                Write-Host ("{0,-10} 首次启动失败，命中 {1}" -f $item.Service.Name, $failureHint.Marker)
                Write-Host ("{0,-10} 日志：{1}" -f $item.Service.Name, $failureHint.Log)
                $failed += $item.Service
                continue
            }

            $process = Get-ListenerProcess -Port $item.Service.Port
            if (Test-BackendReady -Service $item.Service -Process $process) {
                $managementPort = Get-ServiceManagementPort -Service $item.Service
                if ($null -ne $managementPort) {
                    Write-Host ("{0,-10} 已就绪，端口 {1}，健康检查 {2}, PID {3}" -f $item.Service.Name, $item.Service.Port, $managementPort, $process.ProcessId)
                } else {
                    Write-Host ("{0,-10} 已就绪，端口 {1}, PID {2}" -f $item.Service.Name, $item.Service.Port, $process.ProcessId)
                }
            } else {
                $nextRemaining += $item
            }
        }

        $remaining = $nextRemaining
        if ($remaining.Count -gt 0) {
            Start-Sleep -Seconds 3
        }
    }

    foreach ($item in $remaining) {
        Write-Host ("{0,-10} 首次启动超时，端口 {1}" -f $item.Service.Name, $item.Service.Port)
        Write-Host ("{0,-10} 日志：{1}" -f $item.Service.Name, $item.OutLog)
        $failed += $item.Service
    }

    return $failed
}

function Start-FrontendService {
    param([object]$Service)

    if (-not (Test-Path (Join-Path $Service.Root "node_modules"))) {
        throw "前端依赖不存在：$($Service.Root)\node_modules"
    }

    $packageCommand = Get-Command $Service.PackageManager -ErrorAction SilentlyContinue
    if ($null -eq $packageCommand) {
        throw "前端启动命令不存在：$($Service.PackageManager)"
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $LogRoot "$($Service.Name)-$stamp.out.log"
    $errLog = Join-Path $LogRoot "$($Service.Name)-$stamp.err.log"
    $serviceArguments = Get-ServiceField -Service $Service -Name "Arguments"
    $arguments = if ($null -ne $serviceArguments) {
        @($serviceArguments)
    } else {
        @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$($Service.Port)")
    }
    $serviceWindowStyle = Get-ServiceField -Service $Service -Name "WindowStyle"
    $windowStyle = if ([string]::IsNullOrWhiteSpace($serviceWindowStyle)) { "Hidden" } else { $serviceWindowStyle }

    Start-Process `
        -FilePath $packageCommand.Source `
        -ArgumentList $arguments `
        -WorkingDirectory $Service.Root `
        -WindowStyle $windowStyle `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru |
        Out-Null

    Write-Host ("{0,-10} 启动中，端口 {1}" -f $Service.Name, $Service.Port)

    return @{
        Service = $Service
        OutLog = $outLog
        ErrLog = $errLog
    }
}

function Wait-ServiceReady {
    param(
        [object]$Service,
        [scriptblock]$ExpectedProcess,
        [datetime]$Deadline
    )

    while ((Get-Date) -lt $Deadline) {
        $process = Get-ListenerProcess -Port $Service.Port
        if (& $ExpectedProcess $Service $process) {
            Write-Host ("{0,-10} 已就绪，端口 {1}, PID {2}" -f $Service.Name, $Service.Port, $process.ProcessId)
            return $true
        }

        Start-Sleep -Seconds 3
    }

    Write-Host ("{0,-10} 启动超时，端口 {1}" -f $Service.Name, $Service.Port)
    return $false
}

function Wait-AllServicesReady {
    param(
        [object[]]$PendingServices,
        [datetime]$Deadline
    )

    $remaining = @($PendingServices)
    $failed = @()

    while ($remaining.Count -gt 0 -and (Get-Date) -lt $Deadline) {
        $nextRemaining = @()

        foreach ($item in $remaining) {
            $failureHint = Get-StartupFailureHint -OutLog $item.OutLog -ErrLog $item.ErrLog
            if ($null -ne $failureHint) {
                Write-Host ("{0,-10} 启动失败，端口 {1}, 命中 {2}" -f $item.Service.Name, $item.Service.Port, $failureHint.Marker)
                Write-Host ("{0,-10} 日志：{1}" -f $item.Service.Name, $failureHint.Log)
                $failed += $item.Service
                continue
            }

            $process = Get-ListenerProcess -Port $item.Service.Port
            if (& $item.ExpectedProcess $item.Service $process) {
                Write-Host ("{0,-10} 已就绪，端口 {1}, PID {2}" -f $item.Service.Name, $item.Service.Port, $process.ProcessId)
            } else {
                $nextRemaining += $item
            }
        }

        $remaining = $nextRemaining
        if ($remaining.Count -gt 0) {
            Start-Sleep -Seconds 3
        }
    }

    foreach ($item in $remaining) {
        $failureHint = Get-StartupFailureHint -OutLog $item.OutLog -ErrLog $item.ErrLog
        if ($null -ne $failureHint) {
            Write-Host ("{0,-10} 启动失败，端口 {1}, 命中 {2}" -f $item.Service.Name, $item.Service.Port, $failureHint.Marker)
            Write-Host ("{0,-10} 日志：{1}" -f $item.Service.Name, $failureHint.Log)
        } else {
            Write-Host ("{0,-10} 启动超时，端口 {1}" -f $item.Service.Name, $item.Service.Port)
            Write-Host ("{0,-10} 日志：{1}" -f $item.Service.Name, $item.OutLog)
        }
        $failed += $item.Service
    }

    return $failed
}

New-RuntimeDirectories
Import-DotEnvFile
Initialize-LocalEnvironment

if ($StartBackend) {
    Assert-LocalDependencies
}

$launchTargets = @()
if ($StartBackend) {
    $launchTargets += "后端"
}
if ($StartReactFrontend) {
    $launchTargets += "React 前端"
}
if ($StartTauriDesktop) {
    $launchTargets += "Tauri 桌面端"
}

Write-Host ("启动 CloudFlow：{0}..." -f ($launchTargets -join "、"))

$pending = @()
if ($StartBackend) {
    foreach ($service in $BackendServices) {
        Stop-BackendModuleProcesses -Service $service
        Stop-PortListeners -Service $service
        Wait-PortsReleased -Service $service -MaxWaitSeconds 10
    }
}

if ($SelectedFrontendServices.Count -gt 0) {
    Stop-FrontendProcesses -Services $SelectedFrontendServices
    foreach ($service in $SelectedFrontendServices) {
        Stop-PortListeners -Service $service
        Wait-PortsReleased -Service $service -MaxWaitSeconds 10
    }
}

$nacosSync = $null
if ($StartBackend) {
    $nacosSync = Start-NacosConfigurationSync
}

foreach ($service in $SelectedFrontendServices) {
    $startedFrontend = Start-FrontendService -Service $service
    $pending += @{
        Service = $startedFrontend.Service
        OutLog = $startedFrontend.OutLog
        ErrLog = $startedFrontend.ErrLog
        ExpectedProcess = {
            param($service, $process)
            Test-FrontendReadyProcess -Service $service -Process $process
        }
    }
}

if ($StartBackend) {
    $installResult = Install-BackendDependencies
    if (-not $installResult.Success) {
        if ($SelectedFrontendServices.Count -gt 0) {
            Stop-FrontendProcesses -Services $SelectedFrontendServices
            foreach ($service in $SelectedFrontendServices) {
                Stop-PortListeners -Service $service
            }
        }
        Write-Host "backend    编译失败，查看日志：$($installResult.OutLog)"
        if (Test-Path $installResult.ErrLog) {
            Write-Host "backend    错误日志：$($installResult.ErrLog)"
        }
        exit $installResult.ExitCode
    }

    Wait-NacosConfigurationSync -SyncJob $nacosSync
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$failed = @()

if ($StartBackend) {
    $startedBackends = @()
    foreach ($service in $BackendServices) {
        $started = Start-BackendService -Service $service
        $startedBackends += @{
            Service = $started.Service
            OutLog = $started.OutLog
            ErrLog = $started.ErrLog
        }
    }

    $initialFailed = @(Wait-BackendServicesReady -PendingServices $startedBackends -Deadline $deadline)
    $failed += @(Retry-BackendServicesConcurrently -Services $initialFailed -Deadline $deadline)
}

if ($pending.Count -gt 0) {
    $failed += @(Wait-AllServicesReady -PendingServices $pending -Deadline $deadline)
}

if ($failed.Count -gt 0) {
    Write-Host "启动未完成，查看日志：$LogRoot"
    exit 1
}

Write-Host ("CloudFlow 已启动：{0}。" -f ($launchTargets -join "、"))
foreach ($service in $SelectedFrontendServices) {
    $launchMessage = Get-ServiceField -Service $service -Name "LaunchMessage"
    if (-not [string]::IsNullOrWhiteSpace($launchMessage)) {
        Write-Host ("{0}：{1}" -f $service.DisplayName, $launchMessage)
    } else {
        Write-Host ("{0}：http://localhost:{1}" -f $service.DisplayName, $service.Port)
    }
}
if ($StartBackend) {
    Write-Host "网关：http://localhost:9000"
}
