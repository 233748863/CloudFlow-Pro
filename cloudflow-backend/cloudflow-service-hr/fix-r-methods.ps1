# 批量替换 R.success 为 R.ok
$ErrorActionPreference = "Stop"

$files = Get-ChildItem -Path "src/main/java/com/cloudflow/hr/controller" -Filter "*.java" -Recurse

Write-Host "替换 R.success 为 R.ok..." -ForegroundColor Green

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    
    if ($content -match "R\.success") {
        $content = $content -replace "R\.success\(\)", "R.ok()"
        $content = $content -replace "R\.success\(", "R.ok("
        
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
        
        Write-Host "  修复: $($file.Name)" -ForegroundColor Cyan
    }
}

Write-Host "替换完成!" -ForegroundColor Green
