param([switch]$SkipBuild, [switch]$CancellationOnly)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-workflow'

if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-workflow -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-d-workflow-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Workflow compilation failed' }
    } finally {
        Pop-Location
    }
}

$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-workflow-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$CheckOutput = Join-Path $Module 'target/batch-d-workflow-checks'
[IO.Directory]::CreateDirectory($CheckOutput) | Out-Null
$CheckClasses = if ($CancellationOnly) { @('HrRuleWorkflowCancellationChecks') } else { @('WorkflowBatchBChecks', 'HrRuleWorkflowCancellationChecks') }
$CheckSources = @($CheckClasses | ForEach-Object { Join-Path $PSScriptRoot "workflow-checks/$_.java" })
if (-not $CancellationOnly) {
    $CheckSources += @('WorkflowBatchBConfigChecks', 'WorkflowMonitorMappingChecks', 'WorkflowGatewayModelChecks') |
        ForEach-Object { Join-Path $PSScriptRoot "workflow-checks/$_.java" }
}
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $CheckOutput.Replace('\', '/') + '"'))
$CompileArguments += @($CheckSources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileArgumentFile = Join-Path $CheckOutput 'compile.args'
[IO.File]::WriteAllLines($CompileArgumentFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileArgumentFile"
if ($LASTEXITCODE -ne 0) { throw 'Workflow checks compilation failed' }
foreach ($CheckClass in $CheckClasses) {
    $RunArguments = @('-cp', ('"' + ($CheckOutput + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), $CheckClass)
    $RunArgumentFile = Join-Path $CheckOutput "$CheckClass.args"
    [IO.File]::WriteAllLines($RunArgumentFile, $RunArguments, [Text.UTF8Encoding]::new($false))
    & java "@$RunArgumentFile"
    if ($LASTEXITCODE -ne 0) { throw "$CheckClass failed" }
}
