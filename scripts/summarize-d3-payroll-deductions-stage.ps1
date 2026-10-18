param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r101')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Report=Join-Path $Evidence "d3-payroll-deductions-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain existing deductions stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$Folder="d3-payroll-deductions-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Property in @('passed','approval','attendance','deductions','mixedBatch','snapshot','preservation','restoration','secrets','syntheticPolicy')){
    Require ($Result.$Property -eq $true) "Deductions evidence missing: $Property"
}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Deductions scope boundary changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.employees.Count -eq 2 -and $Fixture.requests.Count -eq 3 -and $Fixture.cases.Count -eq 10) 'Actual deduction sample scope changed'
Require ($Fixture.tasks.Count -eq 1 -and $Fixture.tasks[0].terminal -eq 'SUCCESS' -and [int]$Fixture.tasks[0].affectedRows -eq 1) 'Original payroll task not completed'
Require ($Fixture.restorations.PSObject.Properties.Name.Count -eq 6 -and @($Fixture.restorations.PSObject.Properties|Where-Object Value -NE $true).Count -eq 0) 'Actual restoration incomplete'
foreach($Pair in @(@('gross','300030'),@('attendance','22502'),@('leave','14001'),@('tax','26353'),@('net','237174'))){
    Require ($Fixture.expectedCents.($Pair[0]) -eq $Pair[1]) 'Expected money evidence changed'
}
$Current=@{}
foreach($Relative in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned workspace'
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Deductions input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current deductions input changed'}
$Inputs=@(Read-Json "$Folder/inputs.json")
$OriginalCount=0
foreach($Name in @('scripts/verify-d3-payroll-deductions.mjs','scripts/run-d3-payroll-deductions.ps1','scripts/run-d3-payroll-deductions-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs')){
    $Input=@($Inputs|Where-Object {$_.Path.Replace('\','/') -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$(Split-Path -Leaf $Name)")).Hash -eq $Input[0].Hash) 'Original execution script changed'
    $OriginalCount++
}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "d3-payroll-deductions-live-$LiveRound-launch.log") -Raw
Require ($Launch -match 'D3_DEDUCTIONS_RUN_EXIT=0' -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=671; counter_after=674; counter_writes=0; database_unchanged=true; production_modified=false') 'Live exit or captcha restoration missing'
$FirstLaunch=Get-Content -LiteralPath (Join-Path $Evidence 'd3-payroll-deductions-live-r1-launch.log') -Raw
$FirstFailure=Get-Content -LiteralPath (Join-Path $Evidence 'd3-payroll-deductions-live-r1-launch.err') -Raw
Require ($FirstLaunch -match 'counter_before=671; counter_after=671; counter_writes=0' -and $FirstFailure.Contains('Owned process verification failed')) 'Original preflight failure evidence missing'
Require (@(Get-ChildItem -LiteralPath (Join-Path $Evidence 'd3-payroll-deductions-20261006-r1') -File).Count -eq 0) 'R1 claimed execution artifacts after preflight failure'
$CertificateFailure=Get-Content -LiteralPath (Join-Path $Evidence 'd3-payroll-deductions-smtp-r1-launch.err') -Raw
Require ($CertificateFailure.Contains('Owned SMTP certificate expired or not yet valid')) 'Original certificate failure evidence missing'
$Smtp=Get-Content -LiteralPath (Join-Path $Evidence 'd3-payroll-deductions-smtp-r2-launch.log') -Raw
Require ($Smtp.Contains('ISOLATED_SMTP_CERTIFICATE: renewed=true;') -and $Smtp -match 'ISOLATED_SMTP_READY: port=(\d+); process=(\d+); loopback=true;') 'Owned SMTP recovery missing'
$SmtpPort=[int]$Matches[1]; $SmtpPid=[int]$Matches[2]
$Auth=Get-Content -LiteralPath (Join-Path $Evidence 'd3-payroll-deductions-auth-reload-r1-launch.log') -Raw
Require ($Auth -match 'ISOLATED_RESTART_READY: service=auth; port=\d+; process=(\d+);') 'Auth certificate reload missing'
$AuthPid=[int]$Matches[1]
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($Build in @('backend-r95','frontend-r58')){
    foreach($Item in @(Read-Json "h3-portal-finance-20261002-$Build-inputs.json")){
        Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Product differs from B95/F58'
    }
}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime changed'
Require (@($State.processes|Where-Object {$_.name -eq 'auth' -and $_.id -eq $AuthPid}).Count -eq 1) 'Auth process changed'
Require (@($State.processes|Where-Object {$_.name -eq 'smtp-fixture' -and $_.id -eq $SmtpPid}).Count -eq 1) 'SMTP process changed'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership failed'
}
$Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $SmtpPid)
Require ($Listeners.Count -eq 1 -and $Listeners[0].LocalAddress -eq '127.0.0.1' -and $Listeners[0].LocalPort -eq $SmtpPort) 'SMTP listener changed'
$Healthy=0
foreach($Service in $State.services){
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Reference service unhealthy'
    $Healthy++
}
$Summary=[pscustomobject]@{passed=$true;backend='r95';frontend='r58';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;tasks=1;employees=2;approvedLeaves=3;amountsInCents=$Fixture.expectedCents;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$OriginalCount;captchaRestored=$true;productChanged=$false;processes=$State.processes.Count;healthyServices=$Healthy;authPid=$AuthPid;smtpPid=$SmtpPid;preflightFailuresPreserved=$true;businessRowsPreserved=$true;priorChecksRelabeled=$false;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('D3 permissions corrections large amounts and further payroll basis combinations','D3 complete attendance source and employee confirmation paths','D2 first request below500ms and all17','Official tax policy','Global35PRD681 unified regression')}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D3_DEDUCTIONS_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); tasks=1; inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$OriginalCount; processes=$($State.processes.Count); healthy=$Healthy; product_changed=false; global_complete=false"
