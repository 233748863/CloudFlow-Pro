param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ActualRound='r75',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r78')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c3-linked-reads-checkpoint-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous linked-read summary'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require-Text([string]$Relative,[string]$Pattern){if(-not (Select-String -LiteralPath (Join-Path $Evidence $Relative) -Pattern $Pattern -Quiet)){throw "Required summary absent: $Relative"}}
$Step='inputs'
try {
    $Hashes=@{}
    foreach($Snapshot in @('h3-portal-finance-20261002-backend-r77-inputs.json','h3-portal-finance-20261002-frontend-r50-inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json","c1-form-live-20261005-$ActualRound/inputs.json")){
        foreach($Input in @(Read-Json $Snapshot)){
            $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
            if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
            $Actual=if($Hashes.ContainsKey($Resolved)){$Hashes[$Resolved]}else{(Get-FileHash -LiteralPath $Resolved).Hash}
            if($Actual -ne $Input.Hash){throw "Executed input changed: $($Input.Path)"}
            $Hashes[$Resolved]=$Actual
        }
    }
    $Step='actual';$Base="c1-form-live-20261005-$ActualRound";$Live=Read-Json "$Base/result.json"
    if(-not $Live.passed -or -not $Live.isolated -or -not $Live.linkedReadsExecuted -or -not $Live.checks.Count -or @($Live.checks|Where-Object{-not $_.passed}).Count){throw 'Linked actual verification incomplete'}
    $Detail=Read-Json "c3-linked-reads-$($Live.runId)/result.json"
    if(-not $Detail.passed -or $Detail.stage -ne 'complete' -or $Detail.files.Count -ne 8 -or $Detail.tasks.Count -ne 2 -or $Detail.databaseWrites -ne 0 -or $Detail.redisDeletes -ne 0 -or $Detail.fabricatedResponses -ne 0){throw 'Linked scope incomplete'}
    $Labels=@($Detail.cases.label)
    foreach($Phase in @('pending','done')){
        foreach($Actor in @('employee','admin')){
            foreach($File in $Detail.files){
                $Prefix='c3_linked_{0}_{1}_{2}' -f $Phase,$Actor,$File.key
                $Suffixes=if($Actor -eq 'employee' -and $File.hidden){@('_metadata_denied','_content_denied','_preview_denied')}else{@('_metadata','_download','_preview','_preview_range')}
                foreach($Suffix in $Suffixes){if(($Prefix+$Suffix) -notin $Labels){throw 'File visibility phase missing'}}
            }
        }
    }
    foreach($Label in @('c3_linked_draft_hidden_startHiddenDepartment','c3_linked_draft_hidden_startParentDepartment','c3_linked_draft_hidden_items.startHiddenDepartment',
        'c3_linked_pending_denied_hiddenDepartment','c3_linked_pending_denied_parentDepartment','c3_linked_pending_denied_items.hiddenDepartment',
        'c3_linked_pending_denied_readonlyDepartment','c3_linked_pending_denied_items.readonlyDepartment','c3_linked_readonly_node_department',
        'c3_linked_readonly_node_layoutDepartment','c3_linked_readonly_node_items.department','c3_linked_admin_task_hidden',
        'c3_linked_private_ticket_other_session','c3_linked_public_ticket_other_session','c3_linked_bound_invalidates_unbound_ticket')){
        if($Label -notin $Labels){throw 'Required denial missing'}
    }
    foreach($File in @($Detail.files|Where-Object hidden)){foreach($Suffix in @('_metadata','_download','_preview')){if(("c3_linked_forged_path_"+$File.key+$Suffix) -notin $Labels){throw 'Forged field path not verified'}}}
    $PreviewRequests=@($Live.requests|Where-Object path -like '/auth/system/file/preview-content*')
    if(-not $PreviewRequests.Count -or @($PreviewRequests|Where-Object path -ne '/auth/system/file/preview-content').Count){throw 'Preview query credentials retained in public evidence'}
    Require-Text "$Base/summary.log" 'changed=0; exit=0; passed=True'
    foreach($Prefix in @('C_LOG_SCAN','C_AUDIT_SCAN','C2_FORM_SAVE_AUDIT:')){Require-Text "$Base/live.log" "$Prefix .*plaintext_hits=0"}
    $Step='captcha'
    Require-Text "c3-linked-reads-actual-$ActualRound-launch.log" 'original_limit=100; original_ttl=-1;.*counter_writes=0; database_unchanged=true'
    $Step='adjacent'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log" 'changed=0; exit=0'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '^PASS: Complete approved schema table count; expected=374; actual=374'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '1012'
    $Step='runtime';$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'RUNNING' -or $State.oauth2Fixture -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned runtime incomplete'}
    $Step='preview-audits'
    $AllPreview=@($Live.requests|Where-Object path -like '/auth/system/file/preview-*')
    $TraceList=@($AllPreview|ForEach-Object{if($_.traceId -notmatch '^[a-f0-9]{32}$'){throw 'Invalid preview trace'};"'$($_.traceId)'"}) -join ','
    $Query="SELECT JSON_OBJECT('path',request_url,'rows',COUNT(*),'traces',COUNT(DISTINCT trace_id),'parameterRows',SUM(params IS NOT NULL AND params <> '')) FROM sys_log WHERE trace_id IN ($TraceList) GROUP BY request_url;"
    $AuditLines=@(& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names cloud_flow_db -e $Query)
    if($LASTEXITCODE -ne 0){throw 'Preview audit read failed'}
    $Audits=@($AuditLines|ForEach-Object{$_|ConvertFrom-Json})
    if(@($Audits|Where-Object parameterRows -ne 0).Count){throw 'Preview audit retained parameters'}
    foreach($Operation in @('ticket','content')){
        $Expected=@($AllPreview|Where-Object path -eq "/auth/system/file/preview-$Operation").Count
        foreach($Prefix in @('/auth','')){
            $Rows=@($Audits|Where-Object path -eq "$Prefix/system/file/preview-$Operation")
            if($Rows.Count -ne 1 -or $Rows[0].traces -ne $Expected -or $Rows[0].rows -ne $Expected){throw 'Preview audit request coverage incomplete'}
        }
    }
    if(-not @($Audits|Where-Object {$_.path -eq '/inner/workflow/file-preview/authorize' -and $_.rows -gt 0}).Count){throw 'Internal preview authorization audit missing'}
    $Audits|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'preview-audits.json') -Encoding utf8NoBOM
    $Step='runtime'
    foreach($Owned in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)";if(-not $Current -or -not $Owned.marker -or -not $Current.CommandLine.Contains($Owned.marker)){throw "Owned process unavailable: $($Owned.name)"}}
    foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5;if($Health.status -ne 'UP'){throw "Owned service unhealthy: $($Service.name)"}}
    [ordered]@{passed=$true;backend='r77';frontend='r50';actualRound=$ActualRound;adjacentRound=$AdjacentRound;checks=$Live.checks.Count;requests=$Live.requests.Count;cases=$Detail.cases.Count;files=8;tasks=2;currentInputs=$Hashes.Count;healthyServices=6;ownedProcesses=9;c3All16Complete=$false;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C3_LINKED_CHECKPOINT: passed=true; current_inputs=$($Hashes.Count); cases=$($Detail.cases.Count); files=8; tasks=2; services=6; processes=9; c3_all_16_complete=false; complete_35_prd=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
}catch{
    [ordered]@{passed=$false;step=$Step;c3All16Complete=$false;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
