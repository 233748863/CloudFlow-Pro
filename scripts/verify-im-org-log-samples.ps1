param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$SyncPreview, [switch]$SyncWrite, [switch]$SessionFence, [switch]$SyncEffects, [switch]$Preservation, [switch]$Runner, [switch]$SyncExecute, [switch]$SyncSchedule, [switch]$Login, [switch]$BindingIdentity, [switch]$BindingFlow, [switch]$Messages, [switch]$Callbacks, [switch]$TodoCards, [string[]]$EvidenceFiles)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running isolated environment required' }
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Samples = @('unused-provider-key-never-log','app-secret-never-log','callbackTokenNeverLog',('A' * 43),
    'config-test-access-token-never-log','replacement-secret-never-log','private-storage-detail-never-log',
    'private-provider-detail-never-log',('im-config-test-key-' + ('K' * 48)), 'org-private-test-token',
    'private-Ada', 'private-Bob', 'private-perf-', 'private@example.test', '13900000000', 'private-department-',
    'https://wework.qpic.cn/private-avatar', ('snapshot-check-key-' + ('K' * 40)), ('other-snapshot-key-' + ('L' * 40)))
if ($Login) {
    $Samples += @('private-release', 'sensitive-redis-failure', 'Exact.Member', 'unusable-fixture-hash', 'private-test-code', 'controlled-provider-code')
    $Properties = [IO.File]::ReadAllText((Join-Path $Run 'auth/integration.properties'))
    $Key = [regex]::Match($Properties, '(?m)^cloudflow\.auth\.totp\.encryption-key=([^\r\n]+)')
    if ($Key.Success) { $Samples += $Key.Groups[1].Value }
}
if ($BindingIdentity) { $Samples += @('controlled-binding-audit-failure', 'independent-test-stamp') }
if ($BindingFlow) { $Samples += @('Bind.Member', 'Bind.Peer', 'binding-provider-private-secret', 'controlled-bind-code', 'controlled-binding-write-audit-failure', 'binding-malformed-private-value') }
if ($Messages) { $Samples += @('message-private-access-token', 'message-private-content', 'message-app-secret', ('message-im-key-' + ('K' * 48)), 'Mapped.Member') }
if ($Callbacks) { $Samples += @('callback-member-private', ('k' * 43), 'callback-secret-private', 'callbackTokenPrivate', 'replacement-response-private', 'response-private', 'callback-echo-private', 'callback-limit-private-failure', 'untrusted-browser-context', 'forged-local-context') }
if ($TodoCards) { $Samples += @('private-im-response-code-never-log', 'private-card-access-token', 'card-secret-private',
    'private-todo-response', 'callback-private-recovered-receipt', 'another-private-code', 'permitted-value') }
if ($SyncPreview) {
    $Samples += @('13988000000', 'preview-0@example.test', 'https://wework.qpic.cn/preview-private-0',
        'provider-private-detail-never-log', 'storage-private-detail-never-log', ('im-preview-checks-' + ('K' * 48)))
}
if ($SyncWrite) {
    $Samples += @('writer-a@example.test', '13988002222', 'salary-cipher-fixture', 'local-dept@example.test', 'unchanged-local-hash')
}
if ($SessionFence) {
    $Samples += @('session-fixture-hash', 'controlled-session-policy-unavailable')
}
if ($Preservation) {
    $Samples += @('13988003333', '13988004444', '13988009999', 'preserved@example.test', 'returned@example.test',
        'outside@example.test', 'local-avatar-fixture', 'local-mapping-avatar', 'https://wework.qpic.cn/returned')
}
if ($SyncExecute) {
    $Samples += @('13977000000', 'execute-0@example.test', 'execute-private-access-token', 'controlled-bulk-delete-failure')
}
$Files = @(Get-ChildItem -LiteralPath $Evidence -File | Where-Object {
    ($_.Name -like 'g4-im-org-*.log' -or $_.Name -like 'g4-im-install-*-org-*.log' -or
        ($SyncPreview -and ($_.Name -like 'g4-im-preview-*.log' -or $_.Name -like 'g4-im-install-*-preview-*.log')) -or
        ($SyncWrite -and ($_.Name -like 'g4-im-apply-*.log' -or $_.Name -like 'g4-im-install-*-apply-*.log')) -or
        ($SessionFence -and ($_.Name -like 'g4-im-session-fence-*.log' -or $_.Name -like 'g4-im-install-*-session-fence-*.log')) -or
        ($SyncEffects -and ($_.Name -like 'g4-im-effects-*.log' -or $_.Name -like 'g4-im-install-*-effects-*.log')) -or
        ($Preservation -and ($_.Name -like 'g4-im-preserve-*.log' -or $_.Name -like 'g4-im-install-*-preserve-*.log')) -or
        ($Runner -and ($_.Name -like 'g4-im-runner-*.log' -or $_.Name -like 'g4-im-install-*-runner-*.log')) -or
        ($SyncExecute -and ($_.Name -like 'g4-im-execution-*.log' -or $_.Name -like 'g4-im-install-*-execution-*.log' -or $_.Name -like 'g4-im-release-*.log' -or $_.Name -like 'g4-im-install-*-release-*.log')) -or
        ($SyncSchedule -and $_.Name -like 'g4-im-schedule-*.log') -or
        ($Login -and ($_.Name -like 'g4-im-login-*.log' -or $_.Name -like 'g4-im-public-login-*.log' -or $_.Name -like 'g4-im-install-*-login-*.log')) -or
        ($BindingIdentity -and $_.Name -like 'g4-im-binding-identity-*.log') -or
        ($BindingFlow -and ($_.Name -like 'g4-im-binding-flow-*.log' -or $_.Name -like 'g4-im-binding-http-*.log' -or $_.Name -like 'g4-im-unbind-*.log' -or $_.Name -like 'g4-im-management-*.log')) -or
        ($Messages -and ($_.Name -like 'g4-im-message-*.log' -or $_.Name -like 'g4-im-install-*-message-*.log')) -or
        ($Callbacks -and ($_.Name -like 'g4-im-callback-*.log' -or $_.Name -like 'g4-im-install-*-callback-*.log')) -or
        ($TodoCards -and ($_.Name -like 'g4-im-card-*.log' -or $_.Name -like 'g4-im-install-*-card-*.log' -or
            $_.Name -like 'g4-im-todo-*.log' -or $_.Name -like 'g4-im-install-*-todo-*.log'))) -and $_.Name -notlike '*log-samples*'
})
if ($EvidenceFiles) {
    if (@($EvidenceFiles | Select-Object -Unique).Count -ne $EvidenceFiles.Count) { throw 'Duplicate evidence file selection' }
    foreach ($Name in $EvidenceFiles) {
        if ($Name -notmatch '^g4-im-[a-z0-9-]+\.log$' -or $Name -notin $Files.Name) { throw 'Evidence selection must name an existing scoped log' }
    }
    $Files = @($Files | Where-Object Name -In $EvidenceFiles)
    Write-Output "G4_IM_ORG_LOG_SELECTION: mode=explicit; evidence_files=$($Files.Count); all_auth_service_logs=true; prior_failed_evidence_unchanged=true"
}
$Files += @(Get-ChildItem -LiteralPath (Join-Path $Run 'auth') -Filter '*.log' -File)
if ($Callbacks -or $TodoCards) { $Files += @(Get-ChildItem -LiteralPath (Join-Path $Run 'workflow') -Filter '*.log' -File) }
if ($Files.Count -eq 0) { throw 'No evidence logs found' }
$Matches = 0
foreach ($File in $Files) {
    $Stream = [IO.File]::Open($File.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $Reader = [IO.StreamReader]::new($Stream, [Text.Encoding]::UTF8)
    try {
        while (($Line = $Reader.ReadLine()) -ne $null) {
            foreach ($Sample in $Samples) { if ($Line.Contains($Sample, [StringComparison]::Ordinal)) { $Matches++ } }
        }
    } finally { $Reader.Dispose() }
}
Write-Output "G4_IM_ORG_LOG_SAMPLES: files=$($Files.Count); fixed_test_values=$($Samples.Count); matches=$Matches; read_only=true; live_vendor_secrets_tested=false; sync_preview=$($SyncPreview.IsPresent.ToString().ToLowerInvariant()); sync_write=$($SyncWrite.IsPresent.ToString().ToLowerInvariant()); sync_effects=$($SyncEffects.IsPresent.ToString().ToLowerInvariant()); runner=$($Runner.IsPresent.ToString().ToLowerInvariant()); sync_execute=$($SyncExecute.IsPresent.ToString().ToLowerInvariant()); sync_schedule=$($SyncSchedule.IsPresent.ToString().ToLowerInvariant()); binding_flow=$($BindingFlow.IsPresent.ToString().ToLowerInvariant())"
if ($Matches -ne 0) { throw 'Organization data or fixed test secret appeared in evidence logs' }
