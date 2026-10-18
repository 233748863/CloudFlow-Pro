param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$') { throw 'Owned isolated state required' }
$LongEmail = ('a' * 64) + '@' + ('b' * 63) + '.' + ('c' * 63) + '.' + ('d' * 61)
$Samples = @($LongEmail, '+123456789012345', 'Person.Name+Tag@EXAMPLE.TEST', 'person.name+tag@example.test', '+1 (202) 555-0123', '+12025550123')
$ReferralEvidence = @(Get-ChildItem -LiteralPath (Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime') -Filter 'h2-referral-completion-*.log' -File)
$ReferralEvidence += @(Get-ChildItem -LiteralPath (Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime') -Filter 'h2-name-capacity-full-*.log' -File)
$ReferralEvidence += @(Get-ChildItem -LiteralPath (Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime') -Filter 'h2-referral-contact-http-final-*.log' -File)
function Read-SharedContactLog([string]$Path) {
    $Stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $Reader = [IO.StreamReader]::new($Stream)
    try { return $Reader.ReadToEnd() } finally { $Reader.Dispose() }
}
$ReferralMarkers = @($ReferralEvidence | ForEach-Object {
    [regex]::Matches((Read-SharedContactLog $_.FullName), 'referral_[a-f0-9]{12}') | ForEach-Object { $_.Value }
} | Sort-Object -Unique)
foreach ($ReferralMarker in $ReferralMarkers) {
    $Samples += $ReferralMarker + '@example.test'
    $Samples += $ReferralMarker.PadRight(64, 'a') + '@' + ('b' * 63) + '.' + ('c' * 63) + '.' + ('d' * 61)
    $ReferralPhone = [Convert]::ToInt64($ReferralMarker.Substring(9, 11), 16).ToString().PadLeft(14, '0')
    $Samples += '+1' + $ReferralPhone
}
$Files = @(Get-ChildItem -LiteralPath (Join-Path $Run 'hr'), (Join-Path $Run 'auth') -Filter '*.log' -File) +
    @(Get-ChildItem -LiteralPath (Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime') -Filter 'h2-contact-capacity-*.log' -File) + $ReferralEvidence
$Hits = 0
foreach ($File in $Files) {
    $Stream = [IO.File]::Open($File.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $Reader = [IO.StreamReader]::new($Stream)
    try {
        $Content = $Reader.ReadToEnd()
        foreach ($Sample in $Samples) { if ($Content.Contains($Sample)) { $Hits++ } }
    } finally { $Reader.Dispose() }
}
if ($Hits -ne 0) { throw "Contact sample log scan failed; hits=$Hits" }
Write-Output "H2_CONTACT_LOG_SAMPLES: files=$($Files.Count); samples=$($Samples.Count); hits=0; raw_hr_auth_logs=true; failed_evidence_retained=true; real_personal_data_used=false"
