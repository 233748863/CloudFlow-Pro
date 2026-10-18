param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$PackageVerificationRound,
    [ValidateSet('all','hr')][string]$Scope='all')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "isolated-executable-deployment-20261006-$Round"
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
if(Test-Path -LiteralPath $Output){throw 'Retain the original deployment'}
$PackagePath=Join-Path $Evidence "backend-executable-verification-20261006-$PackageVerificationRound/result.json"
$Packages=Get-Content -LiteralPath $PackagePath -Raw|ConvertFrom-Json
if(-not $Packages.Passed -or @($Packages.Services).Count -ne 6){throw 'Verified six-service package report required'}
$Selected=if($Scope -eq 'all'){@('auth','oa','crm','workflow','gateway','hr')}else{@('hr')}
$Inputs=@([pscustomobject]@{Path=$PackagePath;Hash=(Get-FileHash -LiteralPath $PackagePath).Hash})
foreach($Script in @($PSCommandPath,(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'))){$Inputs+=[pscustomobject]@{Path=$Script;Hash=(Get-FileHash -LiteralPath $Script).Hash}}
foreach($Name in $Selected){
    $Found=@($Packages.Services|Where-Object Name -EQ $Name)
    if($Found.Count -ne 1){throw 'One verified artifact per selected service required'}
    $Inputs+=[pscustomobject]@{Path=(Join-Path $Root $Found[0].Path);Hash=$Found[0].Hash}
}
function Assert-Inputs {foreach($InputFile in $Inputs){if((Get-FileHash -LiteralPath $InputFile.Path).Hash -ne $InputFile.Hash){throw 'Deployment input changed'}}}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Script in @($PSCommandPath,(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'))){Copy-Item -LiteralPath $Script -Destination (Join-Path $Output ('original-'+(Split-Path $Script -Leaf)))}
$Results=[Collections.Generic.List[object]]::new()
foreach($Name in $Selected){
    Assert-Inputs
    $Package=$Packages.Services|Where-Object Name -EQ $Name
    $Jar=Join-Path $Root $Package.Path
    $Process=Start-Process -FilePath (Get-Process -Id $PID).Path -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoLogo','-NoProfile','-File','scripts/restart-isolated-integration-service.ps1','-StatePath',$StatePath,'-ServiceName',$Name,'-ExecutableJar',('"'+$Jar+'"')) -RedirectStandardOutput (Join-Path $Output "$Name.log") -RedirectStandardError (Join-Path $Output "$Name.err")
    $Process.WaitForExit();$Process.Refresh()
    if($Process.ExitCode -ne 0){throw 'Owned deployment failed; retain original process and logs'}
    $State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
    $ArgsNow=@(Get-Content -LiteralPath (Join-Path $State.run "$Name/service.args"))
    $Markers=@(0..($ArgsNow.Count-1)|Where-Object{$ArgsNow[$_] -eq '-jar'})
    if($Markers.Count -ne 1 -or $Markers[0]+1 -ge $ArgsNow.Count){throw 'Deployed launch marker missing'}
    $Actual=[IO.Path]::GetFullPath($ArgsNow[$Markers[0]+1].Trim('"'))
    if((Split-Path -Parent $Actual) -ne (Join-Path $State.run "$Name/artifacts") -or (Get-FileHash -LiteralPath $Actual).Hash -ne $Package.Hash){throw 'Deployed artifact differs from the verified package'}
    $Owned=$State.processes|Where-Object name -EQ $Name
    $Results.Add([pscustomobject]@{Name=$Name;Pid=$Owned.id;Artifact=$Actual;Hash=$Package.Hash;Exit=0})
    $Results|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'progress.json') -Encoding utf8NoBOM
    "ISOLATED_DEPLOYED: service=$Name; immutable_copy=true; exit=0"
}
Assert-Inputs
[pscustomobject]@{Passed=$true;BackendRound=$Packages.BackendRound;Scope=$Scope;Inputs=$Inputs.Count;InputChanges=0;Services=@($Results);WorkingTreeBuildVerified=$false;BusinessVerified=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"ISOLATED_DEPLOYMENT_SUMMARY: services=$($Results.Count); inputs=$($Inputs.Count); changed=0; exit=0"
