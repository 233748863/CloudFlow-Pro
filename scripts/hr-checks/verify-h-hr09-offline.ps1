param([string]$ClassPathFile = '')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-hr'
if (-not $ClassPathFile) { $ClassPathFile = Join-Path $Module 'target/batch-d-classpath.txt' }
if (-not (Test-Path -LiteralPath $ClassPathFile)) { throw '须先由主线程提供HR依赖classpath；本脚本不运行Maven、不启动服务、不连接数据库' }
$Dependencies = (Get-Content -LiteralPath $ClassPathFile -Raw).Trim()
$CommonClasses = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object {
    $Classes = Join-Path $_.FullName 'target/classes'
    if (Test-Path -LiteralPath $Classes) { $Classes }
})
$ClassPath = ($CommonClasses + @($Dependencies)) -join [IO.Path]::PathSeparator
$Output = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('hr09-check-output-' + [Guid]::NewGuid().ToString('N'))))
$AllowedRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $Output.StartsWith($AllowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw '独立检查输出目录越界' }
[IO.Directory]::CreateDirectory($Output) | Out-Null
try {
    $Sources = @(Get-ChildItem -LiteralPath (Join-Path $Module 'src/main/java') -Filter '*.java' -File -Recurse | Select-Object -ExpandProperty FullName)
    $Sources += Join-Path $PSScriptRoot 'HrHOvertimeChecks.java'
    $Sources += Join-Path $Backend 'cloudflow-common/cloudflow-common-encrypt/src/main/java/com/cloudflow/common/encrypt/annotation/EncryptField.java'
    $Sources += Join-Path $Backend 'cloudflow-common/cloudflow-common-static-rules/src/main/java/com/cloudflow/common/staticrules/StaticRuleScanner.java'
    $Compile = @('--release', '17', '-parameters', '-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
    $Compile += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
    $CompileFile = Join-Path $Output 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
    & javac "@$CompileFile"
    if ($LASTEXITCODE -ne 0) { throw 'HR独立目录源码编译失败' }
    $Run = @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), 'com.cloudflow.hr.service.HrHOvertimeChecks', ('"' + $Root.Replace('\', '/') + '"'))
    $RunFile = Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw 'HR-09离线断言失败' }
} finally {
    $Resolved = [IO.Path]::GetFullPath($Output)
    if (-not $Resolved.StartsWith($AllowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw '拒绝清理越界目录' }
    if (Test-Path -LiteralPath $Resolved) { Remove-Item -LiteralPath $Resolved -Recurse -Force }
}
