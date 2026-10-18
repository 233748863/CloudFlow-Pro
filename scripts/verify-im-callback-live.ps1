param([Parameter(Mandatory = $true)][string]$StatePath,
    [string]$BuildSnapshotName = 'g4-im-backend-inputs-20260929-callback-http-20260930-r3.json',
    [switch]$WorkflowExecution,
    [switch]$TodoDetails,
    [switch]$TodoScan,
    [switch]$TodoManagement)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
foreach ($Candidate in @($Root, $Run, $StateFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected integration path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running isolated environment required' }
$Checks = 0
foreach ($Service in $State.services) {
    $Owners = @($State.processes | Where-Object name -EQ $Service.name)
    if ($Owners.Count -ne 1) { throw 'Unique owned service required' }
    $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owners[0].id)"
    $Marker = Join-Path $Run "$($Service.name)/service.args"
    if (-not $Process -or $Process.Name -ne 'java.exe' -or $Owners[0].marker -ne $Marker -or -not $Process.CommandLine.Contains($Marker)) { throw 'Owned process mismatch' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Owners[0].id)
    if (@($Listeners | Where-Object LocalAddress -NE '127.0.0.1').Count -gt 0 -or $Service.port -notin $Listeners.LocalPort -or $Service.healthPort -notin $Listeners.LocalPort) { throw 'Loopback-only service required' }
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
    if ($Health.status -ne 'UP') { throw 'All owned services must be healthy' }
    $Checks++
}
$Auth = @($State.services | Where-Object name -EQ 'auth')
$Gateway = @($State.services | Where-Object name -EQ 'gateway')
if ($Auth.Count -ne 1 -or $Gateway.Count -ne 1) { throw 'Auth and gateway required' }
$Properties = [IO.File]::ReadAllText((Join-Path $Run 'auth/integration.properties'))
$Enabled = [regex]::Matches($Properties, '(?m)^cloudflow\.im\.enabled=([^\r\n]*)')
if ($Enabled.Count -gt 1 -or $Enabled.Count -eq 1 -and $Enabled[0].Groups[1].Value.Trim() -ne 'false') { throw 'Disabled integration required for live boundary checks' }
$Headers = @{ 'X-Forwarded-Proto' = 'https'; 'X-Forwarded-For' = '198.51.100.7'; 'Authorization' = 'Bearer forged'; 'X-User-Id' = '1'; 'X-Tenant-Id' = '1'; 'Cookie' = 'Authorization=forged; __Host-CloudFlowIM=forged' }
$Cases = @(
    @{ Port = $Auth[0].port; Path = '/im/callback/992801'; Method = 'GET'; Status = 503; Headers = $Headers },
    @{ Port = $Auth[0].port; Path = '/im/callback/992801'; Method = 'POST'; Status = 503; Headers = $Headers },
    @{ Port = $Gateway[0].port; Path = '/auth/im/callback/992801'; Method = 'GET'; Status = 403; Headers = $Headers },
    @{ Port = $Gateway[0].port; Path = '/auth/im/callback/992801'; Method = 'POST'; Status = 403; Headers = $Headers },
    @{ Port = $Gateway[0].port; Path = '/auth/im/callback/01'; Method = 'POST'; Status = 404; Headers = $Headers },
    @{ Port = $Gateway[0].port; Path = '/auth/im/callback/992801'; Method = 'PUT'; Status = 404; Headers = $Headers },
    @{ Port = $Gateway[0].port; Path = '/auth/im/callback/992801'; Method = 'POST'; Status = 403; Headers = @{} }
)
foreach ($Case in $Cases) {
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$($Case.Port)$($Case.Path)" -Method $Case.Method -Headers $Case.Headers -SkipHttpErrorCheck -TimeoutSec 10
    if ([int]$Response.StatusCode -ne $Case.Status) { throw "Live callback status mismatch: expected=$($Case.Status); actual=$([int]$Response.StatusCode)" }
    if ((@($Response.Headers['Cache-Control'] | Select-Object -Unique) -join ',') -ne 'no-store' -or (@($Response.Headers['Referrer-Policy'] | Select-Object -Unique) -join ',') -ne 'no-referrer') { throw 'Live callback headers missing or conflicting' }
    if ($Case.Status -eq 503 -and [string]$Response.Content -ne 'failed') { throw 'Disabled callback must return fixed failure body' }
    $Checks += 3
}
if ($WorkflowExecution) {
    $Workflow = @($State.services | Where-Object name -EQ 'workflow')
    if ($Workflow.Count -ne 1) { throw 'Owned workflow service required' }
    $CallbackBody = @{ tenantId = 100000; callbackId = 992801; claimUntil = '2026-09-30T00:00:00' } | ConvertTo-Json -Compress
    $TodoBody = @{ tenantId = 100000; mappingId = 992801 } | ConvertTo-Json -Compress
    $InnerCases = @(
        @{ Port = $Auth[0].port; Path = '/inner/auth/im-callback/verify'; Body = $CallbackBody },
        @{ Port = $Workflow[0].port; Path = '/inner/workflow/im-callback/complete'; Body = $CallbackBody },
        @{ Port = $Auth[0].port; Path = '/inner/auth/im-todo/verify'; Body = $TodoBody },
        @{ Port = $Workflow[0].port; Path = '/inner/workflow/im-todo/project'; Body = $TodoBody },
        @{ Port = $Workflow[0].port; Path = '/inner/workflow/im-todo/status'; Body = $TodoBody },
        @{ Port = $Workflow[0].port; Path = '/inner/workflow/im-todo/scan'; Body = '{"afterTaskId":""}' }
    )
    foreach ($Case in $InnerCases) {
        foreach ($InnerHeaders in @(@{}, @{ 'X-Inner-Call' = 'true'; 'X-From-Service' = 'forged-service'; 'X-Tenant-Id' = '100000' })) {
            $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$($Case.Port)$($Case.Path)" -Method POST -ContentType 'application/json' -Body $Case.Body -Headers $InnerHeaders -SkipHttpErrorCheck -TimeoutSec 10
            $Result = [string]$Response.Content | ConvertFrom-Json
            $Expected = if ($InnerHeaders.Count -eq 0) { 401 } else { 403 }
            if ([int]$Result.code -ne $Expected) { throw "Internal callback access mismatch: expected=$Expected; actual=$($Result.code)" }
            $Checks++
        }
    }
}
if ($TodoDetails) {
    $Workflow = @($State.services | Where-Object name -EQ 'workflow')
    if ($Workflow.Count -ne 1) { throw 'Owned workflow service required' }
    foreach ($TaskHeaders in @(@{}, @{ 'X-Tenant-Id' = '100000'; 'X-User-Id' = '1'; 'Authorization' = 'Bearer forged' })) {
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$($Workflow[0].port)/wf/todo/owned-task-check" -Method GET -Headers $TaskHeaders -SkipHttpErrorCheck -TimeoutSec 10
        $Result = [string]$Response.Content | ConvertFrom-Json
        if ([int]$Result.code -ne 401) { throw 'Task detail must reject missing or forged authentication' }
        $Checks++
    }
}
if ($TodoScan) {
    $Workflow = @($State.services | Where-Object name -EQ 'workflow')
    if ($Workflow.Count -ne 1) { throw 'Owned workflow service required' }
    $ScanHeaders = @{ 'X-Inner-Call' = 'true'; 'X-From-Service' = 'cloudflow-auth' }
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$($Workflow[0].port)/inner/workflow/im-todo/scan" -Method POST -ContentType 'application/json' -Body '{"afterTaskId":""}' -Headers $ScanHeaders -SkipHttpErrorCheck -TimeoutSec 15
    $Result = [string]$Response.Content | ConvertFrom-Json
    if ([int]$Result.code -ne 200 -or $null -eq $Result.data -or @($Result.data.candidates).Count -gt 100) { throw 'Trusted task scan must return bounded candidates' }
    $Checks++
    foreach ($ScanCandidate in $Result.data.candidates) {
        $Names = @($ScanCandidate.PSObject.Properties.Name | Sort-Object)
        if (($Names -join ',') -ne 'assignmentVersion,receivers,taskId,tenantId' -or $ScanCandidate.taskId -notmatch '^[A-Za-z0-9_-]{1,64}$' -or [long]$ScanCandidate.tenantId -le 0 -or [int]$ScanCandidate.assignmentVersion -lt 0 -or @($ScanCandidate.receivers).Count -notin @(1,2)) { throw 'Task scan must return identifiers without form content' }
    }
    $Checks++
}
if ($TodoManagement) {
    foreach ($RequestCase in @(@{ Method = 'GET'; Path = '/system/im/todo/list?configId=992801' }, @{ Method = 'POST'; Path = '/system/im/todo/reconcile' })) {
        foreach ($ManagementHeaders in @(@{}, @{ 'X-Tenant-Id' = '100000'; 'X-User-Id' = '1'; 'Authorization' = 'Bearer forged' })) {
            $Arguments = @{ Uri = "http://127.0.0.1:$($Auth[0].port)$($RequestCase.Path)"; Method = $RequestCase.Method; Headers = $ManagementHeaders; SkipHttpErrorCheck = $true; TimeoutSec = 10 }
            if ($RequestCase.Method -eq 'POST') { $Arguments.ContentType = 'application/json'; $Arguments.Body = '{"mappingId":992801,"version":0}' }
            $Response = Invoke-WebRequest @Arguments
            $Result = [string]$Response.Content | ConvertFrom-Json
            if ([int]$Result.code -ne 401) { throw 'Todo management must reject missing or forged login' }
            $Checks++
        }
    }
}
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Before = Get-Content -LiteralPath (Join-Path $Evidence 'g4-im-callback-runtime-before-20260930.json') -Raw | ConvertFrom-Json
foreach ($Entry in $Before) {
    if ($Entry.Service -notin @('auth','gateway') -or (Get-FileHash -LiteralPath (Join-Path $Run "$($Entry.Service)/integration.properties")).Hash -ne $Entry.Hash) { throw 'Runtime configuration changed' }
    $Checks++
}
if ($BuildSnapshotName -notmatch '^g4-im-backend-inputs-[A-Za-z0-9-]+\.json$') { throw 'Owned build snapshot name required' }
$Inputs = Get-Content -LiteralPath (Join-Path $Evidence $BuildSnapshotName) -Raw | ConvertFrom-Json
foreach ($Input in $Inputs) {
    if (-not $Input.Path.StartsWith((Join-Path $Root 'cloudflow-backend') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash) { throw 'Built backend inputs changed' }
}
$RequestCount = $Cases.Count + $(if ($WorkflowExecution) { $InnerCases.Count * 2 } else { 0 }) + $(if ($TodoDetails) { 2 } else { 0 }) + $(if ($TodoScan) { 1 } else { 0 }) + $(if ($TodoManagement) { 4 } else { 0 })
Write-Output "G4_IM_CALLBACK_LIVE: assertions=$Checks; requests=$RequestCount; services_up=$($State.services.Count); actual_auth=true; actual_gateway=true; workflow_inner_checked=$WorkflowExecution; disabled_effective=true; invalid_route_rejected=true; forged_identity_ignored=true; config_bytes_unchanged=true; backend_inputs=$($Inputs.Count); backend_changed=0; vendor_service=false; workflow_action=false"
