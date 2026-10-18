param()
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$target = Join-Path $repo 'cloudflow-backend/cloudflow-auth/target'
$runtime = Join-Path $repo '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$state = Get-Content -LiteralPath (Join-Path $runtime 'state.json') -Raw | ConvertFrom-Json
if ($state.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($state.data) -ne [IO.Path]::GetFullPath((Join-Path $runtime 'mysql-data'))) { throw '运行环境边界不符。' }
$mysql = $state.processes | Where-Object name -eq 'mysql' | Select-Object -First 1
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$($mysql.id)"
if (!$process -or $process.Name -ne 'mysqld.exe' -or !$process.CommandLine.Contains($state.data)) { throw '受保护数据库进程不符。' }
$classpathFile = Join-Path $target 'batch-g-classpath.txt'
if (!(Test-Path -LiteralPath $classpathFile -PathType Leaf)) { throw '缺少 auth 依赖列表。' }
$parts = [Collections.Generic.List[string]]::new()
$parts.Add((Join-Path $target 'classes'))
foreach ($entry in ((Get-Content -LiteralPath $classpathFile -Raw).Trim() -split ';|\r?\n')) {
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
$temporary = [IO.Path]::GetFullPath((Join-Path $target ('observability-archive-basic-' + [Guid]::NewGuid().ToString('N'))))
$freeBefore = (Get-PSDrive -Name D).Free
$result = 1
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $compileArgs = Join-Path $temporary 'compile.args'
    $source = Join-Path $PSScriptRoot 'ObservabilityArchiveBasicChecks.java'
    [IO.File]::WriteAllText($compileArgs, ('-encoding UTF-8 -cp "' + $classpath.Replace('\', '/') + '" -d "' + $temporary.Replace('\', '/') + '" "' + $source.Replace('\', '/') + '"'), [Text.UTF8Encoding]::new($false))
    & javac "@$compileArgs"
    if ($LASTEXITCODE -ne 0) { throw "基本检查编译失败：$LASTEXITCODE" }
    $runArgs = Join-Path $temporary 'run.args'
    [IO.File]::WriteAllText($runArgs, ('-cp "' + ($temporary + ';' + $classpath).Replace('\', '/') + '" com.cloudflow.auth.job.ObservabilityArchiveBasicChecks "' + $state.jdbcUrl + '" "' + $state.data.Replace('\', '/') + '" "' + $repo.Replace('\', '/') + '"'), [Text.UTF8Encoding]::new($false))
    & java "@$runArgs"
    $result = $LASTEXITCODE
} finally {
    $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $temporary).Path)
    if (!$resolved.StartsWith([IO.Path]::GetFullPath($target) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '临时路径越界。' }
    $items = @(Get-Item -LiteralPath $temporary) + @(Get-ChildItem -LiteralPath $temporary -Recurse -Force)
    if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw '临时目录含链接。' }
    $relative = [IO.Path]::GetRelativePath($repo, $temporary).Replace('\', '/')
    $tracked = @(& git -C $repo ls-files -- $relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -gt 0) { throw '版本控制边界核对失败。' }
    $owners = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($temporary) })
    if ($owners.Count -gt 0) { throw '临时目录仍被进程引用。' }
    $bytes = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum
    Remove-Item -LiteralPath $temporary -Recurse -Force
    [ordered]@{ cleanupPath=$temporary; logicalBytes=[long]$bytes; freeBefore=$freeBefore; freeAfter=(Get-PSDrive -Name D).Free; removed=!(Test-Path -LiteralPath $temporary); diskDeltaAttribution='同盘活动未隔离，空间差不认定为项目释放量' } | ConvertTo-Json -Compress
}
exit $result
