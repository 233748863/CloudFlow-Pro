param(
    [ValidateSet('Runs','Evidence','Caches','Legacy','Logs','ReferenceLogs','RuntimeSnapshots','Residual','OccupiedResidual','Investigation')][string]$Phase,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$Project = 'D:/CloudFlowPro'
$Cache = 'D:/CloudFlowProCache'
$Runtime = $Project + '/.cloudflow-runtime'
$Evidence = $Runtime + '/full-prd-20260915/approved-runtime'
$Audit = $Runtime + '/storage-cleanup-20261016-r1'
$Record = $Project + '/docs/design/开发测试过期文件清理-20261016.md'
function Normalize([string]$Path) {
    if (-not [IO.Path]::IsPathRooted($Path)) { $Path = Join-Path $Project $Path }
    return [IO.Path]::GetFullPath($Path).Replace([char]92,[char]47).TrimEnd('/')
}
$Protected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$Manifest = Get-Content -LiteralPath ($Audit + '/current-protected-inputs.json') -Raw | ConvertFrom-Json
foreach ($Entry in $Manifest.PSObject.Properties) { $null = $Protected.Add((Normalize $Entry.Name)) }
$KeepTrees = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($Relative in @(
    'batch-g-integration/9799534e1a3a47b5958330f14ae16dc7',
    'batch-g-integration/e1afdf39e80341a59789fe9a82057f54',
    'full-prd-20260915/approved-runtime/backend-executable-verification-20261006-r62',
    'full-prd-20260915/approved-runtime/f5-rfq-independent-20261015-r17',
    'full-prd-20260915/approved-runtime/f5-rfq-checks-20261015-r6',
    'full-prd-20260915/approved-runtime/f2-supplier-checks-20261012-r12'
)) { $null = $KeepTrees.Add((Normalize ($Runtime+'/'+$Relative))) }
$Processes = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID })
$LiveText = [Collections.Generic.List[string]]::new()
foreach ($Process in $Processes) { $LiveText.Add(($Process.CommandLine + ' ' + $Process.ExecutablePath).Replace([char]92,[char]47)) }
$Current = $Runtime+'/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
foreach ($Service in @('auth','hr','oa','crm','workflow','gateway')) {
    $ArgsFile=$Current+'/'+$Service+'/service.args'
    if(Test-Path -LiteralPath $ArgsFile){$LiveText.Add((Get-Content -LiteralPath $ArgsFile -Raw).Replace([char]92,[char]47))}
}
if(Test-Path -LiteralPath ($Current+'/smtp.args')){$LiveText.Add((Get-Content -LiteralPath ($Current+'/smtp.args') -Raw).Replace([char]92,[char]47))}
$Tracked = @(git -C $Project ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Tracked source boundary unavailable' }
$ProtectedAncestors=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($Keep in @($Protected)+@($KeepTrees)) {
    $Ancestor=$Keep
    while($Ancestor -and $Ancestor.Length -gt 3) {
        $null=$ProtectedAncestors.Add($Ancestor)
        $Ancestor=[IO.Path]::GetDirectoryName($Ancestor).Replace([char]92,[char]47)
    }
}
function Is-ArchivedReferenceLog([string]$Path) {
    if (-not $Path.StartsWith($Current+'/',[StringComparison]::OrdinalIgnoreCase)) { return $false }
    $Relative=$Path.Substring($Current.Length+1)
    if ($Relative -match '^(auth|hr|oa|crm|workflow|gateway)/(?:(stdout|stderr)-before-[a-f0-9]{32}|[a-f0-9]{32}-(stdout|stderr))\.log$') { return $true }
    if ($Relative -match '^(auth|hr|oa|crm|workflow|gateway)/logs/[^/]*(\d{4}-\d{2}-\d{2})[^/]*\.log$') {
        $LogDate=[datetime]::MinValue
        return [datetime]::TryParseExact($Matches[2],'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$LogDate) -and $LogDate -lt (Get-Date).Date
    }
    return $false
}
function Is-RuntimeSnapshot([string]$Path) {
    if (-not $Path.StartsWith($Current+'/',[StringComparison]::OrdinalIgnoreCase)) { return $false }
    $Relative=$Path.Substring($Current.Length+1)
    return $Relative -match '^(auth|hr|oa|crm|workflow|gateway)/(service|integration)-before-[^/]+$' -or
        $Relative -match '^smtp-before-[a-f0-9]{32}\.args$' -or
        $Relative -match '^(mysql|redis)\.(stdout|stderr)-before-[a-f0-9]{32}\.log$'
}
function Is-Protected([string]$Path) {
    if($ProtectedAncestors.Contains($Path)){return $true}
    $ArchivedLogException=$Phase -eq 'ReferenceLogs' -and (Is-ArchivedReferenceLog $Path)
    $RuntimeSnapshotException=$Phase -eq 'RuntimeSnapshots' -and (Is-RuntimeSnapshot $Path)
    $Ancestor=$Path
    while($Ancestor -and $Ancestor.Length -gt 3){
        if($KeepTrees.Contains($Ancestor) -and -not ($ArchivedLogException -or $RuntimeSnapshotException)){return $true}
        $Ancestor=[IO.Path]::GetDirectoryName($Ancestor).Replace([char]92,[char]47)
    }
    foreach ($Text in $LiveText) { if ($Text.IndexOf($Path,[StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true } }
    return $false
}
$Candidates = [Collections.Generic.List[string]]::new()
switch ($Phase) {
    'Runs' { foreach ($Directory in Get-ChildItem -LiteralPath ($Runtime+'/batch-g-integration') -Directory) { if ($Directory.Name -match '^[a-f0-9]{32}$') { $Candidates.Add((Normalize $Directory.FullName)) } } }
    'Evidence' {
        foreach ($Entry in Get-ChildItem -LiteralPath $Evidence -Force) {
            if ($Entry.Name -like 'f5-*' -or $Entry.Name -like 'a1-*' -or $Entry.Name -like '*20261016*' -or $Entry.Name -like '*backend-r183*' -or $Entry.Name -like '*frontend-r133*') { continue }
            $Candidates.Add((Normalize $Entry.FullName))
        }
    }
    'Caches' {
        foreach ($Name in @('h3-core-artifacts','h3-commission-artifacts','h3-performance-artifacts')) {
            $Location = $Cache+'/'+$Name
            if (-not (Test-Path -LiteralPath $Location)) { continue }
            foreach ($Service in Get-ChildItem -LiteralPath $Location -Directory) { foreach ($Version in Get-ChildItem -LiteralPath $Service.FullName -Force) { $Candidates.Add((Normalize $Version.FullName)) } }
        }
    }
    'Legacy' {
        foreach ($Path in @(
            '.codex-temp/mysql-demo-seed-20260901',
            '.cloudflow-runtime/batch-f-validation','.cloudflow-runtime/batch-f-rehearsal',
            '.cloudflow-runtime/workflow-agent-db','.cloudflow-runtime/d2-natural-daily',
            '.cloudflow-runtime/d4-natural-reminder','.cloudflow-runtime/batch-f-runtime',
            '.cloudflow-runtime/batch-e-runtime','.cloudflow-runtime/milestone-de-20260912',
            '.cloudflow-runtime/batch-h-20260914','.cloudflow-runtime/hr-advance-ledger',
            '.cloudflow-runtime/im-binding-ui','.cloudflow-runtime/im-sync-ui',
            '.cloudflow-runtime/chart-ui','.cloudflow-runtime/report-ui',
            '.cloudflow-runtime/hr-crm-availability-ui','.cloudflow-runtime/im-login-ui',
            '.cloudflow-runtime/auth-initialization-ui','.cloudflow-runtime/im-config-ui',
            '.cloudflow-runtime/tenant-package-ui','.cloudflow-runtime/chart-consumers',
            '.cloudflow-runtime/tenant-navigation-ui','.cloudflow-runtime/im-todo-page-ui',
            '.cloudflow-runtime/im-todo-management-ui'
        )) { $Candidates.Add((Normalize $Path)) }
    }
    'Logs' {
        foreach ($Location in @(($Runtime+'/logs'),($Project+'/cloudflow-backend/cloudflow-service-workflow/logs'))) {
            if (Test-Path -LiteralPath $Location) {
                foreach ($File in Get-ChildItem -LiteralPath $Location -File -Force) {
                    if ($File.LastWriteTime -lt [datetime]'2026-10-01' -and $File.Extension -eq '.log') { $Candidates.Add((Normalize $File.FullName)) }
                }
            }
        }
    }
    'ReferenceLogs' {
        foreach ($Service in @('auth','hr','oa','crm','workflow','gateway')) {
            foreach ($Location in @(($Current+'/'+$Service),($Current+'/'+$Service+'/logs'))) {
                if (-not (Test-Path -LiteralPath $Location)) { continue }
                foreach ($File in Get-ChildItem -LiteralPath $Location -File -Force) {
                    $Path=Normalize $File.FullName
                    if ($File.LastWriteTime -lt (Get-Date).Date -and (Is-ArchivedReferenceLog $Path)) { $Candidates.Add($Path) }
                }
            }
        }
    }
    'RuntimeSnapshots' {
        foreach ($File in Get-ChildItem -LiteralPath $Current -Recurse -File -Force) {
            $Path=Normalize $File.FullName
            if (Is-RuntimeSnapshot $Path -and $File.LastWriteTime -lt (Get-Date).Date) { $Candidates.Add($Path) }
        }
    }
    'Residual' {
        foreach ($Directory in Get-ChildItem -LiteralPath ($Runtime+'/full-prd-20260915') -Directory -Force) {
            if ($Directory.Name -match '^form-browser-[0-9]{13}$') { $Candidates.Add((Normalize $Directory.FullName)) }
        }
        foreach ($Name in @('full-before-schema-repair-20260905-180043.sql','sys_dept-backup-20260905-113323.sql')) { $Candidates.Add($Runtime+'/'+$Name) }
        foreach ($Location in @(($Project+'/.codex-temp'),($Project+'/.codex-runtime'),($Project+'/.codex-run-logs'))) {
            if (-not (Test-Path -LiteralPath $Location)) { continue }
            foreach ($File in Get-ChildItem -LiteralPath $Location -File -Recurse -Force) {
                if ($File.LastWriteTime -lt [datetime]'2026-10-01' -and $File.Extension -in @('.log','.out','.err','.png','.jpg','.jpeg','.webp')) { $Candidates.Add((Normalize $File.FullName)) }
            }
        }
    }
    'OccupiedResidual' {
        foreach ($Entry in (Get-Content -LiteralPath ($Audit+'/active-log-owners.json') -Raw|ConvertFrom-Json)) {
            if (@($Entry.owners).Count -eq 0 -and (Split-Path -Leaf $Entry.path) -in @('inputs.json','result.json','terminal-receipt.json')) { $Candidates.Add((Normalize $Entry.path)) }
        }
    }
    'Investigation' { foreach ($Name in @('references-index.json','processes-private.json')) { $Candidates.Add($Audit+'/'+$Name) } }
}
$Selected = @($Candidates | Where-Object { (Test-Path -LiteralPath $_) -and -not (Is-Protected $_) })
$Docs = @(Get-ChildItem -LiteralPath ($Project+'/docs/design') -Filter '*.md' -File | ForEach-Object { [pscustomobject]@{Path=$_.FullName;Text=(Get-Content -LiteralPath $_.FullName -Raw);Matched=$false} })
foreach ($Path in $Selected) {
    $Leaf = Split-Path -Leaf $Path
    foreach ($Doc in $Docs) { if ($Doc.Text -and $Doc.Text.Contains($Leaf,[StringComparison]::OrdinalIgnoreCase)) { $Doc.Matched=$true } }
}
$Before = (Get-PSDrive D).Free
$Completed = [Collections.Generic.List[object]]::new()
$Skipped = [Collections.Generic.List[object]]::new()
$Started = Get-Date -Format o
if ($Apply) {
    Add-Content -LiteralPath $Record -Encoding utf8 -Value ([Environment]::NewLine+"阶段 $Phase 开始于 $Started，计划清理 $($Selected.Count) 个过期目标；逐项完成数与实际空间增量以阶段结束记录为准，历史路径只表示当时执行位置。")
    foreach ($Doc in $Docs | Where-Object Matched) {
        if ($Doc.Path -eq $Record -or $Doc.Text.Contains('2026-10-16过期产物清理约定')) { continue }
        Add-Content -LiteralPath $Doc.Path -Encoding utf8 -Value ([Environment]::NewLine+'2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。')
    }
}
foreach ($Path in $Selected) {
    try {
        if (-not ($Path.StartsWith($Project+'/',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($Cache+'/',[StringComparison]::OrdinalIgnoreCase))) { throw 'Target outside project/cache' }
        if (Is-Protected $Path) { throw 'Current dependency protected' }
        if ($Path.StartsWith($Project+'/',[StringComparison]::OrdinalIgnoreCase)) {
            $Relative=$Path.Substring($Project.Length+1)
            foreach ($File in $Tracked) { if ($File -eq $Relative -or $File.StartsWith($Relative+'/',[StringComparison]::OrdinalIgnoreCase)) { throw 'Tracked source protected' } }
        }
        $Ancestor = Get-Item -LiteralPath $Path -Force
        while ($Ancestor) { if ($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected ancestor protected' }; $Ancestor=$Ancestor.Parent }
        $Entry=Get-Item -LiteralPath $Path -Force
        $Entries=if($Entry.PSIsContainer){@(Get-ChildItem -LiteralPath $Path -Recurse -Force)}else{@($Entry)}
        if (@($Entries|Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Redirected descendant protected' }
        $Files=@($Entries|Where-Object {-not $_.PSIsContainer})
        foreach ($DatabaseFile in $Files | Where-Object Name -eq 'ibdata1') { $Stream=[IO.File]::Open($DatabaseFile.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); $Stream.Dispose() }
        if ($Phase -in @('Logs','ReferenceLogs','Residual','OccupiedResidual')) { foreach ($LogFile in $Files) { $Stream=[IO.File]::Open($LogFile.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); $Stream.Dispose() } }
        $Bytes=[long]($Files|Measure-Object Length -Sum).Sum
        if($Completed.Count % 25 -eq 0 -or $Phase -in @('Runs','Legacy') -or @($Files|Where-Object Name -eq 'ibdata1').Count){$FreshProcesses=@(Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -ne $PID})}
        $Leaf=Split-Path -Leaf $Path
        foreach ($Process in $FreshProcesses) {
            $Text=($Process.CommandLine+' '+$Process.ExecutablePath).Replace([char]92,[char]47)
            if ($Text.IndexOf($Path,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or ($Phase -eq 'Runs' -and $Text.Contains($Leaf,[StringComparison]::OrdinalIgnoreCase))) { throw 'Active process protected' }
        }
        if ($Apply) { Remove-Item -LiteralPath $Path -Recurse -Force; if(Test-Path -LiteralPath $Path){throw 'Deletion incomplete'} }
        $Completed.Add([pscustomobject]@{path=$Path;files=$Files.Count;logicalBytes=$Bytes;deleted=[bool]$Apply})
        if($Completed.Count % 100 -eq 0) { Write-Output ("CLEANUP_PROGRESS phase=$Phase completed=$($Completed.Count)/$($Selected.Count) freeBytes=$((Get-PSDrive D).Free)") }
    } catch { $Skipped.Add([pscustomobject]@{path=$Path;reason=$_.Exception.Message}); Write-Output ("CLEANUP_SKIPPED phase=$Phase path=$Path reason=$($_.Exception.Message)") }
}
$After=(Get-PSDrive D).Free
$Summary=[pscustomobject]@{phase=$Phase;applied=[bool]$Apply;started=$Started;finished=(Get-Date -Format o);selected=$Selected.Count;completed=$Completed.Count;skipped=@($Skipped);files=[long]($Completed|Measure-Object files -Sum).Sum;logicalBytes=[long]($Completed|Measure-Object logicalBytes -Sum).Sum;beforeFreeBytes=$Before;afterFreeBytes=$After;observedFreeDeltaBytes=$After-$Before;spaceAttribution='Observed concurrent disk change; not exclusive project savings';targets=@($Completed)}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($Audit+'/development-'+$Phase.ToLowerInvariant()+'-'+$(if($Apply){'applied'}else{'plan'})+'.json') -Encoding utf8
if($Apply){Add-Content -LiteralPath $Record -Encoding utf8 -Value ([Environment]::NewLine+"阶段 $Phase 实际完成 $($Completed.Count) 个目标、$($Summary.files) 个文件，逻辑大小 $($Summary.logicalBytes) 字节；磁盘可用空间由 $Before 增至 $After 字节，同期净增加 $($After-$Before) 字节；跳过 $($Skipped.Count) 个受保护或检查未通过目标。")}
$Summary|Select-Object phase,applied,selected,completed,files,logicalBytes,beforeFreeBytes,afterFreeBytes,observedFreeDeltaBytes,@{n='skipped';e={$_.skipped.Count}}|ConvertTo-Json -Compress
if($Skipped.Count){exit 2}
