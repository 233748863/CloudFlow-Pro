param(
    [string]$ClasspathFile,
    [ValidateSet('WorkflowQualityChecks', 'WorkflowStartableDefinitionChecks', 'WorkflowDraftReferenceChecks', 'WorkflowBatchBChecks', 'TaskReminderScanChecks')]
    [string[]]$Checks = @('WorkflowQualityChecks', 'WorkflowStartableDefinitionChecks', 'WorkflowDraftReferenceChecks', 'WorkflowBatchBChecks', 'TaskReminderScanChecks')
)
$ErrorActionPreference = 'Stop'
$TaskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$TaskModule = Join-Path $TaskRoot 'cloudflow-backend\cloudflow-service-workflow'
if (-not $ClasspathFile) { $ClasspathFile = Join-Path $TaskModule 'target\quality-workflow-classpath.txt' }
$TaskOutput = Join-Path $TaskRoot '.cloudflow-runtime\quality-refactor-20261103\workflow'
[IO.Directory]::CreateDirectory($TaskOutput) | Out-Null
$TaskClasspath = (Join-Path $TaskModule 'target\classes') + ';' + (Get-Content -LiteralPath $ClasspathFile -Raw).Trim()
$TaskSources = [Collections.Generic.HashSet[string]]::new()
foreach ($Check in $Checks) {
    if ($Check -eq 'WorkflowQualityChecks') { [void]$TaskSources.Add((Join-Path $PSScriptRoot 'WorkflowQualityChecks.java')) }
    elseif ($Check -eq 'TaskReminderScanChecks') { [void]$TaskSources.Add((Join-Path $TaskRoot 'scripts\job-checks\TaskReminderScanChecks.java')) }
    elseif ($Check -eq 'WorkflowBatchBChecks') {
        foreach ($Name in @('WorkflowBatchBChecks', 'WorkflowBatchBConfigChecks', 'WorkflowMonitorMappingChecks', 'WorkflowGatewayModelChecks', 'WorkflowNodeEventOrderingChecks', 'WorkflowBusinessLockFixture')) {
            [void]$TaskSources.Add((Join-Path $TaskRoot "scripts\workflow-checks\$Name.java"))
        }
    } else { [void]$TaskSources.Add((Join-Path $TaskRoot "scripts\workflow-checks\$Check.java")) }
}
$TaskCompileArgs = Join-Path $TaskOutput 'compile.args'
$TaskCompileLines = @('-J-Dfile.encoding=UTF-8', '-encoding', 'UTF-8', '-proc:none', '-classpath', ('"' + $TaskClasspath.Replace('\', '/') + '"'), '-d', ('"' + $TaskOutput.Replace('\', '/') + '"'))
$TaskCompileLines += @($TaskSources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
[IO.File]::WriteAllLines($TaskCompileArgs, $TaskCompileLines, [Text.UTF8Encoding]::new($false))
& javac "@$TaskCompileArgs" *> (Join-Path $TaskOutput 'compile.log')
if ($LASTEXITCODE) { Get-Content -LiteralPath (Join-Path $TaskOutput 'compile.log') -Tail 50; throw 'Workflow 局部检查编译失败' }
foreach ($Check in $Checks) {
    $TaskMain = if ($Check -eq 'TaskReminderScanChecks') { 'com.cloudflow.workflow.job.TaskReminderScanChecks' } else { $Check }
    $TaskRunArgs = Join-Path $TaskOutput "$Check.args"
    $TaskLog = Join-Path $TaskOutput "$Check.log"
    $TaskRunLines = @('-Xmx256m', '-Dfile.encoding=UTF-8', '-classpath', ('"' + ($TaskOutput + ';' + $TaskClasspath).Replace('\', '/') + '"'), $TaskMain)
    if ($Check -eq 'WorkflowDraftReferenceChecks') { $TaskRunLines += '"' + $TaskRoot.Replace('\', '/') + '"' }
    [IO.File]::WriteAllLines($TaskRunArgs, $TaskRunLines, [Text.UTF8Encoding]::new($false))
    & java "@$TaskRunArgs" *> $TaskLog
    if ($LASTEXITCODE) { Get-Content -LiteralPath $TaskLog -Tail 55; throw "Workflow 局部行为检查失败: $Check" }
    Get-Content -LiteralPath $TaskLog | Where-Object { $_ -match '^PASS:|^TASK_REMINDER_SCAN_CHECKS:' }
}
