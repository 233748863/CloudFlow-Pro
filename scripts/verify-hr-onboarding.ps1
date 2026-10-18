param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-hr'

if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/hr-onboarding-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'HR onboarding compilation failed' }
    } finally {
        Pop-Location
    }
}

$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/hr-onboarding-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$CheckOutput = Join-Path $Module 'target/hr-onboarding-checks'
[IO.Directory]::CreateDirectory($CheckOutput) | Out-Null
$CheckSources = @('HrEmployeeOnboardingChecks.java', 'HrLifecycleHandoverChecks.java') | ForEach-Object { Join-Path $PSScriptRoot "hr-checks/$_" }
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $CheckOutput.Replace('\', '/') + '"'))
$CompileArguments += @($CheckSources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileArgumentFile = Join-Path $CheckOutput 'compile.args'
[IO.File]::WriteAllLines($CompileArgumentFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileArgumentFile"
if ($LASTEXITCODE -ne 0) { throw 'HR onboarding checks compilation failed' }
$RunArguments = @('-cp', ('"' + ($CheckOutput + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.hr.service.HrEmployeeOnboardingChecks')
$RunArgumentFile = Join-Path $CheckOutput 'run.args'
[IO.File]::WriteAllLines($RunArgumentFile, $RunArguments, [Text.UTF8Encoding]::new($false))
& java "@$RunArgumentFile"
if ($LASTEXITCODE -ne 0) { throw 'HR onboarding checks failed' }
