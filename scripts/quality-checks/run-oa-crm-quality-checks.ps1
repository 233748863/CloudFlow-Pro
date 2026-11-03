param(
    [ValidateSet('CrmQualityChecks', 'CrmScheduledNotificationChecks', 'OaQualityChecks', 'OaQualityDatabaseChecks')]
    [string[]]$Checks = @('CrmQualityChecks', 'CrmScheduledNotificationChecks', 'OaQualityChecks'),
    [string]$JdbcUrl,
    [string]$DataDirectory
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
$OutputDirectory = Join-Path $ProjectRoot '.cloudflow-runtime/quality-refactor-20261103/oa-crm'
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-service-oa'), (Join-Path $Backend 'cloudflow-service-crm'), (Join-Path $Backend 'cloudflow-service-workflow')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$ClassDirectories = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Dependencies = @('cloudflow-service-oa','cloudflow-service-crm') | ForEach-Object { (Get-Content -LiteralPath (Join-Path $Backend "$_/target/quality-oa-crm-classpath.txt") -Raw).Trim() }
$ClassPath = (@($ClassDirectories) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Sources = @($Checks | ForEach-Object { if ($_ -eq 'CrmScheduledNotificationChecks') { Join-Path $ProjectRoot 'scripts/crm-checks/CrmScheduledNotificationChecks.java' } else { Join-Path $PSScriptRoot "$_.java" } })
$CompileArguments = @('-encoding','UTF-8','-parameters','-proc:none','-cp',('"' + $ClassPath.Replace('\','/') + '"'),'-d',('"' + $OutputDirectory.Replace('\','/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\','/') + '"' })
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile,$CompileArguments,[Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileFile) *> (Join-Path $OutputDirectory 'compile.log')
if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $OutputDirectory 'compile.log') -Tail 70; throw 'OA/CRM 检查编译失败' }
foreach ($Check in $Checks) {
    $Package = if ($Check.StartsWith('Crm')) { 'com.cloudflow.crm.service.impl' } else { 'com.cloudflow.oa.service.impl' }
    $Arguments = @('-Xmx384m','-Dfile.encoding=UTF-8','-cp',('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),"$Package.$Check")
    if ($Check -eq 'OaQualityDatabaseChecks') {
        if (-not $JdbcUrl -or -not $DataDirectory) { throw '数据库检查必须指定专用 JDBC URL 和独占数据目录' }
        $Arguments += @($JdbcUrl,$DataDirectory) | ForEach-Object { '"' + $_.Replace('\','/') + '"' }
    }
    $RunFile = Join-Path $OutputDirectory "$Check.args"
    [IO.File]::WriteAllLines($RunFile,$Arguments,[Text.UTF8Encoding]::new($false))
    & java ('@' + $RunFile) *> (Join-Path $OutputDirectory "$Check.log")
    if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $OutputDirectory "$Check.log") -Tail 65; throw "OA/CRM 检查失败: $Check" }
    Get-Content -LiteralPath (Join-Path $OutputDirectory "$Check.log") | Where-Object { $_ -match '^PASS:|^CRM_SCHEDULED_NOTIFICATION_CHECKS:' }
}
