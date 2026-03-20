# 移除文件的BOM标记
$ErrorActionPreference = "Stop"

$files = @(
    "src/main/java/com/cloudflow/hr/domain/dto/PositionFamilyUpdateDTO.java",
    "src/main/java/com/cloudflow/hr/domain/dto/JobLevelCreateDTO.java",
    "src/main/java/com/cloudflow/hr/service/impl/HeadcountServiceImpl.java",
    "src/main/java/com/cloudflow/hr/domain/dto/PositionFamilyCreateDTO.java",
    "src/main/java/com/cloudflow/hr/domain/dto/JobLevelUpdateDTO.java",
    "src/main/java/com/cloudflow/hr/service/impl/ReportingLineServiceImpl.java",
    "src/main/java/com/cloudflow/hr/config/FeignRequestInterceptor.java",
    "src/main/java/com/cloudflow/hr/service/impl/DeptPostSyncServiceImpl.java",
    "src/main/java/com/cloudflow/hr/domain/dto/PositionUpdateDTO.java",
    "src/main/java/com/cloudflow/hr/service/impl/JobLevelServiceImpl.java",
    "src/main/java/com/cloudflow/hr/service/impl/PositionFamilyServiceImpl.java",
    "src/main/java/com/cloudflow/hr/service/impl/PositionServiceImpl.java",
    "src/main/java/com/cloudflow/hr/domain/dto/PositionCreateDTO.java",
    "src/main/java/com/cloudflow/hr/domain/dto/HeadcountSetDTO.java",
    "src/main/java/com/cloudflow/hr/domain/dto/ReportingLineSetDTO.java",
    "src/main/java/com/cloudflow/hr/controller/FeignTestController.java"
)

Write-Host "移除BOM标记..." -ForegroundColor Green

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
        Write-Host "  处理: $file" -ForegroundColor Cyan
    }
}

Write-Host "BOM移除完成!" -ForegroundColor Green
