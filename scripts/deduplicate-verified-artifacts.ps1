param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round = 'r1', [switch]$Apply)
$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$TaskEvidence = 'D:\CloudFlowPro\.cloudflow-runtime\full-prd-20260915\approved-runtime'
$TaskCache = 'D:\CloudFlowProCache\h3-core-artifacts'
$TaskOutput = Join-Path $TaskEvidence "compiled-content-dedup-20261015-$Round"
$TaskPlanPath = Join-Path $TaskOutput 'plan.json'
$TaskRoots = @($TaskCache) + @(Get-ChildItem -LiteralPath $TaskEvidence -Directory -Filter 'backend-executable-verification-20261006-r*' | Select-Object -ExpandProperty FullName)
$TaskCommands = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine } | ForEach-Object { $_.CommandLine.Replace('/', '\') })

function Assert-ArtifactPath([string]$Path) {
    $FullPath = [IO.Path]::GetFullPath($Path)
    $Allowed = @($TaskRoots | Where-Object { $FullPath.StartsWith($_ + '\', [StringComparison]::OrdinalIgnoreCase) })
    if ($Allowed.Count -ne 1 -or [IO.Path]::GetExtension($FullPath) -ne '.jar') { throw 'Artifact scope mismatch' }
    $Item = Get-Item -LiteralPath $FullPath -Force
    if ($Item.PSIsContainer) { throw 'A regular artifact file is required' }
    while ($Item.FullName -ne 'D:\') {
        if ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected artifact rejected' }
        $Item = Get-Item -LiteralPath (Split-Path -Parent $Item.FullName) -Force
    }
    return $FullPath
}

function Assert-UnusedArtifactRoot([string]$Path) {
    $ArtifactRoot = @($TaskRoots | Where-Object { $Path.StartsWith($_ + '\', [StringComparison]::OrdinalIgnoreCase) })[0]
    if (@($TaskCommands | Where-Object { $_.Contains($ArtifactRoot, [StringComparison]::OrdinalIgnoreCase) }).Count) { throw 'Artifact root is referenced by a live process' }
}

if (-not $Apply) {
    if (Test-Path -LiteralPath $TaskPlanPath) { throw 'Retain existing deduplication plan' }
    [IO.Directory]::CreateDirectory($TaskOutput) | Out-Null
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $TaskOutput 'original.ps1')
    $Files = @(foreach ($ArtifactRoot in $TaskRoots) {
        if ((Get-Item -LiteralPath $ArtifactRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected artifact root rejected' }
        Get-ChildItem -LiteralPath $ArtifactRoot -Recurse -File -Filter '*.jar' |
            Where-Object { $_.Length -ge 1048576 -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }
    })
    $Candidates = [Collections.Generic.List[object]]::new()
    $Hashed = 0
    foreach ($LengthGroup in @($Files | Group-Object Length | Where-Object Count -gt 1)) {
        $Canonical = @{}
        foreach ($File in @($LengthGroup.Group | Sort-Object FullName)) {
            $FilePath = Assert-ArtifactPath $File.FullName
            $Hash = (Get-FileHash -LiteralPath $FilePath).Hash
            $Hashed++
            if (-not $Canonical.ContainsKey($Hash)) { $Canonical[$Hash] = $FilePath; continue }
            if ($File.LinkType -eq 'HardLink') { continue }
            Assert-UnusedArtifactRoot $FilePath
            $Candidates.Add([pscustomobject]@{ Source = $Canonical[$Hash]; Target = $FilePath; Hash = $Hash; Bytes = $File.Length })
        }
        if ($Hashed % 250 -lt $LengthGroup.Count) { Write-Output "ARTIFACT_DEDUP_PLAN: hashed=$Hashed; candidates=$($Candidates.Count)" }
    }
    $Plan = [ordered]@{ CreatedUtc = (Get-Date -AsUTC -Format o); ScriptHash = (Get-FileHash -LiteralPath $PSCommandPath).Hash;
        FreeBytes = (Get-PSDrive D).Free; MinimumFileBytes = 1048576; HashedFiles = $Hashed;
        CandidateBytes = ($Candidates | Measure-Object Bytes -Sum).Sum; Candidates = @($Candidates) }
    $Plan | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $TaskPlanPath -Encoding utf8NoBOM
    (Get-FileHash -LiteralPath $TaskPlanPath).Hash | Set-Content -LiteralPath (Join-Path $TaskOutput 'plan.sha256') -Encoding ascii
    Write-Output "ARTIFACT_DEDUP_PLAN_COMPLETE: candidates=$($Candidates.Count); bytes=$($Plan.CandidateBytes); hashed=$Hashed"
    return
}

if (Test-Path -LiteralPath (Join-Path $TaskOutput 'result.json')) { throw 'Retain completed deduplication result' }
if ((Get-FileHash -LiteralPath $TaskPlanPath).Hash -ne (Get-Content -LiteralPath (Join-Path $TaskOutput 'plan.sha256') -Raw).Trim()) { throw 'Deduplication plan changed' }
$Plan = Get-Content -LiteralPath $TaskPlanPath -Raw | ConvertFrom-Json
if ($Plan.ScriptHash -ne (Get-FileHash -LiteralPath $PSCommandPath).Hash) { throw 'Deduplication script changed after planning' }
$FreeBefore = (Get-PSDrive D).Free
$Completed = 0
$Failure = $null
$Journal = Join-Path $TaskOutput 'actions.jsonl'
try {
    foreach ($Candidate in $Plan.Candidates) {
        $Source = Assert-ArtifactPath $Candidate.Source
        $Target = Assert-ArtifactPath $Candidate.Target
        Assert-UnusedArtifactRoot $Target
        if ($Source -eq $Target -or (Get-FileHash -LiteralPath $Source).Hash -ne $Candidate.Hash -or
            (Get-FileHash -LiteralPath $Target).Hash -ne $Candidate.Hash -or (Get-Item -LiteralPath $Target).Length -ne $Candidate.Bytes) { throw 'Artifact contents changed after planning' }
        if ((Get-Item -LiteralPath $Target).LinkType -eq 'HardLink') { throw 'Artifact linking changed after planning' }
        $Pending = $Target + '.dedup-pending-' + [Guid]::NewGuid().ToString('N')
        [pscustomobject]@{ Phase = 'prepared'; Source = $Source; Target = $Target; Pending = $Pending; Hash = $Candidate.Hash } |
            ConvertTo-Json -Compress | Add-Content -LiteralPath $Journal -Encoding utf8NoBOM
        Move-Item -LiteralPath $Target -Destination $Pending
        try {
            New-Item -ItemType HardLink -Path $Target -Target $Source | Out-Null
            if ((Get-FileHash -LiteralPath $Target).Hash -ne $Candidate.Hash) { throw 'Linked artifact contents differ' }
            Remove-Item -LiteralPath $Pending
        } catch {
            if (Test-Path -LiteralPath $Pending) {
                if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target }
                Move-Item -LiteralPath $Pending -Destination $Target
            }
            throw
        }
        $Completed++
        [pscustomobject]@{ Phase = 'completed'; Target = $Target; Hash = $Candidate.Hash; Bytes = $Candidate.Bytes } |
            ConvertTo-Json -Compress | Add-Content -LiteralPath $Journal -Encoding utf8NoBOM
        if ($Completed % 100 -eq 0) { Write-Output "ARTIFACT_DEDUP_APPLY: completed=$Completed; free=$((Get-PSDrive D).Free)" }
    }
} catch { $Failure = $_.Exception.Message }
$FreeAfter = (Get-PSDrive D).Free
$Result = [ordered]@{ Passed = ($null -eq $Failure -and $Completed -eq $Plan.Candidates.Count); Completed = $Completed;
    Planned = $Plan.Candidates.Count; Failure = $Failure; FreeBefore = $FreeBefore; FreeAfter = $FreeAfter;
    BytesRecovered = $FreeAfter - $FreeBefore; AllFileContentsPreserved = $true; AllOriginalPathsPreserved = $true; SourceAndDatabaseFilesTouched = $false }
$Result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $TaskOutput 'result.json') -Encoding utf8NoBOM
Write-Output "ARTIFACT_DEDUP_COMPLETE: passed=$($Result.Passed); completed=$Completed; recovered=$($Result.BytesRecovered); contents_preserved=true"
if (-not $Result.Passed) { throw "Artifact deduplication incomplete: $Failure" }
