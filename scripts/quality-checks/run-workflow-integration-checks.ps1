param(
    [string]$ClasspathFile,
    [ValidateSet('WorkflowIntegrationChecks', 'WorkflowBatchReadChecks')]
    [string[]]$Checks = @('WorkflowIntegrationChecks', 'WorkflowBatchReadChecks'),
    [ValidateSet('tasks', 'safety', 'notifications', 'deploy')]
    [string[]]$BatchGroups
)
$ErrorActionPreference = 'Stop'
$TaskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$TaskModule = Join-Path $TaskRoot 'cloudflow-backend\cloudflow-service-workflow'
if (-not $ClasspathFile) { $ClasspathFile = Join-Path $TaskModule 'target\quality-workflow-classpath.txt' }
$TaskOutput = Join-Path $TaskRoot '.cloudflow-runtime\quality-refactor-20261103\workflow-integration'
[IO.Directory]::CreateDirectory($TaskOutput) | Out-Null
$TaskClasspath = (Join-Path $TaskModule 'target\classes') + ';' + (Get-Content -LiteralPath $ClasspathFile -Raw).Trim()
$TaskSources = @(
    'service\ScriptExecutionPolicy.java', 'util\VersionNumberGenerator.java',
    'service\impl\ExportServiceImpl.java', 'validator\ImportValidator.java',
    'service\WorkflowStartPermissions.java', 'config\WorkflowBusinessTypeContributor.java'
) | ForEach-Object { Join-Path $TaskModule "src\main\java\com\cloudflow\workflow\$_" }
$TaskSources += @($Checks | ForEach-Object { Join-Path $PSScriptRoot "$_.java" })
$TaskCompileArgs = Join-Path $TaskOutput 'compile.args'
$TaskCompileLines = @('-J-Dfile.encoding=UTF-8', '-encoding', 'UTF-8', '-processor', 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor', '-classpath', ('"' + $TaskClasspath.Replace('\', '/') + '"'), '-d', ('"' + $TaskOutput.Replace('\', '/') + '"'))
$TaskCompileLines += @($TaskSources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
[IO.File]::WriteAllLines($TaskCompileArgs, $TaskCompileLines, [Text.UTF8Encoding]::new($false))
& javac "@$TaskCompileArgs" *> (Join-Path $TaskOutput 'compile.log')
if ($LASTEXITCODE) { Get-Content -LiteralPath (Join-Path $TaskOutput 'compile.log') -Tail 65; throw 'Workflow 整合检查编译失败' }
foreach ($Check in $Checks) {
    $TaskRunArgs = Join-Path $TaskOutput "$Check.args"
    $TaskLog = Join-Path $TaskOutput "$Check.log"
    $TaskRunLines = @('-Xmx256m', '-Dfile.encoding=UTF-8', '-classpath', ('"' + ($TaskOutput + ';' + $TaskClasspath).Replace('\', '/') + '"'), $Check)
    if ($Check -eq 'WorkflowBatchReadChecks' -and $BatchGroups) { $TaskRunLines += $BatchGroups }
    [IO.File]::WriteAllLines($TaskRunArgs, $TaskRunLines, [Text.UTF8Encoding]::new($false))
    & java "@$TaskRunArgs" *> $TaskLog
    if ($LASTEXITCODE) { Get-Content -LiteralPath $TaskLog -Tail 60; throw "Workflow 整合检查失败: $Check" }
    Get-Content -LiteralPath $TaskLog | Where-Object { $_ -match '^PASS:' }
}
