# 批量修改包名脚本
# 将 com.cloudflow.workflow 替换为 com.cloudflow.oa

$oaPath = "src\main\java\com\cloudflow\oa"

Write-Host "开始批量修改包名..." -ForegroundColor Green

# 获取所有Java文件
$javaFiles = Get-ChildItem -Path $oaPath -Filter "*.java" -Recurse

$totalFiles = $javaFiles.Count
$processedFiles = 0

foreach ($file in $javaFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # 替换包名
    $newContent = $content -replace 'package com\.cloudflow\.workflow', 'package com.cloudflow.oa'
    $newContent = $newContent -replace 'import com\.cloudflow\.workflow', 'import com.cloudflow.oa'
    
    # 如果内容有变化，则写回文件
    if ($content -ne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
        $processedFiles++
        Write-Host "  [OK] 已更新: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`n包名修改完成!" -ForegroundColor Green
Write-Host "共处理 $processedFiles / $totalFiles 个文件" -ForegroundColor Cyan
