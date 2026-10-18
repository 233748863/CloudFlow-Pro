param([Parameter(Mandatory = $true)][ValidateSet('Enable', 'Restore', 'Status')][string]$Phase)

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = Join-Path $Workspace '.cloudflow-runtime/batch-h-20260914'
$Private = Join-Path $Runtime 'private'
$EvidenceFile = Join-Path $Private 'hr09-encryption-runtime.private.json'
. (Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1')
if ($env:CLOUDFLOW_H_ACCEPTANCE -ne '1') { throw 'Explicit H acceptance mode is required' }
$State = Get-Content -LiteralPath (Join-Path $Runtime 'state.json') -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or $State.target.host -ne '192.168.1.173' -or $State.target.database -ne 'cloud_flow_db') { throw 'Unexpected H runtime target' }
if (-not (Test-Path -LiteralPath $Private -PathType Container)) { throw 'Existing protected H artifact directory is required' }
$PrivateDirectory = Get-Item -LiteralPath $Private
if ($PrivateDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Protected directory cannot be a reparse point' }
if ((Resolve-Path -LiteralPath $Private).Path -ne [IO.Path]::GetFullPath($Private)) { throw 'Unexpected protected directory target' }
$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$DirectorySecurity = Get-Acl -LiteralPath $Private
$AllowedSids = @($CurrentIdentity.User.Value, 'S-1-5-18')
if (-not $DirectorySecurity.AreAccessRulesProtected -or @($DirectorySecurity.Access | Where-Object {
    $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $AllowedSids
}).Count -ne 0) { throw 'H artifact directory permissions are not private' }

function Protect-Value([string]$Value) {
    if ([string]::IsNullOrEmpty($Value)) { return $null }
    return ConvertFrom-SecureString (ConvertTo-SecureString -String $Value -AsPlainText -Force)
}

function Unprotect-Value([string]$Value) {
    if ([string]::IsNullOrEmpty($Value)) { return $null }
    $SecureValue = ConvertTo-SecureString $Value
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer); $SecureValue.Dispose() }
}

function Save-Evidence($Evidence) {
    $Evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidenceFile -Encoding utf8
}

$Evidence = if (Test-Path -LiteralPath $EvidenceFile) {
    if ((Get-Item -LiteralPath $EvidenceFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Encryption artifact cannot be a reparse point' }
    Get-Content -LiteralPath $EvidenceFile -Raw | ConvertFrom-Json -AsHashtable
} else { $null }
if ($Evidence -and ($Evidence.milestone -ne 'H-20260914' -or $Evidence.scope -ne 'HR_ACCEPTANCE_ONLY')) { throw 'Unexpected encryption artifact ownership' }
if ($Phase -eq 'Status') {
    [pscustomobject]@{ configured = [bool]$Evidence; temporaryEnabled = $Evidence.temporaryEnabled -eq $true; restored = $Evidence.restored -eq $true }
    exit 0
}
if (Test-Path -LiteralPath (Join-Path $Private 'hr09-phase.lock')) { throw 'Finish and restore the active HR phase before restarting' }
if ($Phase -eq 'Enable' -and -not $Evidence) {
    if ($env:CLOUDFLOW_ENCRYPT_ENABLED -ne 'false' -or $env:CLOUDFLOW_ENCRYPT_AES_KEY -or $env:CLOUDFLOW_ENCRYPT_SM4_KEY) {
        throw 'Existing encryption configuration requires a separate migration review; this helper only enables an unconfigured acceptance runtime'
    }
    $KeyBytes = [byte[]]::new(16)
    [Security.Cryptography.RandomNumberGenerator]::Fill($KeyBytes)
    $GeneratedKey = [Convert]::ToHexString($KeyBytes).ToLowerInvariant()
    $Evidence = [ordered]@{ milestone = 'H-20260914'; scope = 'HR_ACCEPTANCE_ONLY'; keyProtection = 'WINDOWS_DPAPI_CURRENT_USER'
        baselineEnabled = $env:CLOUDFLOW_ENCRYPT_ENABLED; baselineAes = Protect-Value $env:CLOUDFLOW_ENCRYPT_AES_KEY
        baselineSm4 = Protect-Value $env:CLOUDFLOW_ENCRYPT_SM4_KEY; acceptanceAes = Protect-Value $GeneratedKey
        temporaryEnabled = $false; restored = $true; createdAt = (Get-Date).ToString('o') }
    [Array]::Clear($KeyBytes)
    $GeneratedKey = $null
    Save-Evidence $Evidence
}
if (-not $Evidence) { throw 'No acceptance encryption configuration exists to restore' }
$EnvironmentBefore = @{}
foreach ($Name in @('CLOUDFLOW_ENCRYPT_ENABLED', 'CLOUDFLOW_ENCRYPT_AES_KEY', 'CLOUDFLOW_ENCRYPT_SM4_KEY')) {
    $EnvironmentBefore[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
}
try {
    if ($Phase -eq 'Enable') {
        $Key = Unprotect-Value $Evidence.acceptanceAes
        if ([Text.Encoding]::UTF8.GetByteCount($Key) -ne 32) { throw 'Acceptance key length is invalid' }
        $env:CLOUDFLOW_ENCRYPT_ENABLED = 'true'
        $env:CLOUDFLOW_ENCRYPT_AES_KEY = $Key
    } else {
        $env:CLOUDFLOW_ENCRYPT_ENABLED = $Evidence.baselineEnabled
        $env:CLOUDFLOW_ENCRYPT_AES_KEY = Unprotect-Value $Evidence.baselineAes
        $env:CLOUDFLOW_ENCRYPT_SM4_KEY = Unprotect-Value $Evidence.baselineSm4
    }
    $Evidence.requestedPhase = $Phase
    $Evidence.restartVerified = $false
    Save-Evidence $Evidence
    & pwsh -NoProfile -File (Join-Path $Runtime 'restart-service.ps1') -ServiceName hr
    if ($LASTEXITCODE -ne 0) { throw 'HR acceptance encryption restart failed; use Restore before ending acceptance' }
    $Evidence.temporaryEnabled = $Phase -eq 'Enable'
    $Evidence.restored = $Phase -eq 'Restore'
    $Evidence.restartVerified = $true
    $Evidence.checkedAt = (Get-Date).ToString('o')
    Save-Evidence $Evidence
    [pscustomobject]@{ phase = $Phase; healthy = $true; temporaryEnabled = $Evidence.temporaryEnabled; restored = $Evidence.restored; keyPrinted = $false }
} finally {
    $Key = $null
    foreach ($Name in $EnvironmentBefore.Keys) { [Environment]::SetEnvironmentVariable($Name, $EnvironmentBefore[$Name], 'Process') }
}
