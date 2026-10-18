param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ActionRound='r78',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r79',
    [Parameter(Mandatory=$true)][string]$FixturePath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c3-current-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous C3 acceptance evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$EvidenceHashes=@{}
function Read-Json([string]$Relative){
    $File=Join-Path $Evidence $Relative
    $EvidenceHashes[$Relative]=(Get-FileHash -LiteralPath $File).Hash
    Get-Content -LiteralPath $File -Raw|ConvertFrom-Json
}
function Require-Text([string]$Relative,[string]$Pattern){
    $File=Join-Path $Evidence $Relative
    if(-not (Select-String -LiteralPath $File -Pattern $Pattern -Quiet)){throw "Required evidence absent: $Relative"}
    $EvidenceHashes[$Relative]=(Get-FileHash -LiteralPath $File).Hash
}
function Require-Check($Live,[string]$Label){
    if(@($Live.checks|Where-Object{$_.label -eq $Label -and $_.passed}).Count -ne 1){throw "Required successful assertion absent: $Label"}
}
$Hashes=@{}
$Revisions=[Collections.Generic.List[object]]::new()
$ReportRevisions=[Collections.Generic.List[object]]::new()
$ReportBeforeCountFix='8145FE6F2E94D1B32868C20DD6D9FAE73F8794139C12CEEA1EA6959223EF85A6'
$Step='restore'
try {
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
    $LedgerPath=Join-Path $Root 'scripts/c3-accepted-verification-revisions.json'
    $Ledger=@(Get-Content -LiteralPath $LedgerPath -Raw|ConvertFrom-Json)
    if($Ledger.Count -ne 30){throw 'Reviewed revision ledger required'}
    $Allowed=@{}
    foreach($Entry in $Ledger){
        $Key=$Entry.snapshot+'|'+$Entry.path
        if($Allowed.ContainsKey($Key) -or $Entry.historical -notmatch '^[A-F0-9]{64}$' -or $Entry.current -notmatch '^[A-F0-9]{64}$' -or -not $Entry.reason){throw 'Invalid revision ledger'}
        $Allowed[$Key]=$Entry
    }
    function Verify-Inputs([string]$Snapshot,[bool]$Historical=$false){
        $Inputs=@(Read-Json $Snapshot)
        if(-not $Inputs.Count){throw 'Empty verification snapshot'}
        foreach($Input in $Inputs){
            $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
            if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Snapshot input outside workspace'}
            $Actual=if($Hashes.ContainsKey($Resolved)){$Hashes[$Resolved]}else{(Get-FileHash -LiteralPath $Resolved).Hash}
            if($Actual -ne $Input.Hash){
                $Key=$Snapshot+'|'+$Input.Path
                # Adjacent checks hash all scripts but do not execute this report. Preserve its exact prior hash.
                if($Snapshot -eq 'h3-portal-finance-adjacent-20261002-r79/inputs.json' -and $Resolved -eq $PSCommandPath -and $Input.Hash -eq $ReportBeforeCountFix){
                    $ReportRevisions.Add([pscustomobject]@{snapshot=$Snapshot;path=$Input.Path;historical=$Input.Hash;current=$Actual;reason='Summary corrected numeric browser error count; not executed by adjacent checks'})
                }elseif($Historical -and $Allowed.ContainsKey($Key) -and $Allowed[$Key].historical -eq $Input.Hash -and $Allowed[$Key].current -eq $Actual){
                    $Revisions.Add($Allowed[$Key])
                }elseif($Historical -and $Snapshot -eq 'c1-form-live-20261005-r73/inputs.json' -and $Restored.ContainsKey($Input.Path) -and $Restored[$Input.Path].appliedHash -eq $Input.Hash -and $Restored[$Input.Path].originalHash -eq $Actual){
                    $Revisions.Add([pscustomobject]@{snapshot=$Snapshot;path=$Input.Path;historical=$Input.Hash;current=$Actual;reason='Owned OAuth configuration restored; original backup and restoration manifest verified'})
                }else{throw "Unreviewed executed input changed: $($Input.Path)"}
            }
            $Hashes[$Resolved]=$Actual
        }
    }
    $Step='latest-inputs'
    foreach($Snapshot in @('h3-portal-finance-20261002-backend-r77-inputs.json','h3-portal-finance-20261002-frontend-r50-inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json","c1-form-live-20261005-$ActionRound/inputs.json")){
        Verify-Inputs $Snapshot
    }
    foreach($Snapshot in @('c3-permission-paths-20261005-r2/inputs.json','c3-expression-parity-20261005-r1/inputs.json','c1-form-response-20261005-r8/inputs.json')){Verify-Inputs $Snapshot}
    $Step='actual-scopes'
    $Scopes=@(
        @{Name='permission';Round='r63';Flag='permissionPagesExecuted';Directory='c3-permission-pages';Checks=165;Requests=81},
        @{Name='expression';Round='r65';Flag='expressionPagesExecuted';Directory='c3-expression-pages';Checks=138;Requests=70},
        @{Name='cache';Round='r66';Flag='permissionCacheExecuted';Directory='c3-permission-cache';Checks=130;Requests=52},
        @{Name='templates';Round='r67';Flag='matrixTemplatesExecuted';Directory='c3-matrix-templates';Checks=114;Requests=48},
        @{Name='reads';Round='r68';Flag='readEntriesExecuted';Directory='c3-read-entries';Checks=290;Requests=124},
        @{Name='races';Round='r70';Flag='permissionRacesExecuted';Directory='c3-permission-races';Checks=116;Requests=62},
        @{Name='oauth';Round='r73';Flag='oauthResourcesExecuted';Directory='c3-oauth-resources';Checks=219;Requests=113},
        @{Name='linked';Round='r75';Flag='linkedReadsExecuted';Directory='c3-linked-reads';Checks=413;Requests=266},
        @{Name='actions';Round=$ActionRound;Flag='actionReturnsExecuted';Directory='c3-action-returns';Checks=212;Requests=90})
    $LiveResults=@{};$Details=@{}
    foreach($Scope in $Scopes){
        $Base="c1-form-live-20261005-$($Scope.Round)"
        $Live=Read-Json "$Base/result.json"
        if(-not $Live.passed -or -not $Live.isolated -or -not $Live.($Scope.Flag) -or $Live.checks.Count -ne $Scope.Checks -or $Live.requests.Count -ne $Scope.Requests -or @($Live.checks|Where-Object{-not $_.passed}).Count){throw "Actual scope incomplete: $($Scope.Name)"}
        $Detail=Read-Json "$($Scope.Directory)-$($Live.runId)/result.json"
        if(-not $Detail.passed){throw "Detailed scope failed: $($Scope.Name)"}
        if($Detail.PSObject.Properties.Name -contains 'fabricatedResponses' -and $Detail.fabricatedResponses -ne 0){throw 'Real observations required'}
        Require-Text "$Base/summary.log" 'changed=0; exit=0; passed=True'
        foreach($Prefix in @('C_LOG_SCAN','C_AUDIT_SCAN')){Require-Text "$Base/live.log" "$Prefix .*plaintext_hits=0"}
        if($Scope.Name -ne 'permission'){Require-Text "$Base/live.log" 'C2_FORM_SAVE_AUDIT: .*plaintext_hits=0'}
        if($Scope.Name -ne 'actions'){Verify-Inputs "$Base/inputs.json" $true}
        $LiveResults[$Scope.Name]=$Live;$Details[$Scope.Name]=$Detail
    }
    if($Revisions.Count -ne 32){throw 'Exactly 30 reviewed script revisions and two OAuth restorations required'}
    $Step='permission-and-expression'
    if($Details.permission.versions.Count -ne 2 -or $Details.permission.readCases.Count -ne 10 -or -not $Details.permission.realPages -or $Details.permission.pageErrors.Count){throw 'Two real permission versions required'}
    foreach($Version in @(1,2)){
        foreach($Name in @('c3_tamper_audit_is_durable_and_private_v','c3_omitted_readonly_and_hidden_values_preserved_v','c3_page_node_optional_override_completes_v','c3_hr_node_receives_protected_keys_v')){
            Require-Check $LiveResults.permission "$Name$Version"
        }
    }
    if($Details.expression.flows.Count -ne 2 -or -not $Details.expression.realPages -or $Details.expression.pageErrors.Count){throw 'Expression desktop and mobile evidence required'}
    foreach($Label in @('c3_expression_field_insertion','c3_expression_editor_true_preview','c3_expression_editor_false_preview','c3_expression_editor_accepts_five_levels','c3_expression_server_accepts_length_500','c3_expression_mobile_node_controls_restricted','c3_expression_unconfigured_definition_has_no_rules','c3_expression_desktop_final_values','c3_expression_mobile_final_values')){
        Require-Check $LiveResults.expression $Label
    }
    foreach($Input in @('function','property','script','unknown','six_levels')){
        Require-Check $LiveResults.expression "c3_expression_editor_rejects_$Input"
        Require-Check $LiveResults.expression "c3_expression_server_rejects_$Input"
    }
    Require-Check $LiveResults.expression 'c3_expression_server_rejects_length_501'
    Require-Text 'c3-permission-paths-20261005-r2/summary.log' 'changed=0; exit=0'
    Require-Text 'c3-permission-paths-20261005-r2/checks.log' 'cases=10; checks=114; failures=0'
    Require-Text 'c3-expression-parity-20261005-r1/parity.log' 'cases=58; result_checks=174; filter_checks=8; same_corpus=true; passed=true'
    Require-Text 'c1-form-response-20261005-r8/summary.log' 'changed=0; exit=0'
    $Step='cache-matrix-and-races'
    if($Details.cache.definitions.Count -ne 2 -or $Details.cache.observations.Count -ne 14 -or -not $Details.cache.actualRedis -or $Details.cache.helperDatabaseWrites -ne 0){throw 'Real targeted cache invalidation required'}
    foreach($Label in @('c3_cache_saved_definition_evicted','c3_cache_other_definition_retained','c3_cache_next_read_uses_saved_rules','c3_cache_real_service_populated_saved_rules','c3_cache_published_rejection_preserves_entry')){Require-Check $LiveResults.cache $Label}
    if(-not $Details.templates.realPage -or $Details.templates.browserErrors -ne 0){throw 'Real matrix page required'}
    foreach($Label in @('c3_template_saved_all_fields_and_nodes','c3_template_selected_only_changes_target_column','c3_template_inheritance_removes_only_exception','c3_template_published_actions_disabled')){Require-Check $LiveResults.templates $Label}
    if($Details.races.races.Count -ne 2 -or $Details.races.helperDatabaseWrites -ne 0){throw 'Both real writer orderings required'}
    foreach($Suffix in @('a','b')){foreach($Prefix in @('c3_race_two_real_writers_blocked_','c3_race_no_partial_or_lost_permissions_','c3_race_copy_keeps_complete_committed_permissions_','c3_race_original_permissions_preserved_')){Require-Check $LiveResults.races ($Prefix+$Suffix)}}
    $Step='read-entries'
    if($Details.reads.flows.Count -ne 2 -or $Details.reads.cases.Count -ne 76){throw 'Mixed-permission read inventory incomplete'}
    if($Details.oauth.flows.Count -ne 2 -or $Details.oauth.cases.Count -ne 17 -or $Details.oauth.issuedTokens -ne 5 -or $Details.oauth.clients.Count -ne 3 -or @($Details.oauth.clients|Where-Object{-not $_.retired}).Count){throw 'OAuth scope and cleanup incomplete'}
    if($Details.linked.files.Count -ne 8 -or $Details.linked.tasks.Count -ne 2 -or $Details.linked.cases.Count -ne 183){throw 'Attachment and reference scope incomplete'}
    foreach($Name in @('oauth','linked','actions')){
        if($Details[$Name].databaseWrites -ne 0 -or $Details[$Name].redisDeletes -ne 0){throw 'Dedicated scope mutated infrastructure directly'}
    }
    $PreviewRequests=@($LiveResults.linked.requests|Where-Object path -like '/auth/system/file/preview-content*')
    if($PreviewRequests.Count -ne 54 -or @($PreviewRequests|Where-Object path -ne '/auth/system/file/preview-content').Count){throw 'Preview credential-safe evidence required'}
    $PriorLinked=Read-Json 'c3-linked-reads-checkpoint-20261005-r1/result.json'
    if(-not $PriorLinked.passed){throw 'Retained complete attachment audit summary required'}
    $PreviewAudits=@(Read-Json 'c3-linked-reads-checkpoint-20261005-r1/preview-audits.json')
    if(-not $PreviewAudits.Count -or @($PreviewAudits|Where-Object parameterRows -ne 0).Count){throw 'Preview audits retained private parameters'}
    $Step='action-returns'
    $Action=$Details.actions
    if($Action.stage -ne 'complete' -or $Action.flows.Count -ne 2 -or $Action.cases.Count -ne 30 -or $Action.settings.Count -ne 2 -or @($Action.settings|Where-Object{-not $_.retired}).Count){throw 'Both proxy modes and cleanup required'}
    foreach($Mode in @('AGENT','AGENT_ASSIST')){
        $Binding=Read-Json "c3-action-returns-$($LiveResults.actions.runId)/response-binding-$Mode.json"
        if(@($Binding.binding.PSObject.Properties).Count -ne 8 -or @($Binding.binding.PSObject.Properties|Where-Object Value -ne $true).Count){throw 'Action binding response incomplete'}
        foreach($Prefix in @('c3_action_response_has_no_form_payload_','c3_action_return_persisted_','c3_action_no_duplicate_history_','c3_action_returned_agent_cannot_complete_','c3_action_returned_agent_cannot_read_todo_','c3_action_all_original_values_retained_')){Require-Check $LiveResults.actions ($Prefix+$Mode)}
        foreach($Actor in @('employee','peer','admin')){Require-Check $LiveResults.actions "c3_action_$($Mode)_$($Actor)_done_private_fields"}
    }
    Require-Text "c3-action-returns-actual-$ActionRound-launch.log" 'original_limit=100; original_ttl=-1;.*counter_writes=0; database_unchanged=true'
    $Step='adjacent-and-runtime'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log" 'changed=0; exit=0'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '^PASS: Complete approved schema table count; expected=374; actual=374'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '1012'
    $State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'RUNNING' -or $State.oauth2Fixture -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned runtime incomplete'}
    foreach($Owned in $State.processes){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
        if(-not $Current -or -not $Owned.marker -or -not $Current.CommandLine.Contains($Owned.marker)){throw "Owned process unavailable: $($Owned.name)"}
    }
    foreach($Service in $State.services){
        $Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
        if($Health.status -ne 'UP'){throw "Owned service unhealthy: $($Service.name)"}
    }
    $Step='prd-mapping'
    $PrdPath='docs/prd/C3-LC-04-字段级权限-PRD.md'
    $Numbers=@(Get-Content -LiteralPath (Join-Path $Root $PrdPath)|Where-Object{$_ -match '^\| AC-([0-9]+) \|'}|ForEach-Object{[int]([regex]::Match($_,'AC-([0-9]+)').Groups[1].Value)})
    if($Numbers.Count -ne 16 -or @($Numbers|Sort-Object -Unique).Count -ne 16 -or @((1..16)|Where-Object{$_ -notin $Numbers}).Count){throw 'Exactly sixteen current C3 criteria required'}
    $Mapping=@(
        @{id='AC-1';evidence=@('permission/r63','reads/r68','oauth/r73','actions/'+$ActionRound);scope='当前及历史参与者隐藏字段键剔除'},
        @{id='AC-2';evidence=@('permission/r63','reads/r68','oauth/r73','linked/r75');scope='隐藏字段定义与标签剔除'},
        @{id='AC-3';evidence=@('reads/r68','oauth/r73','linked/r75','actions/'+$ActionRound,'response/r8');scope='全部表单读取入口、附件引用和动作；跨模块最终返回与无外读快照另列源码边界'},
        @{id='AC-4';evidence=@('permission/r63');scope='篡改拒绝、任务和值保持且安全审计'},
        @{id='AC-5';evidence=@('permission/r63','actions/'+$ActionRound);scope='省略只读及隐藏字段时完整原值保持'},
        @{id='AC-6';evidence=@('permission/r63');scope='两版本节点必填双向覆盖'},
        @{id='AC-7';evidence=@('permission/r63','reads/r68','oauth/r73','linked/r75');scope='两行子表列值、定义和附件权限'},
        @{id='AC-8';evidence=@('parity/r1','expression/r65');scope='58组两端174项比较和双端真实显隐'},
        @{id='AC-9';evidence=@('parity/r1','expression/r65','response/r8');scope='函数、属性和脚本注入拒绝'},
        @{id='AC-10';evidence=@('parity/r1','expression/r65');scope='运行时未知引用false和安全日志、编辑器阻止保存'},
        @{id='AC-11';evidence=@('parity/r1','expression/r65');scope='5/6层与500/501字符边界'},
        @{id='AC-12';evidence=@('parity/r1','expression/r65');scope='节点隐藏及只读优先于表达式'},
        @{id='AC-13';evidence=@('expression/r65');scope='无权限规则定义完整读写、审批及值保持'},
        @{id='AC-14';evidence=@('cache/r66');scope='真实定向失效、下次生效和其他定义缓存保持'},
        @{id='AC-15';evidence=@('permission/r63','expression/r65','templates/r67');scope='矩阵批量、模板、继承、语法和预览'},
        @{id='AC-16';evidence=@('paths/r2','permission/r63','races/r70');scope='布局字段复制、两版本和真实保存发布竞争完整性'})
    $Inventory='docs/design/C3-读取入口核对-20261005.md'
    $BoundarySources=@('docs/design/C3-全项验收映射-20261004.md',$Inventory)
    $BoundaryHashes=@($BoundarySources|ForEach-Object{[pscustomobject]@{path=$_;hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
    $Step='final-input-stability'
    foreach($Path in @($Hashes.Keys)){if((Get-FileHash -LiteralPath $Path).Hash -ne $Hashes[$Path]){throw 'Input changed during acceptance summary'}}
    foreach($Path in @($EvidenceHashes.Keys)){if((Get-FileHash -LiteralPath (Join-Path $Evidence $Path)).Hash -ne $EvidenceHashes[$Path]){throw 'Evidence changed during acceptance summary'}}
    [ordered]@{passed=$true;backend='r77';frontend='r50';prd=$PrdPath;prdSha256=(Get-FileHash -LiteralPath (Join-Path $Root $PrdPath)).Hash;acceptanceCount=16;mapping=$Mapping;currentInputs=$Hashes.Count;historicalRevisions=$Revisions;reportRevisions=$ReportRevisions;ledgerSha256=(Get-FileHash -LiteralPath $LedgerPath).Hash;scopes=$Scopes;sourceBoundaryDocuments=$BoundaryHashes;evidenceHashes=$EvidenceHashes;healthyServices=6;ownedProcesses=9;c3All16Complete=$true;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C3_CURRENT_ACCEPTANCE: backend=r77; frontend=r50; criteria=16; passed=true; current_inputs=$($Hashes.Count); reviewed_script_revisions=30; oauth_restorations=2; services=6; processes=9; complete_35_prd=false; production_modified=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
}catch{
    [ordered]@{passed=$false;step=$Step;c3All16Complete=$false;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
