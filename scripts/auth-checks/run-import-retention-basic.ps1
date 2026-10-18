param()
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$target = Join-Path $repo 'cloudflow-backend/cloudflow-auth/target'
$temporary = [IO.Path]::GetFullPath((Join-Path $target ('import-retention-basic-' + [Guid]::NewGuid().ToString('N'))))
$classpathFile = Join-Path $target 'batch-g-classpath.txt'
if (!(Test-Path -LiteralPath $classpathFile -PathType Leaf)) { throw '缺少 auth 依赖列表，请先生成 batch-g-classpath.txt。' }
$parts = [System.Collections.Generic.List[string]]::new()
$parts.Add((Join-Path $target 'classes'))
$dependencyFiles = @($classpathFile)
foreach ($entry in (($dependencyFiles | ForEach-Object { (Get-Content -LiteralPath $_ -Raw).Trim() }) -join ';' -split ';|\r?\n')) {
    if ([String]::IsNullOrWhiteSpace($entry)) { continue }
    if ($entry.Replace('\', '/') -match '/com/cloudflow/([^/]+)/') {
        $moduleName = $Matches[1]
        $candidates = @((Join-Path $repo "cloudflow-backend/$moduleName/target/classes"), (Join-Path $repo "cloudflow-backend/cloudflow-common/$moduleName/target/classes"))
        $local = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
        if (!$local -and $moduleName -eq 'cloudflow-common-config-secret') { $parts.Add($entry); continue }
        if (!$local) { throw "未找到本轮模块 classes：$moduleName" }
        $parts.Add($local)
    } else { $parts.Add($entry) }
}
$classpath = ($parts | Select-Object -Unique) -join ';'
$driveName = [IO.Path]::GetPathRoot($repo).Substring(0, 1)
$freeBefore = (Get-PSDrive -Name $driveName).Free
$result = 1
if (Test-Path -LiteralPath $temporary) { throw '临时目录已存在，拒绝复用。' }
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $compileArgs = Join-Path $temporary 'compile.args'
    $runArgs = Join-Path $temporary 'run.args'
    $sourceDirectory = Join-Path $PSScriptRoot '../platform-checks'
    $sourceArguments = @('ImportChecks.java', 'ImportGeneratedFileChecks.java') | ForEach-Object {
        '"' + (Join-Path $sourceDirectory $_).Replace('\', '/') + '"'
    }
    $compileText = '-encoding UTF-8 -cp "' + $classpath.Replace('\', '/') + '" -d "' + $temporary.Replace('\', '/') + '" ' + ($sourceArguments -join ' ')
    [IO.File]::WriteAllText($compileArgs, $compileText, [Text.UTF8Encoding]::new($false))
    & javac "@$compileArgs"
    if ($LASTEXITCODE -ne 0) { throw "基本检查脚本编译失败：$LASTEXITCODE" }
    $runText = '-cp "' + ($temporary + ';' + $classpath).Replace('\', '/') + '" com.cloudflow.common.excel.importing.ImportGeneratedFileChecks "' + $temporary.Replace('\', '/') + '"'
    [IO.File]::WriteAllText($runArgs, $runText, [Text.UTF8Encoding]::new($false))
    & java "@$runArgs"
    $result = $LASTEXITCODE
} finally {
    $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $temporary).Path)
    if (!$resolved.StartsWith([IO.Path]::GetFullPath($target) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '临时路径超出指定 target，停止清理。' }
    $items = @(Get-Item -LiteralPath $temporary) + @(Get-ChildItem -LiteralPath $temporary -Recurse -Force)
    if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw '临时目录含链接，停止清理。' }
    $relative = [IO.Path]::GetRelativePath($repo, $temporary).Replace('\', '/')
    $tracked = @(& git -C $repo ls-files -- $relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -gt 0) { throw '临时目录版本控制边界核对失败，停止清理。' }
    $owners = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($temporary) })
    if ($owners.Count -gt 0) { throw '临时目录仍被进程引用，停止清理。' }
    $bytes = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum
    Remove-Item -LiteralPath $temporary -Recurse -Force
    [ordered]@{ cleanupPath = $temporary; logicalBytes = [long]$bytes; freeBefore = $freeBefore; freeAfter = (Get-PSDrive -Name $driveName).Free; removed = !(Test-Path -LiteralPath $temporary); diskDeltaAttribution = '同盘其他活动未隔离，不将差值认定为本项目释放量' } | ConvertTo-Json -Compress
}
exit $result
