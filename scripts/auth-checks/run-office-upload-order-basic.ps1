$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$target = Join-Path $repo '.cloudflow-runtime/office-upload-order-basic'
New-Item -ItemType Directory -Force -Path $target | Out-Null
$parts = [System.Collections.Generic.List[string]]::new()
$parts.Add((Join-Path $repo 'cloudflow-backend/cloudflow-common/cloudflow-common-core/target/classes'))
$parts.Add((Join-Path $repo 'cloudflow-backend/cloudflow-common/cloudflow-common-config/target/classes'))
$parts.Add((Join-Path $repo 'cloudflow-backend/cloudflow-auth/target/classes'))
foreach ($entry in ((Get-Content -LiteralPath (Join-Path $repo 'cloudflow-backend/cloudflow-auth/target/batch-g-classpath.txt') -Raw).Trim() -split ';|\r?\n')) {
    if (![String]::IsNullOrWhiteSpace($entry)) { $parts.Add($entry) }
}
$classpath = ($parts | Select-Object -Unique) -join ';'
$source = Join-Path $repo 'cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core.utils/file/FileUploadUtils.java'
$checks = Join-Path $PSScriptRoot 'OfficeUploadOrderChecks.java'
$compileArgs = Join-Path $target 'compile.args'
$arguments = '-encoding UTF-8 -proc:none --release 17 -cp "' + $classpath.Replace('\', '/') + '" -d "' + $target.Replace('\', '/') + '" "' + $source.Replace('\', '/') + '" "' + $checks.Replace('\', '/') + '"'
[IO.File]::WriteAllText($compileArgs, $arguments, [Text.UTF8Encoding]::new($false))
& javac "@$compileArgs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$runArgs = Join-Path $target 'run.args'
$arguments = '-cp "' + ($target + ';' + $classpath).Replace('\', '/') + '" com.cloudflow.auth.upload.OfficeUploadOrderChecks'
$sample = Join-Path $target 'real-openpyxl.xlsx'
if (Test-Path -LiteralPath $sample) { $arguments += ' "' + $sample.Replace('\', '/') + '"' }
[IO.File]::WriteAllText($runArgs, $arguments, [Text.UTF8Encoding]::new($false))
& java "@$runArgs"
exit $LASTEXITCODE
