param(
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Join-Path $Root "cloudflow-backend"
$FrontendRoot = Join-Path $Root "cloudflow-frontend"
$RuntimeRoot = Join-Path $Root ".cloudflow-runtime"
$LogRoot = Join-Path $RuntimeRoot "logs"
$LocalDefaultSharedPassword = "Juwangkeji@2025"

$BackendServices = @(
    @{
        Name = "gateway"
        Port = 9000
        Module = "cloudflow-gateway"
        MainClass = "com.cloudflow.gateway.GatewayApplication"
    },
    @{
        Name = "auth"
        Port = 9001
        Module = "cloudflow-auth"
        MainClass = "com.cloudflow.auth.AuthApplication"
    },
    @{
        Name = "workflow"
        Port = 9002
        Module = "cloudflow-service-workflow"
        MainClass = "com.cloudflow.workflow.WorkflowApplication"
    },
    @{
        Name = "oa"
        Port = 9003
        Module = "cloudflow-service-oa"
        MainClass = "com.cloudflow.oa.OaApplication"
    },
    @{
        Name = "crm"
        Port = 9004
        Module = "cloudflow-service-crm"
        MainClass = "com.cloudflow.crm.CrmApplication"
    },
    @{
        Name = "hr"
        Port = 9005
        Module = "cloudflow-service-hr"
        MainClass = "com.cloudflow.hr.HrServiceApplication"
    }
)

$FrontendService = @{
    Name = "frontend"
    Port = 3000
    MainClass = "vite"
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

function Test-BackendProcess {
    param(
        [object]$Service,
        [object]$Process
    )

    return $null -ne $Process -and
        $Process.CommandLine -like "*$($Service.MainClass)*"
}

function Test-FrontendProcess {
    param([object]$Process)

    return $null -ne $Process -and
        $Process.CommandLine -like "*cloudflow-frontend*" -and
        $Process.CommandLine -like "*vite*"
}

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $processIds = @()
    $queue = @($RootProcessId)

    while ($queue.Count -gt 0) {
        $current = $queue[0]
        if ($queue.Count -eq 1) {
            $queue = @()
        } else {
            $queue = $queue[1..($queue.Count - 1)]
        }

        if ($processIds -notcontains $current) {
            $processIds += $current
        }

        $children = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ParentProcessId -eq $current } |
            Select-Object -ExpandProperty ProcessId

        foreach ($child in $children) {
            if ($processIds -notcontains [int]$child) {
                $queue += [int]$child
            }
        }
    }

    $processIds |
        Sort-Object -Descending -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

function Stop-PortListeners {
    param([object]$Service)

    $connections = Get-NetTCPConnection -LocalPort $Service.Port -State Listen -ErrorAction SilentlyContinue
    if ($null -eq $connections) {
        return
    }

    $processIds = $connections |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -gt 0 }

    foreach ($processId in $processIds) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if ($null -ne $process) {
            Write-Host ("{0,-10} 清理端口 {1}, PID {2}" -f $Service.Name, $Service.Port, $process.ProcessId)
            Stop-ProcessTree -RootProcessId $process.ProcessId
        }
    }
}

function Install-BackendDependencies {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $LogRoot "backend-install-$stamp.out.log"
    $errLog = Join-Path $LogRoot "backend-install-$stamp.err.log"
    $mvnArgs = @(
        "clean",
        "-pl",
        "cloudflow-gateway,cloudflow-auth,cloudflow-service-workflow,cloudflow-service-oa,cloudflow-service-crm,cloudflow-service-hr",
        "-am",
        "-DskipTests",
        "-Dmaven.test.skip=true",
        "-Dmdep.analyze.skip=true",
        "install"
    )

    Write-Host "backend    编译并安装内部依赖..."
    $process = Start-Process `
        -FilePath "mvn.cmd" `
        -ArgumentList $mvnArgs `
        -WorkingDirectory $BackendRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -Wait `
        -PassThru

    if (($null -eq $process.ExitCode) -or ($process.ExitCode -ne 0)) {
        Write-Host "backend    编译失败，查看日志：$outLog"
        if (Test-Path $errLog) {
            Write-Host "backend    错误日志：$errLog"
        }
        exit $process.ExitCode
    }
}

function Sync-NacosConfiguration {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $pythonCommand) {
        $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
    }

    if ($null -eq $pythonCommand) {
        Write-Host "nacos      跳过配置同步，未找到 python/py"
        return
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
        -Wait `
        -PassThru

    if (($null -eq $process.ExitCode) -or ($process.ExitCode -ne 0)) {
        Write-Host "nacos      配置同步失败，继续启动。日志：$outLog"
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

    Write-Host ("{0,-10} 启动中，端口 {1}" -f $Service.Name, $Service.Port)
}

function Start-FrontendService {
    param([object]$Service)

    if (-not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
        throw "前端依赖不存在：cloudflow-frontend\node_modules"
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outLog = Join-Path $LogRoot "$($Service.Name)-$stamp.out.log"
    $errLog = Join-Path $LogRoot "$($Service.Name)-$stamp.err.log"

    Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$($Service.Port)") `
        -WorkingDirectory $FrontendRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru |
        Out-Null

    Write-Host ("{0,-10} 启动中，端口 {1}" -f $Service.Name, $Service.Port)
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
        Write-Host ("{0,-10} 启动超时，端口 {1}" -f $item.Service.Name, $item.Service.Port)
        $failed += $item.Service
    }

    return $failed
}

New-RuntimeDirectories
Import-DotEnvFile
Initialize-LocalEnvironment
Assert-LocalDependencies

Write-Host "启动 CloudFlow 前后端..."

$pending = @()
foreach ($service in $BackendServices) {
    Stop-PortListeners -Service $service
}
Stop-PortListeners -Service $FrontendService
Start-Sleep -Seconds 2

Install-BackendDependencies
Sync-NacosConfiguration

foreach ($service in $BackendServices) {
    Start-BackendService -Service $service
    $pending += @{
        Service = $service
        ExpectedProcess = ${function:Test-BackendProcess}
    }
}

Start-FrontendService -Service $FrontendService
$pending += @{
    Service = $FrontendService
    ExpectedProcess = {
        param($service, $process)
        Test-FrontendProcess -Process $process
    }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$failed = @(Wait-AllServicesReady -PendingServices $pending -Deadline $deadline)

if ($failed.Count -gt 0) {
    Write-Host "启动未完成，查看日志：$LogRoot"
    exit 1
}

Write-Host "CloudFlow 前后端已启动。"
Write-Host "前端：http://localhost:3000"
Write-Host "网关：http://localhost:9000"
