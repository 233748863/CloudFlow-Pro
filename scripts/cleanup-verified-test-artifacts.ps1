param(
    [ValidatePattern('^r[1-9][0-9]*$')][string]$Round = 'r1',
    [switch]$Apply,
    [switch]$IncludeStoppedRuntimeCompiled
)
$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root = 'D:\CloudFlowPro'
$Runs = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$Current = Join-Path $Runs '9799534e1a3a47b5958330f14ae16dc7'
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output = Join-Path $Evidence "verified-artifact-cleanup-20261011-$Round"
$PlanFile = Join-Path $Output 'plan.json'
$ServiceNames = @('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway')
$Candidates = [Collections.Generic.List[object]]::new()
$Retained = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
$CandidatePaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$Tracked = @(git -C $Root ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Cannot establish tracked source boundary' }

function Assert-Path([string]$Path) {
    $Full = [IO.Path]::GetFullPath($Path)
    if (-not $Full.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup target escapes workspace' }
    $Entry = Get-Item -LiteralPath $Full -Force
    while ($Entry.FullName -ne $Root) {
        if ($Entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected cleanup target rejected' }
        $Entry = Get-Item -LiteralPath (Split-Path -Parent $Entry.FullName) -Force
    }
    $Relative = [IO.Path]::GetRelativePath($Root, $Full).Replace('\', '/')
    foreach ($TrackedFile in $Tracked) {
        if ($TrackedFile -eq $Relative -or $TrackedFile.StartsWith($Relative + '/', [StringComparison]::OrdinalIgnoreCase)) { throw 'Tracked files cannot be removed' }
    }
    return $Full
}

function Retain-File([string]$Path) {
    $Full = [IO.Path]::GetFullPath($Path)
    if (-not $Retained.ContainsKey($Full)) { $Retained.Add($Full, (Get-FileHash -LiteralPath $Full).Hash) }
}

function Get-LiveArtifact([string]$Service) {
    $ArgumentsFile = Join-Path $Current "$Service/service.args"
    $Arguments = @(Get-Content -LiteralPath $ArgumentsFile)
    $Index = [Array]::IndexOf($Arguments, '-cp')
    if ($Index -lt 0 -or $Arguments[$Index + 2] -ne 'org.springframework.boot.loader.launch.JarLauncher') { throw 'Known current launch arguments required' }
    $Layer = [IO.Path]::GetFullPath($Arguments[$Index + 1].Trim('"'))
    if ((Split-Path -Parent $Layer) -ne (Join-Path $Current "$Service/artifacts")) { throw 'Current layer outside owned artifacts' }
    return $Layer
}

function Assert-Unused([object]$Candidate) {
    $Target = Assert-Path $Candidate.Path
    $Normalized = $Target.Replace('\', '/')
    $Processes = @(Get-CimInstance Win32_Process)
    if (@($Processes | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Replace('\', '/').Contains($Normalized, [StringComparison]::OrdinalIgnoreCase) }).Count) { throw 'Cleanup target has a live process' }
    if ($Candidate.Kind -eq 'stopped-compiled') {
        $StatePath = Join-Path $Runs "$($Candidate.Run)/state.json"
        $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        if ($State.status -ne 'STOPPED') { throw 'Test environment no longer stopped' }
        if (@($Processes | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($Candidate.Run, [StringComparison]::OrdinalIgnoreCase) }).Count) { throw 'Stopped environment has a live process' }
    } elseif ($Candidate.Kind -eq 'old-runtime') {
        $Live = Get-LiveArtifact $Candidate.Service
        $LiveHash = (Split-Path -Leaf $Live) -replace '-layered$', ''
        if ((Split-Path -Leaf $Target).StartsWith($LiveHash, [StringComparison]::OrdinalIgnoreCase)) { throw 'Current runtime artifact is protected' }
    } elseif ($Candidate.Kind -ne 'old-package') { throw 'Unknown cleanup category' }
    return $Target
}

function Add-Candidate([string]$Path, [string]$Kind, [string]$Run, [string]$Service, [string]$Report, [string]$ExpectedHash = '') {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $Full = Assert-Path $Path
    if (-not $CandidatePaths.Add($Full)) { return }
    $Candidate = [pscustomobject]@{ Path = $Full; Kind = $Kind; Run = $Run; Service = $Service; PassedReport = $Report; Files = @(); Bytes = 0 }
    $null = Assert-Unused $Candidate
    $Entry = Get-Item -LiteralPath $Full -Force
    $Entries = if ($Entry.PSIsContainer) { @(Get-ChildItem -LiteralPath $Full -Recurse -Force) } else { @($Entry) }
    if (@($Entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Cleanup tree contains redirected entries' }
    $Files = @($Entries | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        [pscustomobject]@{ Path = $_.FullName; Hash = (Get-FileHash -LiteralPath $_.FullName).Hash; Bytes = $_.Length }
    })
    if ($ExpectedHash -and ($Files.Count -ne 1 -or $Files[0].Hash -ne $ExpectedHash)) { throw 'Artifact differs from passed package report' }
    $Candidate.Files = $Files
    $Candidate.Bytes = [long]($Files | Measure-Object Bytes -Sum).Sum
    Retain-File $Report
    $Candidates.Add($Candidate)
    if ($Candidates.Count % 20 -eq 0) { "CLEANUP_PLANNING: targets=$($Candidates.Count); originals_preserved=true" }
}

if (-not $Apply) {
    if (Test-Path -LiteralPath $Output) { throw 'Preserve existing cleanup plan; select a new round' }
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    [IO.File]::Copy($PSCommandPath, (Join-Path $Output 'original.ps1'), $false)
    Retain-File $PSCommandPath
    Retain-File (Join-Path $Current 'state.json')
    foreach ($Service in $ServiceNames) {
        Retain-File (Join-Path $Current "$Service/service.args")
        Retain-File (Join-Path $Current "$Service/integration.properties")
        $Layer = Get-LiveArtifact $Service
        foreach ($File in Get-ChildItem -LiteralPath $Layer -Recurse -Force -File) { Retain-File $File.FullName }
        $Jar = Join-Path (Split-Path -Parent $Layer) (((Split-Path -Leaf $Layer) -replace '-layered$', '') + '.jar')
        if (Test-Path -LiteralPath $Jar) { Retain-File $Jar }
    }
    foreach ($ProtectedRound in @('r37', 'r38', 'r39')) {
        $ProtectedDirectory = Join-Path $Evidence "backend-executable-verification-20261006-$ProtectedRound"
        foreach ($File in Get-ChildItem -LiteralPath $ProtectedDirectory -Recurse -Force -File) { Retain-File $File.FullName }
    }
    foreach ($PackageNumber in 13..36) {
        $Directory = Join-Path $Evidence "backend-executable-verification-20261006-r$PackageNumber"
        $Report = Join-Path $Directory 'result.json'
        $Result = Get-Content -LiteralPath $Report -Raw | ConvertFrom-Json
        if (-not $Result.Passed -or $Result.Services.Count -ne 6 -or $Result.InputChanges -ne 0) { throw 'Completed package verification required' }
        Retain-File (Join-Path $Directory 'inputs.json')
        Retain-File (Join-Path $Directory 'original.ps1')
        foreach ($Package in $Result.Services) {
            if ($Package.Name -notin $ServiceNames -or $Package.Hash -notmatch '^[A-Fa-f0-9]{64}$' -or $Package.LayerListExit -ne 0) { throw 'Unexpected verified service artifact' }
            $ServiceDirectory = Join-Path $Directory $Package.Name
            foreach ($File in Get-ChildItem -LiteralPath $ServiceDirectory -File | Where-Object Extension -NE '.jar') { Retain-File $File.FullName }
            $Jar = Join-Path $ServiceDirectory (Split-Path -Leaf $Package.Path)
            Add-Candidate $Jar 'old-package' '' $Package.Name $Report $Package.Hash
            if ($Package.Extracted) { Add-Candidate (Join-Path $ServiceDirectory 'extracted') 'old-package' '' $Package.Name $Report }
            $Hash = $Package.Hash.ToLowerInvariant()
            $LiveHash = (Split-Path -Leaf (Get-LiveArtifact $Package.Name)) -replace '-layered$', ''
            if ($Hash -eq $LiveHash) { continue }
            $ArtifactDirectory = Join-Path $Current "$($Package.Name)/artifacts"
            Add-Candidate (Join-Path $ArtifactDirectory "$Hash.jar") 'old-runtime' '' $Package.Name $Report $Package.Hash
            Add-Candidate (Join-Path $ArtifactDirectory "$Hash-layered") 'old-runtime' '' $Package.Name $Report
        }
    }
    foreach ($Directory in $(if ($IncludeStoppedRuntimeCompiled) { Get-ChildItem -LiteralPath $Runs -Directory })) {
        $StatePath = Join-Path $Directory.FullName 'state.json'
        if (-not (Test-Path -LiteralPath $StatePath)) { continue }
        $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        if ($State.status -ne 'STOPPED') { continue }
        $Reports = @(Get-ChildItem -LiteralPath $Directory.FullName -File -Filter '*results*.json')
        $Passed = @($Reports | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json).passed -eq $true })
        $Failed = @($Reports | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json).passed -eq $false })
        if (-not $Passed.Count -or $Failed.Count) { continue }
        Retain-File $StatePath
        foreach ($Report in $Reports) { Retain-File $Report.FullName }
        foreach ($Service in $ServiceNames) {
            Add-Candidate (Join-Path $Directory.FullName "$Service/artifacts") 'stopped-compiled' $Directory.Name $Service $Passed[0].FullName
        }
        Add-Candidate (Join-Path $Directory.FullName 'fixture-classes') 'stopped-compiled' $Directory.Name '' $Passed[0].FullName
    }
    $RetainedRows = @($Retained.GetEnumerator() | ForEach-Object { [pscustomobject]@{ Path = $_.Key; Hash = $_.Value } })
    foreach ($Candidate in $Candidates) {
        foreach ($Row in $RetainedRows) {
            if ($Row.Path -eq $Candidate.Path -or $Row.Path.StartsWith($Candidate.Path + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate overlaps retained files' }
        }
    }
    [pscustomobject]@{ CreatedUtc = [DateTime]::UtcNow.ToString('o'); FreeBytes = (Get-PSDrive -Name D).Free; ExpiredPackageRounds = @(13..36); ProtectedPackageRounds = @('r37', 'r38', 'r39'); StoppedRuntimeCompiledIncluded = [bool]$IncludeStoppedRuntimeCompiled; Targets = @($Candidates); Retained = $RetainedRows } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $PlanFile -Encoding utf8NoBOM
    $Plan = Get-Content -LiteralPath $PlanFile -Raw | ConvertFrom-Json
    "CLEANUP_PLAN_READY: targets=$($Plan.Targets.Count); files=$(($Plan.Targets.Files | Measure-Object).Count); bytes=$(($Plan.Targets | Measure-Object Bytes -Sum).Sum); protected_files=$($Plan.Retained.Count); deleted=0"
    exit 0
}

if (-not (Test-Path -LiteralPath $PlanFile) -or (Test-Path -LiteralPath (Join-Path $Output 'result.json'))) { throw 'An unapplied reviewed plan is required' }
$Plan = Get-Content -LiteralPath $PlanFile -Raw | ConvertFrom-Json
foreach ($Row in $Plan.Retained) { if ((Get-FileHash -LiteralPath $Row.Path).Hash -ne $Row.Hash) { throw 'Protected input changed since planning' } }
$BeforeFree = (Get-PSDrive -Name D).Free
$Deleted = [Collections.Generic.List[object]]::new()
foreach ($Candidate in $Plan.Targets) {
    $Target = Assert-Unused $Candidate
    $Relative = [IO.Path]::GetRelativePath($Root, $Target).Replace('\', '/')
    $Allowed = switch ($Candidate.Kind) {
        'old-package' { $Relative -match '^\.cloudflow-runtime/full-prd-20260915/approved-runtime/backend-executable-verification-20261006-r(?:1[3-9]|2[0-9]|3[0-6])/(?:auth|hr|oa|crm|workflow|gateway)/(?:cloudflow-[A-Za-z0-9.-]+\.jar|extracted)$' }
        'old-runtime' { $Relative -match '^\.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/(?:auth|hr|oa|crm|workflow|gateway)/artifacts/[a-f0-9]{64}(?:\.jar|-layered)$' }
        'stopped-compiled' { $Relative -match '^\.cloudflow-runtime/batch-g-integration/[a-f0-9]{32}/(?:(?:auth|hr|oa|crm|workflow|gateway)/artifacts|fixture-classes)$' }
        default { $false }
    }
    if (-not $Allowed) { throw 'Target does not match cleanup whitelist' }
    $Entry = Get-Item -LiteralPath $Target -Force
    $Entries = if ($Entry.PSIsContainer) { @(Get-ChildItem -LiteralPath $Target -Recurse -Force) } else { @($Entry) }
    if (@($Entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Target was redirected since planning' }
    $Files = @($Entries | Where-Object { -not $_.PSIsContainer })
    if ($Files.Count -ne $Candidate.Files.Count -or @($Files | Where-Object { $_.FullName -notin $Candidate.Files.Path }).Count) { throw 'Cleanup file set changed' }
    foreach ($File in $Candidate.Files) { if ((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.Hash) { throw 'Cleanup file changed' } }
    $null = Assert-Unused $Candidate
    Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $Target) { throw 'Cleanup target still exists' }
    $Deleted.Add([pscustomobject]@{ Path = $Relative; Files = $Files.Count; Bytes = $Candidate.Bytes; PassedReport = $Candidate.PassedReport })
    $Deleted[$Deleted.Count - 1] | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $Output 'deleted.jsonl') -Encoding utf8NoBOM
    if ($Deleted.Count % 20 -eq 0) { "CLEANUP_APPLYING: targets=$($Deleted.Count); free_bytes=$((Get-PSDrive -Name D).Free)" }
}
foreach ($Row in $Plan.Retained) { if ((Get-FileHash -LiteralPath $Row.Path).Hash -ne $Row.Hash) { throw 'Retained evidence or live runtime changed' } }
$State = Get-Content -LiteralPath (Join-Path $Current 'state.json') -Raw | ConvertFrom-Json
foreach ($Service in $State.services) { if ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -ne 'UP') { throw 'Service health changed during cleanup' } }
$AfterFree = (Get-PSDrive -Name D).Free
[pscustomobject]@{ Passed = $true; Targets = $Deleted.Count; DeletedFiles = ($Deleted | Measure-Object Files -Sum).Sum; DeletedLogicalBytes = ($Deleted | Measure-Object Bytes -Sum).Sum; BeforeFreeBytes = $BeforeFree; AfterFreeBytes = $AfterFree; FreedBytes = $AfterFree - $BeforeFree; RetainedFiles = $Plan.Retained.Count; RetainedChanges = 0; HealthyServices = 6; SourceRemoved = $false; ReportsRemoved = $false; ScreenshotsRemoved = $false; DatabasesRemoved = $false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"CLEANUP_COMPLETE: targets=$($Deleted.Count); freed_bytes=$($AfterFree-$BeforeFree); free_bytes=$AfterFree; retained_changes=0; healthy_services=6"
