param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Auth = Join-Path $Backend 'cloudflow-auth'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-auth -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/platform-access-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Platform access compilation failed' }
    } finally { Pop-Location }
}
$ClasspathFile = Join-Path $Auth 'target/platform-access-classpath.txt'
$Entries = @((Join-Path $Auth 'target/classes')) + (Get-Content -LiteralPath $ClasspathFile -Raw).Trim().Split([IO.Path]::PathSeparator)
$Classpath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/platform-access-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/platform-checks/PlatformAccessChecks.java'
$Production = @(Get-ChildItem -LiteralPath (Join-Path $Auth 'src/main/java/com/cloudflow/auth/platform') -Filter '*.java' | Select-Object -ExpandProperty FullName)
$Production += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/permission') -Filter '*.java' | Select-Object -ExpandProperty FullName)
$Production += @('CurrentPermissionService.java', 'CloudFlowStpInterface.java') | ForEach-Object { Join-Path $Backend "cloudflow-common/cloudflow-common-security/src/main/java/com/cloudflow/common/security/service/$_" }
$Production += Join-Path $Auth 'src/main/java/com/cloudflow/auth/controller/PlatformAccessController.java'
$Inputs = @($Production + $Source) | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } }
$CompileFile = Join-Path $Output 'compile.args'
$Compile = @('-encoding','UTF-8','-parameters','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"')) + @($Production + $Source | ForEach-Object { '"' + $_.Replace('\','/') + '"' })
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Platform access checks compilation failed' }
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'com.cloudflow.auth.platform.PlatformAccessChecks'), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Platform access checks failed' }
$Changed = @($Inputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
if ($Changed.Count -ne 0) { throw 'Platform access inputs changed during validation' }
Write-Output "PLATFORM_ACCESS_INPUTS: files=$($Inputs.Count); changed=0; compiled_from_current_source=true"
