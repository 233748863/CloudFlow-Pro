param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ActualRound='r73',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r77',
    [Parameter(Mandatory=$true)][string]$FixturePath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c3-oauth-resources-checkpoint-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous C3 OAuth summary'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require-Text([string]$Relative,[string]$Pattern){if(-not (Select-String -LiteralPath (Join-Path $Evidence $Relative) -Pattern $Pattern -Quiet)){throw "Required summary absent: $Relative"}}
$Step='restore'
try{
    $ManifestFile=(Resolve-Path -LiteralPath $FixturePath).Path
    $FixtureDirectory=Split-Path -Parent $ManifestFile
    if((Split-Path -Parent $FixtureDirectory) -ne (Join-Path $Run 'private') -or (Split-Path -Leaf $FixtureDirectory) -notmatch '^oauth2-[a-f0-9]{32}$' -or (Split-Path -Leaf $ManifestFile) -ne 'fixture.json'){throw 'Owned OAuth manifest required'}
    $Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
    if($Manifest.status -ne 'RESTORED' -or $Manifest.statePath -ne (Join-Path $Run 'state.json') -or $Manifest.files.Count -ne 2){throw 'OAuth configuration not restored'}
    $Restored=@{}
    foreach($File in $Manifest.files){
        if($File.name -notin @('auth','gateway')){throw 'Unexpected restored service'}
        $Relative=".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($File.name)/integration.properties"
        if((Get-FileHash -LiteralPath (Join-Path $Root $Relative)).Hash -ne $File.originalHash -or (Get-FileHash -LiteralPath (Join-Path $FixtureDirectory ($File.name+'.properties.before'))).Hash -ne $File.originalHash){throw 'Original configuration bytes not restored'}
        $Restored[$Relative]=$File
    }
    $Step='inputs';$Hashes=@{};$RuntimeRevisions=[Collections.Generic.List[object]]::new()
    foreach($Snapshot in @('h3-portal-finance-20261002-backend-r77-inputs.json','h3-portal-finance-20261002-frontend-r50-inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json","c1-form-live-20261005-$ActualRound/inputs.json")){
        foreach($Input in @(Read-Json $Snapshot)){
            $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path));if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
            $Actual=if($Hashes.ContainsKey($Resolved)){$Hashes[$Resolved]}else{(Get-FileHash -LiteralPath $Resolved).Hash}
            if($Actual -ne $Input.Hash){
                if(-not $Restored.ContainsKey($Input.Path) -or $Input.Hash -ne $Restored[$Input.Path].appliedHash -or $Actual -ne $Restored[$Input.Path].originalHash){throw "Executed input changed: $($Input.Path)"}
                $RuntimeRevisions.Add([pscustomobject]@{path=$Input.Path;executed=$Input.Hash;restored=$Actual;reason='Owned OAuth configuration restored to original bytes after actual verification'})
            };$Hashes[$Resolved]=$Actual
        }
    }
    if($RuntimeRevisions.Count -ne 2){throw 'Both temporary OAuth configurations must be recorded'}
    $Step='actual';$Base="c1-form-live-20261005-$ActualRound";$Live=Read-Json "$Base/result.json"
    if(-not $Live.passed -or -not $Live.isolated -or -not $Live.oauthResourcesExecuted -or $Live.checks.Count -eq 0 -or @($Live.checks|Where-Object{-not $_.passed}).Count){throw 'OAuth actual verification incomplete'}
    $Detail=Read-Json "c3-oauth-resources-$($Live.runId)/result.json"
    if(-not $Detail.passed -or $Detail.flows.Count -ne 2 -or $Detail.cases.Count -lt 17 -or $Detail.issuedTokens -ne 5 -or $Detail.clients.Count -ne 3 -or @($Detail.clients|Where-Object{-not $_.retired}).Count -or $Detail.databaseWrites -ne 0 -or $Detail.redisDeletes -ne 0 -or $Detail.fabricatedResponses -ne 0){throw 'OAuth resource scope incomplete'}
    Require-Text "$Base/summary.log" 'changed=0; exit=0; passed=True'
    foreach($Prefix in @('C_LOG_SCAN','C_AUDIT_SCAN','C2_FORM_SAVE_AUDIT:')){Require-Text "$Base/live.log" "$Prefix .*plaintext_hits=0"}
    $Step='adjacent'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log" 'changed=0; exit=0'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '^PASS: Complete approved schema table count; expected=374; actual=374'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '1012'
    $Step='runtime';$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'RUNNING' -or $State.oauth2Fixture -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned runtime incomplete or OAuth still configured'}
    foreach($Owned in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)";if(-not $Current -or -not $Owned.marker -or -not $Current.CommandLine.Contains($Owned.marker)){throw "Owned process unavailable: $($Owned.name)"}}
    foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5;if($Health.status -ne 'UP'){throw "Owned service unhealthy: $($Service.name)"}}
    $Gateway=$State.services|Where-Object name -eq gateway
    $Response=Invoke-WebRequest -Uri "http://127.0.0.1:$($Gateway.port)/oauth2/userinfo" -SkipHttpErrorCheck -TimeoutSec 10
    $Content=if($Response.Content -is [byte[]]){[Text.Encoding]::UTF8.GetString($Response.Content)}else{[string]$Response.Content}
    if([int]$Response.StatusCode -ne 503 -or ($Content|ConvertFrom-Json).error -ne 'temporarily_unavailable'){throw 'Original OAuth unavailable behavior not restored'}
    [ordered]@{passed=$true;backend='r77';frontend='r50';actualRound=$ActualRound;checks=$Live.checks.Count;requests=$Live.requests.Count;cases=$Detail.cases.Count;currentInputs=$Hashes.Count;runtimeRestorations=$RuntimeRevisions;healthyServices=6;ownedProcesses=9;c3All16Complete=$false;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C3_OAUTH_CHECKPOINT: passed=true; current_inputs=$($Hashes.Count); runtime_restorations=2; services=6; processes=9; c3_all_16_complete=false; complete_35_prd=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
}catch{
    [ordered]@{passed=$false;step=$Step;c3All16Complete=$false;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
