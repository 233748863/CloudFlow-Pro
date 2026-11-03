param(
    [string]$OutputDirectory,
    [string]$ClasspathFile,
    [string]$JdbcUrl,
    [string]$DataDirectory,
    [ValidateSet('all', 'leave-resume', 'performance-workflow', 'leadership-callback')][string]$QualityGroup = 'all',
    [switch]$SkipSkillDatabase,
    [switch]$DatabaseOnly
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
$DependencyFile = if ($ClasspathFile) { [IO.Path]::GetFullPath($ClasspathFile) } else { Join-Path $Backend 'cloudflow-service-hr/target/quality-hr-final-classpath.txt' }
if (-not (Test-Path -LiteralPath $DependencyFile)) { throw 'Compile HR and create a current quality-hr-final-classpath.txt before running these checks.' }
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-hr-' + [Guid]::NewGuid().ToString('N'))
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-service-hr')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$ClassDirectories = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($ClassDirectories) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim())) -join [IO.Path]::PathSeparator
$Sources = @('HrSettlementCalculationChecks.java', 'HrRecruitmentContactChecks.java', 'HrFileDownloadBasicChecks.java', 'HrSkillChecks.java') | ForEach-Object { Join-Path $ProjectRoot ('scripts/hr-checks/' + $_) }
$Sources += Join-Path $Backend 'cloudflow-service-hr/src/main/java/com/cloudflow/hr/client/WorkflowServiceClient.java'
$Sources += Join-Path $Backend 'cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrWorkflowCallbackServiceImpl.java'
$QualityChecks = Join-Path $PSScriptRoot 'HrQualityDatabaseChecks.java'
if (Test-Path -LiteralPath $QualityChecks) { $Sources += $QualityChecks }
$CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'HR component check compilation failed.' }
$RuntimePath = $OutputDirectory + [IO.Path]::PathSeparator + $ClassPath
$Runs = @()
if (-not $DatabaseOnly) { $Runs = @(
    @{ Main='com.cloudflow.hr.checks.HrSettlementCalculationChecks'; Arguments=@() },
    @{ Main='com.cloudflow.hr.checks.HrRecruitmentContactChecks'; Arguments=@() },
    @{ Main='com.cloudflow.hr.service.HrFileDownloadBasicChecks'; Arguments=@() },
    @{ Main='com.cloudflow.hr.service.HrSkillChecks'; Arguments=@() }
) }
if ($JdbcUrl) {
    if (-not $DataDirectory) { throw 'The owned data directory is required with JdbcUrl.' }
    if (-not $SkipSkillDatabase) {
        $Runs += @{ Main='com.cloudflow.hr.service.HrSkillChecks'; Arguments=@($JdbcUrl, $DataDirectory, (Join-Path $Backend 'cloudflow-service-hr')) }
    }
    if (Test-Path -LiteralPath $QualityChecks) {
        $Runs += @{ Main='com.cloudflow.hr.service.HrQualityDatabaseChecks'; Arguments=@($JdbcUrl, $DataDirectory, (Join-Path $Backend 'cloudflow-service-hr'), $OutputDirectory, $QualityGroup) }
    }
}
foreach ($Run in $Runs) {
    $MainClass = $Run.Main
    $RunName = $MainClass.Substring($MainClass.LastIndexOf('.') + 1) + $(if ($Run.Arguments.Count -gt 0) { '-database' })
    if ($MainClass.EndsWith('HrQualityDatabaseChecks')) { $RunName += '-' + $QualityGroup }
    $RunFile = Join-Path $OutputDirectory ($RunName + '.args')
    $JavaArguments = @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
        '-cp', ('"' + $RuntimePath.Replace('\', '/') + '"'), $MainClass) + @($Run.Arguments | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
    [IO.File]::WriteAllLines($RunFile, $JavaArguments, [Text.UTF8Encoding]::new($false))
    & java ('@' + $RunFile) *> (Join-Path $OutputDirectory ($RunName + '.log'))
    if ($LASTEXITCODE -ne 0) {
        Get-Content -LiteralPath (Join-Path $OutputDirectory ($RunName + '.log')) -Tail 70
        throw "HR component check failed: $RunName"
    }
    Get-Content -LiteralPath (Join-Path $OutputDirectory ($RunName + '.log')) | Select-String 'CHECKS:|H2_SETTLEMENT_CALCULATION:|HR_FILE_DOWNLOAD_BASIC:|HR_QUALITY_DATABASE:|H2_SKILL_SERVICE_EVENTS:|H2_SKILL_MYSQL_RACES:'
}
Write-Output "HR_QUALITY_OUTPUT=$OutputDirectory"
