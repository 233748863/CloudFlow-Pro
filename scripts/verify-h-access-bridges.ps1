param([switch]$KeepArtifacts)

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Workspace 'cloudflow-backend'
$Scratch = Join-Path ([IO.Path]::GetTempPath()) ('h-access-bridges-' + [Guid]::NewGuid().ToString('N'))
$Succeeded = $false
$Selections = @(
    @{ Module = 'cloudflow-service-workflow'; Check = 'WorkflowDraftReferenceChecks'; Source = 'workflow-checks/WorkflowDraftReferenceChecks.java'; Classpaths = @('batch-h-classpath.txt', 'batch-g-classpath.txt', 'batch-d-workflow-classpath.txt') },
    @{ Module = 'cloudflow-auth'; Check = 'ConsumableRuleBridgeChecks'; Source = 'platform-checks/ConsumableRuleBridgeChecks.java'; Classpaths = @('im-classpath.txt', 'batch-h-classpath.txt', 'batch-g-classpath.txt', 'batch-f-classpath.txt') },
    @{ Module = 'cloudflow-auth'; Check = 'HrRuleBridgeChecks'; Source = 'platform-checks/HrRuleBridgeChecks.java'; Classpaths = @('im-classpath.txt', 'batch-h-classpath.txt', 'batch-g-classpath.txt', 'batch-f-classpath.txt') },
    @{ Module = 'cloudflow-auth'; Check = 'HrLeaveRuleBridgeChecks'; Source = 'platform-checks/HrLeaveRuleBridgeChecks.java'; Classpaths = @('im-classpath.txt', 'batch-h-classpath.txt', 'batch-g-classpath.txt', 'batch-f-classpath.txt') },
    @{ Module = 'cloudflow-auth'; Check = 'ProjectRuleBridgeChecks'; Source = 'platform-checks/ProjectRuleBridgeChecks.java'; Classpaths = @('im-classpath.txt', 'batch-h-classpath.txt', 'batch-g-classpath.txt', 'batch-f-classpath.txt') },
    @{ Module = 'cloudflow-service-hr'; Check = 'HrLeaveRuleClientChecks'; Source = 'hr-checks/HrLeaveRuleClientChecks.java'; Classpaths = @('batch-g-classpath.txt', 'batch-h-classpath.txt', 'approved-runtime-classpath.txt', 'batch-d-classpath.txt') },
    @{ Module = 'cloudflow-service-hr'; Check = 'HrLeaveOwnerReadChecks'; Source = 'hr-checks/HrLeaveOwnerReadChecks.java'; Classpaths = @('batch-g-classpath.txt', 'batch-h-classpath.txt', 'approved-runtime-classpath.txt', 'batch-d-classpath.txt') },
    @{ Module = 'cloudflow-service-hr'; Check = 'HrLeaveEncashmentComponentChecks'; Source = 'hr-checks/HrLeaveEncashmentComponentChecks.java'; Classpaths = @('batch-g-classpath.txt', 'batch-h-classpath.txt', 'approved-runtime-classpath.txt', 'batch-d-classpath.txt') }
)

function ConvertTo-JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}

function Get-SourceFingerprint([string[]]$Paths) {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $Entries = foreach ($SourcePath in ($Paths | Sort-Object -Unique)) {
            $SourcePath + ':' + (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash
        }
        return [BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($Entries -join [char]10)))).Replace('-', '').ToLowerInvariant()
    } finally {
        $Hasher.Dispose()
    }
}

try {
    $Java = (Get-Command java -ErrorAction Stop).Source
    $Javac = (Get-Command javac -ErrorAction Stop).Source
    $Dependencies = @()
    $ClasspathFiles = @()
    $ModuleRoots = @()
    $TestSources = @()
    foreach ($Selection in $Selections) {
        $ModuleRoot = Join-Path $Backend $Selection.Module
        $ModuleRoots += $ModuleRoot
        $DependencyFile = $null
        foreach ($Candidate in $Selection.Classpaths) {
            $CandidatePath = Join-Path $ModuleRoot ('target/' + $Candidate)
            if (Test-Path -LiteralPath $CandidatePath -PathType Leaf) { $DependencyFile = $CandidatePath; break }
        }
        if (-not $DependencyFile) { throw ('Missing existing dependency list for ' + $Selection.Module + '; this script never builds dependencies') }
        $ClasspathFiles += $DependencyFile
        $Dependencies += (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
        $TestSources += Join-Path $PSScriptRoot $Selection.Source
    }
    $Dependencies = @($Dependencies | Where-Object { $_ } | Sort-Object -Unique)
    foreach ($RequiredFile in @($Dependencies) + @($TestSources)) {
        if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) { throw ('Missing existing dependency or check source: ' + $RequiredFile) }
        if ([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($RequiredFile)) -ne [IO.Path]::GetPathRoot($Workspace)) { throw 'Access bridge inputs must remain on the workspace drive' }
    }
    $DependencyNames = @($Dependencies | ForEach-Object { [IO.Path]::GetFileName($_) })
    foreach ($Module in (Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory)) {
        $Prefix = $Module.Name + '-'
        if (@($DependencyNames | Where-Object { $_.StartsWith($Prefix, [StringComparison]::Ordinal) }).Count -gt 0) {
            $ModuleRoots += $Module.FullName
        }
    }
    $SourceRoots = @()
    $ResourceRoots = @()
    $CompileSources = @($TestSources)
    $FingerprintPaths = @($PSCommandPath) + @($ClasspathFiles) + @($TestSources)
    foreach ($ModuleRoot in ($ModuleRoots | Sort-Object -Unique)) {
        $SourceRoot = Join-Path $ModuleRoot 'src/main/java'
        if (Test-Path -LiteralPath $SourceRoot -PathType Container) {
            $SourceRoots += $SourceRoot
            $ModuleSources = @(Get-ChildItem -LiteralPath $SourceRoot -Filter '*.java' -Recurse -File | Select-Object -ExpandProperty FullName)
            $CompileSources += $ModuleSources
            $FingerprintPaths += $ModuleSources
        }
        $ResourceRoot = Join-Path $ModuleRoot 'src/main/resources'
        if (Test-Path -LiteralPath $ResourceRoot -PathType Container) {
            $ResourceRoots += $ResourceRoot
            $MapperRoot = Join-Path $ResourceRoot 'mapper'
            if (Test-Path -LiteralPath $MapperRoot -PathType Container) {
                $FingerprintPaths += @(Get-ChildItem -LiteralPath $MapperRoot -Filter '*.xml' -Recurse -File | Select-Object -ExpandProperty FullName)
            }
        }
    }
    $FingerprintPaths += Join-Path $Backend 'DB/03.cloudflow-hr.sql'
    $Fingerprint = Get-SourceFingerprint $FingerprintPaths
    $Classes = Join-Path $Scratch 'classes'
    $Generated = Join-Path $Scratch 'generated'
    [IO.Directory]::CreateDirectory($Classes) | Out-Null
    [IO.Directory]::CreateDirectory($Generated) | Out-Null
    $CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-Xprefer:source',
        '-sourcepath', (ConvertTo-JavaArgument ($SourceRoots -join [IO.Path]::PathSeparator)),
        '-cp', (ConvertTo-JavaArgument ($Dependencies -join [IO.Path]::PathSeparator)),
        '-d', (ConvertTo-JavaArgument $Classes), '-s', (ConvertTo-JavaArgument $Generated))
    $CompileArguments += @($CompileSources | Sort-Object -Unique | ForEach-Object { ConvertTo-JavaArgument $_ })
    $CompileFile = Join-Path $Scratch 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
    $LogConfiguration = Join-Path $Scratch 'logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender"><encoder><pattern>%level %logger - %msg%n</pattern></encoder></appender><root level="ERROR"><appender-ref ref="STDOUT"/></root></configuration>', [Text.UTF8Encoding]::new($false))
    $RuntimeClasspath = (@($Classes) + @($ResourceRoots) + @($Dependencies)) -join [IO.Path]::PathSeparator
    Write-Output ('H access bridges: offline; compiling latest ' + $CompileSources.Count + ' sources into independent temporary storage; target/classes is not used.')
    Push-Location $Scratch
    try {
        & $Javac "@$CompileFile"
        if ($LASTEXITCODE -ne 0) { throw 'Independent access bridge compilation failed' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during compilation; rerun against a stable source snapshot' }
        foreach ($Selection in $Selections) {
            $RunArguments = @(('-Dlogback.configurationFile=' + (ConvertTo-JavaArgument $LogConfiguration)),
                ('-Djava.io.tmpdir=' + (ConvertTo-JavaArgument $Scratch)), '-cp', (ConvertTo-JavaArgument $RuntimeClasspath),
                $Selection.Check, (ConvertTo-JavaArgument $Workspace))
            $RunFile = Join-Path $Scratch ($Selection.Check + '.args')
            [IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
            & $Java "@$RunFile"
            if ($LASTEXITCODE -ne 0) { throw ($Selection.Check + ' failed; no business sources or runtime state were changed') }
        }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during checks; rerun before accepting these results' }
        Write-Output ('H access bridges: stable source SHA256=' + $Fingerprint + '; no Maven, target writes, service restarts or online requests.')
        $Succeeded = $true
    } finally {
        Pop-Location
    }
} finally {
    if (Test-Path -LiteralPath $Scratch -PathType Container) {
        if ($Succeeded -and -not $KeepArtifacts) {
            $ResolvedScratch = (Resolve-Path -LiteralPath $Scratch).ProviderPath
            $TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
            if (-not $ResolvedScratch.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -or
                    (Split-Path -Leaf $ResolvedScratch) -notmatch '^h-access-bridges-[a-f0-9]{32}$' -or
                    -not $ResolvedScratch.Equals([IO.Path]::GetFullPath($Scratch), [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Unsafe temporary cleanup target'
            }
            Remove-Item -LiteralPath $ResolvedScratch -Recurse -Force
        } else {
            Write-Output ('H access bridges: credential-free compiler artifacts retained at ' + $Scratch)
        }
    }
}
