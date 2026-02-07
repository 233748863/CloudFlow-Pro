# 清理工作流模块中的OA相关文件
# 此脚本将删除已迁移到OA模块的文件

$workflowPath = "src\main\java\com\cloudflow\workflow"

Write-Host "开始清理工作流模块中的OA文件..." -ForegroundColor Yellow

# 1. 删除Controller (8个文件)
Write-Host "`n删除Controller文件..." -ForegroundColor Cyan
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
    $path = "$workflowPath\controller\$file"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  [DELETED] $file" -ForegroundColor Red
    }
}

# 2. 删除Domain实体 (13个文件)
Write-Host "`n删除Domain实体文件..." -ForegroundColor Cyan
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
    $path = "$workflowPath\domain\$file"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  [DELETED] $file" -ForegroundColor Red
    }
}

# 3. 删除Mapper接口 (13个文件)
Write-Host "`n删除Mapper接口文件..." -ForegroundColor Cyan
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
    $path = "$workflowPath\mapper\$file"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  [DELETED] $file" -ForegroundColor Red
    }
}

# 4. 删除Service接口 (10个文件)
Write-Host "`n删除Service接口文件..." -ForegroundColor Cyan
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
    $path = "$workflowPath\service\$file"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  [DELETED] $file" -ForegroundColor Red
    }
}

# 5. 删除Service实现 (10个文件)
Write-Host "`n删除Service实现文件..." -ForegroundColor Cyan
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
    $path = "$workflowPath\service\impl\$file"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  [DELETED] $file" -ForegroundColor Red
    }
}

# 6. 删除Mapper XML文件
Write-Host "`n删除Mapper XML文件..." -ForegroundColor Cyan
$workflowResourcePath = "src\main\resources\mapper\workflow"
$mapperXmls = @(
    "SysAnnouncementMapper.xml",
    "SysScheduleEventMapper.xml"
)

foreach ($file in $mapperXmls) {
    $path = "$workflowResourcePath\$file"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  [DELETED] $file" -ForegroundColor Red
    }
}

Write-Host "`n清理完成!" -ForegroundColor Green
Write-Host "请手动检查pom.xml，移除Zxing依赖（如果不再需要）" -ForegroundColor Yellow
