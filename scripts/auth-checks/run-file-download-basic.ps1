$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$target = Join-Path $repo 'cloudflow-backend/cloudflow-auth/target'
$temporary = [IO.Path]::GetFullPath((Join-Path $target ('file-download-basic-' + [Guid]::NewGuid().ToString('N'))))
$parts = [System.Collections.Generic.List[string]]::new()
$parts.Add((Join-Path $target 'classes'))
$parts.Add((Join-Path $repo 'cloudflow-backend/cloudflow-common/cloudflow-common-core/target/classes'))
$parts.Add((Join-Path $repo 'cloudflow-backend/cloudflow-common/cloudflow-common-security/target/classes'))
foreach ($entry in ((Get-Content -LiteralPath (Join-Path $target 'batch-g-classpath.txt') -Raw).Trim() -split ';|\r?\n')) {
    if ([String]::IsNullOrWhiteSpace($entry)) { continue }
    if ($entry -match '[\/]com[\/]cloudflow[\/]([^\/]+)[\/]') {
        $moduleName = $Matches[1]
        $candidates = @((Join-Path $repo "cloudflow-backend/$moduleName/target/classes"), (Join-Path $repo "cloudflow-backend/cloudflow-common/$moduleName/target/classes"))
        $local = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
        if ($local) { $parts.Add($local) } elseif ($moduleName -eq 'cloudflow-common-config-secret' -and (Test-Path -LiteralPath $entry -PathType Leaf)) { $parts.Add($entry) } else { throw "未找到本轮模块 classes：$moduleName" }
    } else { $parts.Add($entry) }
}
$classpath = ($parts | Select-Object -Unique) -join ';'
$freeBefore = (Get-PSDrive -Name D).Free
$result = 1
if (Test-Path -LiteralPath $temporary) { throw '临时目录已存在。' }
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $compileArgs = Join-Path $temporary 'compile.args'
    $runArgs = Join-Path $temporary 'run.args'
    $source = Join-Path $PSScriptRoot 'FileDownloadBasicChecks.java'
    [IO.File]::WriteAllText($compileArgs, ('-encoding UTF-8 -proc:none -cp "' + $classpath.Replace('\', '/') + '" -d "' + $temporary.Replace('\', '/') + '" "' + $source.Replace('\', '/') + '"'), [Text.UTF8Encoding]::new($false))
    & javac "@$compileArgs"
    if ($LASTEXITCODE -ne 0) { throw '下载基本检查源码编译失败。' }
    [IO.File]::WriteAllText($runArgs, ('-cp "' + ($temporary + ';' + $classpath).Replace('\', '/') + '" com.cloudflow.auth.download.FileDownloadBasicChecks'), [Text.UTF8Encoding]::new($false))
    & java "@$runArgs"
    $result = $LASTEXITCODE
} finally {
    $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $temporary).Path)
    if (!$resolved.StartsWith([IO.Path]::GetFullPath($target) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '临时目录越界。' }
    $items = @(Get-Item -LiteralPath $temporary) + @(Get-ChildItem -LiteralPath $temporary -Recurse -Force)
    if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw '临时目录包含链接，停止清理。' }
    $relative = [IO.Path]::GetRelativePath($repo, $temporary).Replace('\', '/')
    $tracked = @(& git -C $repo ls-files -- $relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -gt 0) { throw '版本控制边界核对失败。' }
    $owners = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($temporary) })
    if ($owners.Count -gt 0) { throw '临时目录仍被运行进程引用。' }
    $bytes = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum
    Remove-Item -LiteralPath $temporary -Recurse -Force
    [ordered]@{ cleanupPath=$temporary; logicalBytes=[long]$bytes; freeBefore=$freeBefore; freeAfter=(Get-PSDrive -Name D).Free; removed=!(Test-Path -LiteralPath $temporary); diskDeltaAttribution='同盘其他活动未隔离，不将差值认定为本项目释放量' } | ConvertTo-Json -Compress
}
exit $result
