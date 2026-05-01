param(
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Join-Path $Root "cloudflow-backend"
$FrontendRoot = Join-Path $Root "cloudflow-frontend"
$RuntimeRoot = Join-Path $Root ".cloudflow-runtime"
$LogRoot = Join-Path $RuntimeRoot "logs"

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

New-RuntimeDirectories

Write-Host "启动 CloudFlow 前后端..."

$pending = @()
foreach ($service in $BackendServices) {
    Stop-PortListeners -Service $service
}
Stop-PortListeners -Service $FrontendService
Start-Sleep -Seconds 2

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
$failed = @()
foreach ($item in $pending) {
    $ready = Wait-ServiceReady -Service $item.Service -ExpectedProcess $item.ExpectedProcess -Deadline $deadline
    if (-not $ready) {
        $failed += $item.Service
    }
}

if ($failed.Count -gt 0) {
    Write-Host "启动未完成，查看日志：$LogRoot"
    exit 1
}

Write-Host "CloudFlow 前后端已启动。"
Write-Host "前端：http://localhost:3000"
Write-Host "网关：http://localhost:9000"
