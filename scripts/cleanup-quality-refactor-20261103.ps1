[CmdletBinding()]
param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$WorkspaceRoot = 'D:\CloudFlowPro'
if ((Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path -ne $WorkspaceRoot) {
    throw '此脚本只适用于 D:\CloudFlowPro'
}
$Names = @(
    'batch-e-mysql-fe354a50554a43ed8b213520fe29c6b7',
    'quality-hr-20261103',
    'quality-message-attempt-88fd2d6eb0a54b69b2cfdb42eab8ff59',
    'quality-message-mysql-resume-20261103',
    'quality-platform-audit-32c95a970a124634ab9cfdcab12f63bf',
    'quality-platform-core-91276b17163c49b9b59d898849a4200d',
    'quality-platform-core-resume-20261103',
    'quality-platform-frontend-1793691997433',
    'quality-platform-integration-20261103',
    'quality-platform-redis-5929eb6db0b44d7f9fd4db2a167da905',
    'quality-platform-resume-frontend-20261103',
    'quality-platform-seed-20261103',
    'quality-refactor-20261103',
    'quality-crm-renewal-20261103',
    'native-update-20261103-180000'
)
$Targets = @($Names | ForEach-Object { Join-Path $WorkspaceRoot ".cloudflow-runtime\$_" })
$Targets += Join-Path $WorkspaceRoot 'cloudflow-frontend\dist'
$Targets += Join-Path $WorkspaceRoot 'scripts\__pycache__'
$Targets += Join-Path $WorkspaceRoot 'scripts\quality-checks\__pycache__'
$Targets += @(Get-ChildItem -LiteralPath (Join-Path $WorkspaceRoot 'cloudflow-backend') -Filter pom.xml -Recurse -File |
    ForEach-Object { Join-Path $_.DirectoryName 'target' })
$Processes = @(Get-CimInstance Win32_Process)
$Tracked = @(& git -C $WorkspaceRoot ls-files)
if ($LASTEXITCODE -ne 0) { throw '无法确认 Git 受控文件边界' }
$Approved = @()
$FileCount = 0
[long]$LogicalBytes = 0
foreach ($Candidate in ($Targets | Select-Object -Unique)) {
    $Absolute = [IO.Path]::GetFullPath($Candidate)
    if (-not $Absolute.StartsWith($WorkspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "目录越界：$Absolute" }
    if (-not (Test-Path -LiteralPath $Absolute)) { continue }
    $Item = Get-Item -LiteralPath $Absolute -Force
    $Ancestor = $Item
    while ($null -ne $Ancestor) {
        if (($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "目录链接拒绝：$($Ancestor.FullName)" }
        $Ancestor = $Ancestor.Parent
    }
    $Entries = @(Get-ChildItem -LiteralPath $Absolute -Force -Recurse)
    if (@($Entries | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }).Count) { throw "目录内包含链接：$Absolute" }
    $Relative = $Absolute.Substring($WorkspaceRoot.Length + 1).Replace('\', '/')
    if (@($Tracked | Where-Object { $_ -eq $Relative -or $_.StartsWith($Relative + '/') }).Count) { throw "包含受版本控制文件：$Absolute" }
    $Active = @($Processes | Where-Object {
        $_.ProcessId -ne $PID -and ($_.ExecutablePath -like "$Absolute*" -or ($_.CommandLine -and $_.CommandLine.IndexOf($Absolute, [StringComparison]::OrdinalIgnoreCase) -ge 0))
    })
    if ($Active.Count) { throw "运行进程仍使用 $Absolute，进程编号：$($Active.ProcessId -join ',')" }
    $Files = @($Entries | Where-Object { -not $_.PSIsContainer })
    $FileCount += $Files.Count
    $LogicalBytes += ($Files | Measure-Object -Property Length -Sum).Sum
    $Approved += $Absolute
}
[long]$Before = (Get-PSDrive D).Free
$Approved | ForEach-Object { Write-Output "待清理：$_" }
Write-Output "文件 $FileCount 个；逻辑字节 $LogicalBytes；D 盘清理前可用 $Before 字节"
if (-not $Execute) {
    Write-Output '当前仅预览；服务器验收与结论登记完成、独占 MySQL 停止后，由用户显式使用 -Execute 执行。'
    exit 0
}
foreach ($Absolute in $Approved) { Remove-Item -LiteralPath $Absolute -Recurse -Force }
[long]$After = (Get-PSDrive D).Free
$Record = "`n清理执行：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')；范围为本脚本预检通过的 $($Approved.Count) 个目录，$FileCount 个文件，逻辑字节 $LogicalBytes；D 盘前后可用分别 $Before / $After 字节。同盘其他写入未知，空间差不作为本项目独立释放量。`n"
Add-Content -LiteralPath (Join-Path $WorkspaceRoot 'cloudflow-backend\docs\backend-quality-refactor-20261103-d-summary.md') -Value $Record -Encoding utf8
Write-Output "完成；D 盘清理后可用 $After 字节，结论已登记。"
