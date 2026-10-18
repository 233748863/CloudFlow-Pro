param([switch]$SkipBuild, [ValidateRange(1,10000)][int]$ExpectedTableCount = 374)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-workflow'

if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-workflow -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-b-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw '工作流编译或依赖检查失败' }
    } finally {
        Pop-Location
    }
}

$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-b-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$CheckOutput = Join-Path $Module 'target/batch-b-checks'
[IO.Directory]::CreateDirectory($CheckOutput) | Out-Null
$CheckSources = @('WorkflowBatchBChecks.java', 'WorkflowBatchBConfigChecks.java', 'WorkflowMonitorMappingChecks.java', 'WorkflowGatewayModelChecks.java', 'WorkflowNodeEventOrderingChecks.java', 'WorkflowBusinessLockFixture.java') |
    ForEach-Object { Join-Path (Join-Path $PSScriptRoot 'workflow-checks') $_ }
& javac '-J-Dfile.encoding=UTF-8' -encoding UTF-8 -cp $ClassPath -d $CheckOutput $CheckSources
if ($LASTEXITCODE -ne 0) { throw '批次 B 检查程序编译失败' }
& java '-Dfile.encoding=UTF-8' -cp ($CheckOutput + [IO.Path]::PathSeparator + $ClassPath) WorkflowBatchBChecks
if ($LASTEXITCODE -ne 0) { throw '批次 B 行为检查失败' }

$TableCount = 0
foreach ($SqlFile in Get-ChildItem -LiteralPath (Join-Path $Backend 'DB') -File | Where-Object Name -Match '^0[1-5]\..*\.sql$') {
    $Sql = Get-Content -LiteralPath $SqlFile.FullName -Raw -Encoding UTF8
    $Count = [regex]::Matches($Sql, '(?im)^\s*CREATE\s+TABLE\b').Count
    if ($SqlFile.Name -eq '02.cloudflow-workflow.sql' -and $Count -ne 47) {
        throw "02 脚本应为 47 表，实际 $Count"
    }
    $TableCount += $Count
}
if ($TableCount -ne $ExpectedTableCount) { throw "正式01—05脚本应为 $ExpectedTableCount 表，实际 $TableCount" }
Write-Output "PASS: SQL table declarations 47 / $ExpectedTableCount; official_scripts=01-05"
