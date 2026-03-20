# 批量修复编译错误的PowerShell脚本
# 1. 将 Result 替换为 R (已经完成,跳过)
# 2. 将 SecurityContextHolder 替换为 SecurityUtils/UserContext
# 3. 删除 TenantContextHolder 的使用
# 4. 修复 validation 注解导入
# 5. 修复 Swagger 注解

$ErrorActionPreference = "Stop"
$sourceDir = "src/main/java/com/cloudflow/hr"

Write-Host "开始修复编译错误..." -ForegroundColor Green

# 修复 validation 注解导入
Write-Host "修复 validation 注解导入..." -ForegroundColor Yellow
$dtoFiles = Get-ChildItem -Path "$sourceDir/domain/dto" -Filter "*.java" -Recurse
foreach ($file in $dtoFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $modified = $false
    
    if ($content -match "import javax\.validation\.constraints\.") {
        $content = $content -replace "import javax\.validation\.constraints\.", "import jakarta.validation.constraints."
        $modified = $true
    }
    
    if ($modified) {
        $content | Set-Content $file.FullName -Encoding UTF8 -NoNewline
        Write-Host "  修复: $($file.Name)" -ForegroundColor Cyan
    }
}

# 修复 FeignRequestInterceptor
Write-Host "修复 FeignRequestInterceptor..." -ForegroundColor Yellow
$feignInterceptorFile = "$sourceDir/config/FeignRequestInterceptor.java"
if (Test-Path $feignInterceptorFile) {
    $content = Get-Content $feignInterceptorFile -Raw -Encoding UTF8
    
    # 删除 TenantContextHolder 导入
    $content = $content -replace "import com\.cloudflow\.common\.core\.context\.TenantContextHolder;`r?`n", ""
    
    # 删除 javax.servlet.http 导入
    $content = $content -replace "import javax\.servlet\.http\.HttpServletRequest;`r?`n", ""
    
    # 添加 UserContext 导入(如果不存在)
    if ($content -notmatch "import com\.cloudflow\.common\.core\.context\.UserContext;") {
        $content = $content -replace "(package com\.cloudflow\.hr\.config;)", "`$1`r`nimport com.cloudflow.common.core.context.UserContext;"
    }
    
    # 替换 TenantContextHolder.getTenantId() 为 UserContext.getTenantId()
    $content = $content -replace "TenantContextHolder\.getTenantId\(\)", "UserContext.getTenantId()"
    
    $content | Set-Content $feignInterceptorFile -Encoding UTF8 -NoNewline
    Write-Host "  修复: FeignRequestInterceptor.java" -ForegroundColor Cyan
}

# 修复 Service 实现类中的 SecurityContextHolder
Write-Host "修复 Service 实现类..." -ForegroundColor Yellow
$serviceImplFiles = Get-ChildItem -Path "$sourceDir/service/impl" -Filter "*ServiceImpl.java" -Recurse
foreach ($file in $serviceImplFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $modified = $false
    
    # 删除 SecurityContextHolder 导入
    if ($content -match "import com\.cloudflow\.common\.core\.context\.SecurityContextHolder;") {
        $content = $content -replace "import com\.cloudflow\.common\.core\.context\.SecurityContextHolder;`r?`n", ""
        $modified = $true
    }
    
    # 添加 SecurityUtils 导入(如果不存在)
    if ($content -notmatch "import com\.cloudflow\.common\.core\.utils\.SecurityUtils;") {
        $content = $content -replace "(package com\.cloudflow\.hr\.service\.impl;)", "`$1`r`nimport com.cloudflow.common.core.utils.SecurityUtils;"
        $modified = $true
    }
    
    # 替换 SecurityContextHolder.getUserId() 为 SecurityUtils.getUserId()
    if ($content -match "SecurityContextHolder\.getUserId\(\)") {
        $content = $content -replace "SecurityContextHolder\.getUserId\(\)", "SecurityUtils.getUserId()"
        $modified = $true
    }
    
    # 替换 SecurityContextHolder.getTenantId() 为 SecurityUtils.getTenantId()
    if ($content -match "SecurityContextHolder\.getTenantId\(\)") {
        $content = $content -replace "SecurityContextHolder\.getTenantId\(\)", "SecurityUtils.getTenantId()"
        $modified = $true
    }
    
    if ($modified) {
        $content | Set-Content $file.FullName -Encoding UTF8 -NoNewline
        Write-Host "  修复: $($file.Name)" -ForegroundColor Cyan
    }
}

# 修复 FeignTestController 的 Swagger 注解
Write-Host "修复 FeignTestController Swagger 注解..." -ForegroundColor Yellow
$feignTestFile = "$sourceDir/controller/FeignTestController.java"
if (Test-Path $feignTestFile) {
    $content = Get-Content $feignTestFile -Raw -Encoding UTF8
    
    # 删除旧的 Swagger 导入
    $content = $content -replace "import io\.swagger\.annotations\.Api;`r?`n", ""
    $content = $content -replace "import io\.swagger\.annotations\.ApiOperation;`r?`n", ""
    
    # 添加新的 Swagger 导入
    if ($content -notmatch "import io\.swagger\.v3\.oas\.annotations\.tags\.Tag;") {
        $content = $content -replace "(package com\.cloudflow\.hr\.controller;)", "`$1`r`nimport io.swagger.v3.oas.annotations.tags.Tag;`r`nimport io.swagger.v3.oas.annotations.Operation;"
    }
    
    # 替换 @Api 为 @Tag
    $content = $content -replace '@Api\(tags = "Feign客户端测试"\)', '@Tag(name = "Feign客户端测试", description = "测试Feign客户端调用Auth和Workflow服务")'
    
    # 替换 @ApiOperation 为 @Operation
    $content = $content -replace '@ApiOperation\("([^"]+)"\)', '@Operation(summary = "$1")'
    
    $content | Set-Content $feignTestFile -Encoding UTF8 -NoNewline
    Write-Host "  修复: FeignTestController.java" -ForegroundColor Cyan
}

Write-Host "编译错误修复完成!" -ForegroundColor Green
