param([ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r90')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d2-month-read-reuse-reload-20261005-$BackendRound"
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
if(Test-Path -LiteralPath $Output){throw 'Retain previous reload; verify original process before any retry'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($File in @('scripts/reload-d2-read-reuse-services.ps1','scripts/restart-isolated-integration-service.ps1')){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash}}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Reload input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Results=[Collections.Generic.List[object]]::new()
foreach($Name in @('auth','oa','crm','workflow','gateway','hr')){
    $Process=Start-Process -FilePath (Get-Process -Id $PID).Path -WindowStyle Hidden -PassThru -ArgumentList @('-NoLogo','-NoProfile','-File','scripts/restart-isolated-integration-service.ps1','-StatePath',$StatePath,'-ServiceName',$Name) -WorkingDirectory $Root -RedirectStandardOutput (Join-Path $Output "$Name.log") -RedirectStandardError (Join-Path $Output "$Name.err")
    $Process.WaitForExit();$Process.Refresh()
    $State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
    $Owned=@($State.processes|Where-Object name -EQ $Name)
    $Results.Add([pscustomobject]@{Name=$Name;Exit=$Process.ExitCode;Pid=$Owned[0].id})
    $Results|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'progress.json') -Encoding utf8NoBOM
    if($Process.ExitCode -ne 0){throw "Original $Name restart terminated with failure; do not start a duplicate"}
    $Log=Get-Content -LiteralPath (Join-Path $Output "$Name.log") -Raw
    if($Log -notmatch 'ISOLATED_RESTART_READY:'){throw 'Readiness proof missing'}
    Assert-Inputs
    Write-Output "D2_READ_REUSE_RELOADED: service=$Name; pid=$($Owned[0].id); exit=0"
}
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Inputs=$Inputs.Count;InputChanges=0;Services=@($Results);HrReloadedLast=$true}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'D2_READ_REUSE_RELOAD_EXIT=0'
