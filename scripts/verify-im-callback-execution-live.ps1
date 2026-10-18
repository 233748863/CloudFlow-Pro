param([Parameter(Mandatory = $true)][string]$StatePath,
    [string]$BuildSnapshotName = 'g4-im-backend-inputs-20260930-card-provider-r1.json', [switch]$TodoRoundTrip)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
& (Join-Path $PSScriptRoot 'verify-im-callback-live.ps1') -StatePath $StateFile -BuildSnapshotName $BuildSnapshotName -WorkflowExecution
$Run = Split-Path -Parent $StateFile
$Config = Join-Path $Run 'auth/integration.properties'
$Original = [IO.File]::ReadAllBytes($Config)
$OriginalText = [Text.Encoding]::UTF8.GetString($Original)
if ($OriginalText -match '(?m)^cloudflow\.im\.(enabled|secret-key|public-url)=') { throw 'Dedicated live test requires original default IM configuration' }
$Evidence = Join-Path $Run ('im-callback-execution-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
if ($TodoRoundTrip) {
    $Auth = Join-Path $Root 'cloudflow-backend/cloudflow-auth'
    $Classpath = (Join-Path $Auth 'target/classes') + [IO.Path]::PathSeparator + (Get-Content -LiteralPath (Join-Path $Auth 'target/im-classpath.txt') -Raw).Trim()
    $Compile = Join-Path $Evidence 'compile.args'
    [IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Evidence.Replace('\','/') + '"'),('"' + (Join-Path $Root 'scripts/im-checks/ImTodoRoundTripLiveChecks.java').Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
    & javac "@$Compile"
    if ($LASTEXITCODE -ne 0) { throw 'Todo round trip compilation failed' }
    [IO.File]::WriteAllLines((Join-Path $Evidence 'round-trip.args'), @('-Dfile.encoding=UTF-8','-cp',('"' + ($Evidence + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'com.cloudflow.auth.im.ImTodoRoundTripLiveChecks',('"' + $StateFile.Replace('\','/') + '"'),('"' + $Evidence.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
}
[IO.File]::WriteAllBytes((Join-Path $Evidence 'auth-properties-before.bin'), $Original)
$PreviousSecret = $env:CLOUDFLOW_IM_CALLBACK_CHECK_SECRET
$env:CLOUDFLOW_IM_CALLBACK_CHECK_SECRET = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$Addition = "`ncloudflow.im.enabled=true`ncloudflow.im.secret-key=`${CLOUDFLOW_IM_CALLBACK_CHECK_SECRET}`ncloudflow.im.public-url=https://im-callback.example.invalid`n"
if ($TodoRoundTrip) {
    if ($OriginalText -match '(?m)^cloudflow\.ratelimit\.trusted-proxies') { throw 'Explicit existing trusted proxy configuration requires review' }
    $Addition += "cloudflow.ratelimit.trusted-proxies[0]=127.0.0.1/32`n"
}
$Modified = [Text.UTF8Encoding]::new($false).GetBytes($OriginalText + $Addition)
$ModifiedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Modified))
$Changed = $false
$Failed = $false
try {
    [IO.File]::WriteAllBytes($Config, $Modified)
    $Changed = $true
    & (Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1') -StatePath $StateFile -ServiceName auth
    if ($LASTEXITCODE -ne 0) { throw 'Callback execution service start failed' }
    & node (Join-Path $PSScriptRoot 'verify-im-callback-execution-live.mjs') $StateFile $Evidence $(if ($TodoRoundTrip) { 'todo-round-trip' } else { 'callbacks' })
    if ($LASTEXITCODE -ne 0) { $Failed = $true }
} finally {
    $env:CLOUDFLOW_IM_CALLBACK_CHECK_SECRET = $PreviousSecret
    if ($Changed) {
        if ((Get-FileHash -LiteralPath $Config).Hash -ne $ModifiedHash) { throw 'Callback runtime configuration changed externally; retained original bytes require review' }
        [IO.File]::WriteAllBytes($Config, $Original)
        & (Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1') -StatePath $StateFile -ServiceName auth -RecoverExited
        if ($LASTEXITCODE -ne 0) { throw 'Original callback service restart failed' }
        if ((Get-FileHash -LiteralPath $Config).Hash -ne [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Original))) { throw 'Original configuration bytes mismatch' }
        Write-Output 'G4_IM_CALLBACK_EXECUTION_RESTORED: default_disabled=true; original_config_bytes=true; actual_service_restarted=true; production_modified=false'
    }
}
if ($Failed) { throw 'Callback execution live checks failed; isolated evidence retained' }
