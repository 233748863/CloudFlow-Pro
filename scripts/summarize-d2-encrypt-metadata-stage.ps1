param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PayrollRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r132')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-encrypt-metadata-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain previous metadata stage report'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$Inputs=@{}
foreach($Relative in @('d2-current-first-20261006-r5/inputs.json','d2-leave-attendance-20261005-r17/inputs.json',
    "d3-official-tax-20261006-$PayrollRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",
    'backend-executable-verification-20261006-r5/inputs.json')){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Item.Hash) 'Current input hashes conflict'
        $Inputs[$Path]=$Item.Hash
    }
}
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) 'Current stage input changed'}
$Before=@{};foreach($Item in @(Read-Json 'h3-portal-finance-20261002-backend-r113-inputs.json')){$Before[$Item.Path.Replace('\','/')]=$Item.Hash}
$After=@{};foreach($Item in @(Read-Json 'h3-portal-finance-20261002-backend-r114-inputs.json')){$After[$Item.Path.Replace('\','/')]=$Item.Hash}
$Prefix='cloudflow-backend/cloudflow-common/cloudflow-common-encrypt/src/main/java/com/cloudflow/common/encrypt/interceptor/'
$Changes=@()
foreach($Path in $After.Keys){
    if($Before.ContainsKey($Path) -and $Before[$Path] -eq $After[$Path]){continue}
    if($Path -eq $Prefix+'EncryptedFieldMetadata.java'){
        Require (-not $Before.ContainsKey($Path)) 'Metadata definition must be the sole new product file'
    }else{
        Require ($Path -in @(($Prefix+'MybatisEncryptInterceptor.java'),($Prefix+'MybatisDecryptInterceptor.java'))) 'Unexpected product change'
        $Original=Join-Path $Evidence ('d2-encrypt-metadata-originals-20261006-r1/'+(Split-Path -Leaf $Path))
        Require ((Get-FileHash -LiteralPath $Original).Hash -eq $Before[$Path]) 'Pre-change product original differs from B113'
    }
    $Changes+=$Path
}
Require ($Changes.Count -eq 3 -and @($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Product change scope differs'
$Direct=Read-Json 'd2-leave-attendance-20261005-r17/result.json'
$Reload=Read-Json 'd2-current-first-20261006-r5/measurement-result.json'
Require ($Direct.passed -and $Direct.correctness -and $Direct.preservation -and $Direct.restoration -and $Direct.secrets -and -not $Direct.profiling -and $Direct.checks.Count -eq 37 -and $Direct.requests -eq 4) 'Current attendance business evidence incomplete'
Require ($Reload.Passed -and $Reload.BackendRound -eq 'r114' -and $Reload.FrontendRound -eq 'r72' -and $Reload.ExecutablePackages -and $Reload.HrReloadedLast -and -not $Reload.Profiling -and $Reload.Services.Count -eq 6) 'Current ordinary executable launch evidence incomplete'
Require ($Direct.measurements.Count -eq 4 -and $Reload.Measurements.Count -eq 4) 'Four ordinary observations required'
$PerformanceMet=@($Direct.measurements|Where-Object{$_.milliseconds -ge 500 -or -not $_.meets500ms}).Count -eq 0
Require ($Direct.performanceMet -eq $PerformanceMet -and $Reload.PerformanceMet -eq $PerformanceMet) 'Performance result differs from ordinary measurements'
foreach($Name in @('verify-d2-leave-attendance.mjs','run-d2-leave-attendance.ps1','run-d2-leave-attendance-allowance.mjs')){
    Require ((Get-FileHash -LiteralPath (Join-Path $Root ('scripts/'+$Name))).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Evidence ('d2-leave-attendance-20261005-r17/original-'+$Name))).Hash) 'Retained ordinary verifier differs'
}
$CodecLog=Get-Content -LiteralPath (Join-Path $Evidence 'd2-encrypt-metadata-checks-r3-launch.log') -Raw
Require ($CodecLog -match 'PASS codec offline assertions=1363;' -and $CodecLog -match 'stable source SHA256=e48352c4185d31917638c802296b206c8a3df3481e28c909e7714f4706b10c78;') 'Offline current codec evidence missing'
$Common=Join-Path $Root 'cloudflow-backend/cloudflow-common'
$Hr=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Sources=@(Get-ChildItem -LiteralPath (Join-Path $Common 'cloudflow-common-encrypt/src/main/java') -Filter '*.java' -Recurse -File|Select-Object -ExpandProperty FullName)
foreach($Relative in @('domain/dto/HrEmployeeCompPayload.java','domain/dto/HrTaxProfilePayload.java','domain/dto/HrCompChangePayload.java','domain/dto/HrSalarySlipPayload.java','domain/dto/HrFieldCodec.java','domain/entity/HrEmployeeComp.java','domain/entity/HrTaxProfile.java','domain/entity/HrCompChange.java','domain/entity/HrSalarySlip.java','mapper/HrEmployeeCompMapper.java','mapper/HrTaxProfileMapper.java','service/HrHCipherService.java','service/HrHException.java')){$Sources+=Join-Path $Hr ('src/main/java/com/cloudflow/hr/'+$Relative)}
$Sources+=@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/encrypt-checks') -Filter '*.java' -Recurse -File|Select-Object -ExpandProperty FullName)
$Sources+=Join-Path $Root 'scripts/fixture-checks/FixtureInspectionSql.java'
Require ($Sources.Count -eq 24) 'Codec compiled source scope differs'
$FingerprintPaths=@($Sources)+@((Join-Path $Root 'scripts/verify-batch-h-encryption-codec.ps1'),(Join-Path $Hr 'target/batch-g-classpath.txt'),(Join-Path $Root 'scripts/fixture-checks/mapper/FixtureInspectionMapper.xml'))
$Entries=foreach($Path in ($FingerprintPaths|Sort-Object -Unique)){$Path+':'+(Get-FileHash -LiteralPath $Path).Hash}
$Fingerprint=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($Entries -join [char]10)))).ToLowerInvariant()
Require ($Fingerprint -eq 'e48352c4185d31917638c802296b206c8a3df3481e28c909e7714f4706b10c78') 'Current codec sources differ from verified offline execution'
$Payroll=Read-Json "d3-official-tax-20261006-$PayrollRound/result.json"
foreach($Property in @('passed','boundaries','rounding','threshold','cumulative','zeroIncome','yearReset','activation','snapshots','browser','preservation','restoration','secrets','officialTaxPolicyVerified')){Require ($Payroll.$Property -eq $true) "Current payroll evidence incomplete: $Property"}
Require ($Payroll.officialPolicyYear -eq 2026 -and $Payroll.cases -eq 25 -and $Payroll.slips -eq 29 -and $Payroll.tasks -eq 5 -and $Payroll.checks -contains 'new_profile_allowances_encrypted') 'Current payroll or real encryption scope differs'
$Pictures=@(Get-ChildItem -LiteralPath (Join-Path $Evidence "d3-official-tax-20261006-$PayrollRound") -Filter '*-main-page.png' -File)
Require ($Pictures.Count -eq 3) 'Current three payroll page captures required'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Adjacent checks incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Expected reference environment required'
foreach($Owned in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)";Require ($Observed -and $Observed.CommandLine.Contains($Owned.marker)) 'Reference process ownership differs'}
foreach($Service in $State.services){
    $Loaded=@($Reload.Services|Where-Object Name -EQ $Service.name);$Owned=@($State.processes|Where-Object name -EQ $Service.name)
    Require ($Loaded.Count -eq 1 -and $Owned.Count -eq 1 -and $Loaded[0].Pid -eq $Owned[0].id) 'Service changed since B114 ordinary measurement'
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Reference service unhealthy'
}
$EvidenceFiles=@('d2-encrypt-metadata-checks-r3-launch.log','d2-current-first-20261006-r5/measurement-result.json','d2-leave-attendance-20261005-r17/result.json',"d3-official-tax-20261006-$PayrollRound/result.json",'backend-executable-verification-20261006-r5/result.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log")
$Hashes=@($EvidenceFiles|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Evidence $_)).Hash}})+@($Pictures|ForEach-Object{[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Evidence,$_.FullName);Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
[pscustomobject]@{Passed=$true;Backend='r114';Frontend='r72';Inputs=$Inputs.Count;InputChanges=0;ProductChanges=$Changes;CodecAssertions=1363;CodecSourceFingerprint=$Fingerprint;AttendanceChecks=37;AttendanceMeasurements=@($Direct.measurements);PerformanceMet=$PerformanceMet;PayrollRound=$PayrollRound;PayrollChecks=$Payroll.checks.Count;PayrollFindings=$Payroll.findings.Count;PayrollRealEncryptedStorage=$true;OfficialPolicyYear=2026;PayrollPictures=$Pictures.Count;AdjacentRound=$AdjacentRound;AdjacentInputs=$AdjacentInputs;Processes=9;HealthyServices=6;Evidence=$Hashes;D3PriorAll18Version='r113/f72';AllD3TestsReexecuted=$false;D2All17Complete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D2_ENCRYPT_METADATA_STAGE: inputs=$($Inputs.Count); codec=1363; attendance=37; performance_met=$PerformanceMet; payroll_checks=$($Payroll.checks.Count); payroll_findings=$($Payroll.findings.Count); adjacent=$AdjacentInputs; processes=9; healthy=6; global_complete=false"
