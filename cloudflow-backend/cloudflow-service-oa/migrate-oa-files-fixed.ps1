# OA模块文件迁移脚本（改进版）
# 此脚本将OA相关文件从workflow模块复制到OA模块

$workflowPath = "..\cloudflow-service-workflow\src\main\java\com\cloudflow\workflow"
$oaPath = "src\main\java\com\cloudflow\oa"

Write-Host "开始迁移OA模块文件..." -ForegroundColor Green

# 确保目标目录存在的函数
function Ensure-Directory {
    param($path)
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

# 1. 迁移Controller (8个文件)
Write-Host "`n迁移Controller文件..." -ForegroundColor Yellow
Ensure-Directory "$oaPath\controller"
$controllers = @(
    "AssetController.java",
    "AttendanceController.java",
    "MeetingRoomController.java",
    "SysAnnouncementController.java",
    "SysNoticeController.java",
    "SysScheduleController.java",
    "VehicleController.java",
    "WorkTaskController.java"
)

foreach ($file in $controllers) {
    $source = "$workflowPath\controller\$file"
    $dest = "$oaPath\controller\$file"
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] 已复制: $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] 未找到: $file" -ForegroundColor Yellow
    }
}

# 2. 迁移Domain实体 (13个文件)
Write-Host "`n迁移Domain实体文件..." -ForegroundColor Yellow
Ensure-Directory "$oaPath\domain"
$domains = @(
    "MeetingRoom.java",
    "SysAnnouncement.java",
    "SysAnnouncementRead.java",
    "SysAsset.java",
    "SysAttendanceRecord.java",
    "SysAttendanceRule.java",
    "SysConsumable.java",
    "SysNotice.java",
    "SysScheduleEvent.java",
    "SysVehicle.java",
    "VehicleExpense.java",
    "VehicleUsage.java",
    "WorkTask.java"
)

foreach ($file in $domains) {
    $source = "$workflowPath\domain\$file"
    $dest = "$oaPath\domain\$file"
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] 已复制: $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] 未找到: $file" -ForegroundColor Yellow
    }
}

# 3. 迁移Mapper接口 (13个文件)
Write-Host "`n迁移Mapper接口文件..." -ForegroundColor Yellow
Ensure-Directory "$oaPath\mapper"
$mappers = @(
    "MeetingRoomMapper.java",
    "SysAnnouncementMapper.java",
    "SysAnnouncementReadMapper.java",
    "SysAssetMapper.java",
    "SysAttendanceRecordMapper.java",
    "SysAttendanceRuleMapper.java",
    "SysConsumableMapper.java",
    "SysNoticeMapper.java",
    "SysScheduleEventMapper.java",
    "SysVehicleMapper.java",
    "VehicleExpenseMapper.java",
    "VehicleUsageMapper.java",
    "WorkTaskMapper.java"
)

foreach ($file in $mappers) {
    $source = "$workflowPath\mapper\$file"
    $dest = "$oaPath\mapper\$file"
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] 已复制: $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] 未找到: $file" -ForegroundColor Yellow
    }
}

# 4. 迁移Service接口 (10个文件)
Write-Host "`n迁移Service接口文件..." -ForegroundColor Yellow
Ensure-Directory "$oaPath\service"
$services = @(
    "IAssetService.java",
    "IAttendanceService.java",
    "IMeetingRoomService.java",
    "ISysAnnouncementService.java",
    "ISysNoticeService.java",
    "ISysScheduleService.java",
    "IVehicleExpenseService.java",
    "IVehicleService.java",
    "IVehicleUsageService.java",
    "IWorkTaskService.java"
)

foreach ($file in $services) {
    $source = "$workflowPath\service\$file"
    $dest = "$oaPath\service\$file"
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] 已复制: $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] 未找到: $file" -ForegroundColor Yellow
    }
}

# 5. 迁移Service实现 (10个文件)
Write-Host "`n迁移Service实现文件..." -ForegroundColor Yellow
Ensure-Directory "$oaPath\service\impl"
$serviceImpls = @(
    "AssetServiceImpl.java",
    "AttendanceServiceImpl.java",
    "MeetingRoomServiceImpl.java",
    "SysAnnouncementServiceImpl.java",
    "SysNoticeServiceImpl.java",
    "SysScheduleServiceImpl.java",
    "VehicleExpenseServiceImpl.java",
    "VehicleServiceImpl.java",
    "VehicleUsageServiceImpl.java",
    "WorkTaskServiceImpl.java"
)

foreach ($file in $serviceImpls) {
    $source = "$workflowPath\service\impl\$file"
    $dest = "$oaPath\service\impl\$file"
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] 已复制: $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] 未找到: $file" -ForegroundColor Yellow
    }
}

# 6. 迁移Mapper XML文件
Write-Host "`n迁移Mapper XML文件..." -ForegroundColor Yellow
$workflowResourcePath = "..\cloudflow-service-workflow\src\main\resources\mapper\workflow"
$oaResourcePath = "src\main\resources\mapper"
Ensure-Directory $oaResourcePath

$mapperXmls = @(
    "SysAnnouncementMapper.xml",
    "SysScheduleEventMapper.xml"
)

foreach ($file in $mapperXmls) {
    $source = "$workflowResourcePath\$file"
    $dest = "$oaResourcePath\$file"
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] 已复制: $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] 未找到: $file" -ForegroundColor Yellow
    }
}

Write-Host "`n文件迁移完成!" -ForegroundColor Green
Write-Host "接下来需要批量修改包名: com.cloudflow.workflow -> com.cloudflow.oa" -ForegroundColor Cyan
