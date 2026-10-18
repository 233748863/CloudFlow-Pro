param(
    [ValidateSet('UnreferencedArtifacts')][string]$Phase = 'UnreferencedArtifacts',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$Project = 'D:/CloudFlowPro'
$Audit = $Project + '/.cloudflow-runtime/storage-cleanup-20261016-r1'
function Normalize([string]$Path) {
    if (-not [IO.Path]::IsPathRooted($Path)) { $Path = Join-Path $Project $Path }
    return [IO.Path]::GetFullPath($Path).Replace([char]92, [char]47).TrimEnd('/')
}
$Protected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$Inputs = Get-Content -LiteralPath ($Audit + '/current-protected-inputs.json') -Raw | ConvertFrom-Json
foreach ($Property in $Inputs.PSObject.Properties) { $null = $Protected.Add((Normalize $Property.Name)) }
$Tracked = @(git -C $Project ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify tracked source boundary' }
$ProcessSnapshot = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID })
$Targets = @(foreach ($Run in @('0f28e2c788a14a6a931efe1366c881d3', '96d104c14bfe478bbef468c177e2b46f')) {
    $State = Get-Content -LiteralPath ($Project + '/.cloudflow-runtime/batch-g-integration/' + $Run + '/state.json') -Raw | ConvertFrom-Json
    if ($State.status -ne 'STOPPED') { throw ('Run is not stopped: ' + $Run) }
    if (@($ProcessSnapshot | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Run, [StringComparison]::OrdinalIgnoreCase) }).Count) { throw 'Run has active processes' }
    foreach ($Service in @('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway')) {
        $Path = $Project + '/.cloudflow-runtime/batch-g-integration/' + $Run + '/' + $Service + '/artifacts'
        if (Test-Path -LiteralPath $Path) { Normalize $Path }
    }
})
$Before = (Get-PSDrive -Name D).Free
$Records = [Collections.Generic.List[object]]::new()
foreach ($Path in $Targets) {
    if (-not $Path.StartsWith($Project + '/.cloudflow-runtime/batch-g-integration/', [StringComparison]::OrdinalIgnoreCase) -or -not $Path.EndsWith('/artifacts')) { throw 'Target outside approved artifact scope' }
    foreach ($Keep in $Protected) { if ($Keep -eq $Path -or $Keep.StartsWith($Path + '/', [StringComparison]::OrdinalIgnoreCase)) { throw 'Current input is protected' } }
    $Relative = $Path.Substring($Project.Length + 1)
    foreach ($File in $Tracked) { if ($File -eq $Relative -or $File.StartsWith($Relative + '/', [StringComparison]::OrdinalIgnoreCase)) { throw 'Tracked source is protected' } }
    $Ancestor = Get-Item -LiteralPath $Path -Force
    while ($Ancestor) {
        if ($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected ancestor is protected' }
        $Ancestor = $Ancestor.Parent
    }
    $Entries = @(Get-ChildItem -LiteralPath $Path -Recurse -Force)
    if (@($Entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Redirected descendant is protected' }
    $Files = @($Entries | Where-Object { -not $_.PSIsContainer })
    $Record = [pscustomobject]@{path=$Path;files=$Files.Count;logicalBytes=[long]($Files | Measure-Object Length -Sum).Sum;deleted=$false}
    if ($Apply) {
        Remove-Item -LiteralPath $Path -Recurse -Force
        if (Test-Path -LiteralPath $Path) { throw 'Deletion incomplete' }
        $Record.deleted = $true
    }
    $Records.Add($Record)
}
$After = (Get-PSDrive -Name D).Free
$Result = [pscustomobject]@{at=(Get-Date -Format o);phase=$Phase;applied=[bool]$Apply;beforeFreeBytes=$Before;afterFreeBytes=$After;actualFreeDeltaBytes=$After-$Before;targets=@($Records)}
$Result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($Audit + '/expired-' + $Phase.ToLowerInvariant() + '-result.json') -Encoding utf8
[pscustomobject]@{phase=$Phase;applied=[bool]$Apply;targets=$Records.Count;files=($Records | Measure-Object files -Sum).Sum;logicalBytes=($Records | Measure-Object logicalBytes -Sum).Sum;actualFreeDeltaBytes=$After-$Before;afterFreeBytes=$After} | ConvertTo-Json -Compress
