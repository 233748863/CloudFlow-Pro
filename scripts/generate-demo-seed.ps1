[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\cloudflow-backend\DB\07.cloudflow-demo-seed.sql'),
    [string]$SchemaPath = (Join-Path $PSScriptRoot '..\cloudflow-backend\DB'),
    [ValidateRange(50, 50)][int]$RowsPerTenant = 50,
    [ValidateRange(50, 50)][int]$TenantCount = 50,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$tenantBase = 100000
$tenantLast = $tenantBase + $TenantCount - 1
$idBase = 1000000
$tableStride = 100000
$tenantStride = 1000
$demoPassword = '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC'

function Split-SqlParts([string]$text) {
    $parts = [System.Collections.Generic.List[string]]::new()
    $start = 0
    $depth = 0
    $quote = ''
    for ($index = 0; $index -lt $text.Length; $index++) {
        $character = $text[$index]
        if ($quote) {
            if ($character -eq $quote) {
                if ($index + 1 -lt $text.Length -and $text[$index + 1] -eq $quote) { $index++ } else { $quote = '' }
            }
        } elseif ($character -eq "'" -or $character -eq '"' -or [int][char]$character -eq 96) {
            $quote = $character
        } elseif ($character -eq '(') {
            $depth++
        } elseif ($character -eq ')') {
            $depth--
        } elseif ($character -eq ',' -and $depth -eq 0) {
            $parts.Add($text.Substring($start, $index - $start).Trim())
            $start = $index + 1
        }
    }
    if ($start -lt $text.Length) { $parts.Add($text.Substring($start).Trim()) }
    return $parts.ToArray()
}

function Read-Schema([string]$root) {
    $definitions = [System.Collections.Generic.List[object]]::new()
    $files = Get-ChildItem -LiteralPath $root -Filter '*.sql' |
        Where-Object Name -Match '^0[1-5]\.' |
        Sort-Object Name
    foreach ($file in $files) {
        $sql = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $matches = [regex]::Matches($sql, '(?is)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\x60?cloud_flow_db\x60?\.)?\x60?([a-z0-9_]+)\x60?\s*\((.*?)\)\s*ENGINE=')
        foreach ($match in $matches) {
            $columns = [System.Collections.Generic.List[object]]::new()
            $inlinePrimary = [System.Collections.Generic.List[string]]::new()
            foreach ($lineValue in ($match.Groups[2].Value -split '\r?\n')) {
                $line = $lineValue.Trim()
                if (-not $line -or $line -match '^(PRIMARY|UNIQUE|KEY|CONSTRAINT|INDEX|FOREIGN|CHECK)\b') { continue }
                $columnMatch = [regex]::Match($line, '^\x60?([a-zA-Z0-9_]+)\x60?\s+(.+)$')
                if (-not $columnMatch.Success) { continue }
                $rest = $columnMatch.Groups[2].Value.Trim().TrimEnd(',')
                $type = (($rest -split '\s+')[0]).ToLowerInvariant()
                $lengthMatch = [regex]::Match($type, '\((\d+)')
                $columns.Add([pscustomobject]@{
                    Name = $columnMatch.Groups[1].Value.ToLowerInvariant()
                    Type = $type
                    Length = if ($lengthMatch.Success) { [int]$lengthMatch.Groups[1].Value } else { 0 }
                    Auto = $rest -match '(?i)\bAUTO_INCREMENT\b'
                })
                if ($rest -match '(?i)\bPRIMARY\s+KEY\b') { $inlinePrimary.Add($columnMatch.Groups[1].Value.ToLowerInvariant()) }
            }
            $primary = @()
            $primaryMatch = [regex]::Match($match.Groups[2].Value, '(?im)^\s*PRIMARY\s+KEY\s*\(([^)]*)\)')
            if ($primaryMatch.Success) {
                $primary = @(Split-SqlParts $primaryMatch.Groups[1].Value | ForEach-Object { $_.Trim().Trim([char]96).ToLowerInvariant() })
            } elseif ($inlinePrimary.Count -gt 0) {
                $primary = $inlinePrimary.ToArray()
            }
            $columnArray = $columns.ToArray()
            $definitions.Add([pscustomobject]@{
                Table = $match.Groups[1].Value.ToLowerInvariant()
                Columns = $columnArray
                Primary = $primary
                HasTenant = @($columnArray | Where-Object Name -eq 'tenant_id').Count -gt 0
            })
        }
    }
    return $definitions.ToArray()
}

function Quote-Sql([AllowNull()][string]$value) {
    if ($null -eq $value) { return 'NULL' }
    return "'" + $value.Replace('\', '\\').Replace("'", "''") + "'"
}

function Limit-TextExpression([string]$expression, [int]$length) {
    if ($length -gt 0) { return "LEFT($expression, $length)" }
    return $expression
}

function Get-NumericIdExpression([int]$tableIndex, [string]$tenantExpression = 't.n', [string]$rowExpression = 'r.n') {
    return "($idBase + $($tableIndex * $tableStride) + ($tenantExpression * $tenantStride) + $rowExpression + 1)"
}

function Get-StringIdExpression([string]$table, [string]$suffix, [string]$tenantExpression = 't.n', [string]$rowExpression = 'r.n') {
    return "CONCAT('demo50_t', LPAD($tenantExpression, 2, '0'), '_$table`_', LPAD($rowExpression + 1, 3, '0'), '_$suffix')"
}

function Get-TargetTable([string]$column) {
    $map = @{
        dept_id='sys_dept'; role_id='sys_role'; post_id='sys_post'; user_id='sys_user'; employee_id='hr_employee';
        position_id='hr_position'; family_id='hr_position_family'; level_id='hr_job_level'; candidate_id='hr_candidate';
        requisition_id='hr_recruitment_requisition'; interview_id='hr_interview'; offer_id='hr_offer'; shift_id='hr_shift';
        rule_id='hr_attendance_rule'; record_id='hr_attendance_record'; attendance_record_id='hr_attendance_record';
        leave_type_id='hr_leave_type'; request_id='hr_time_request'; component_id='hr_comp_component'; structure_id='hr_comp_structure';
        grade_id='hr_comp_grade'; scheme_id='hr_benefit_scheme'; objective_id='hr_performance_objective';
        assignment_id='hr_performance_assignment'; result_id='hr_performance_result'; review_id='hr_talent_review';
        pool_id='hr_talent_pool'; plan_id='hr_training_plan'; course_id='hr_training_course'; session_id='hr_training_session';
        enrollment_id='hr_training_enrollment'; paper_id='hr_exam_paper'; question_id='hr_exam_question_bank';
        template_id='hr_training_certificate_template'; certificate_id='hr_training_certificate'; injury_id='hr_work_injury';
        dispute_id='hr_labor_dispute'; account_id='hr_point_account'; item_id='hr_mall_item'; order_id='hr_mall_order';
        release_id='sys_legal_release'; document_id='sys_legal_document'; file_id='sys_file'; form_id='wf_form_definition';
        category_id='wf_process_category'; definition_id='wf_process_definition'; process_def_id='wf_process_definition';
        instance_id='wf_process_instance'; process_instance_id='wf_process_instance'; task_id='wf_task'; history_id='wf_task_history';
        attachment_id='wf_task_attachment'; delegation_id='wf_task_delegation'; add_sign_id='wf_task_add_sign';
        countersign_id='wf_countersign_task'; vote_id='wf_countersign_vote'; snapshot_id='wf_process_snapshot';
        message_id='wf_transaction_message'; notice_id='wf_notice'; project_id='oa_project'; contract_id='oa_contract';
        milestone_id='oa_project_milestone'; budget_id='oa_budget_plan'; subject_id='oa_budget_subject'; invoice_id='oa_invoice';
        seal_id='oa_seal'; license_id='oa_license'; vehicle_id='oa_vehicle'; asset_id='oa_asset'; supplier_id='oa_supplier';
        room_id='oa_meeting_room'; minutes_id='oa_meeting_minutes'; visitor_id='oa_visitor'; lead_id='crm_lead';
        customer_id='crm_customer'; contact_id='crm_contact'; opportunity_id='crm_opportunity'; quote_id='crm_quote';
        quote_line_id='crm_quote_line'; receivable_id='crm_receivable'; renewal_id='crm_renewal'; ticket_id='crm_service_ticket';
        sales_target_id='crm_sales_target'
        menu_id='sys_menu'; announcement_id='oa_announcement'
    }
    if ($map.ContainsKey($column)) { return $map[$column] }
    if ($column -match '(?i)(assignee|approver|reviewer|manager|interviewer|investigator|operator|driver|owner|applicant|handler|creator|recipient|sender|voter|evaluatee|evaluator|uploaded_by)_id$') { return 'sys_user' }
    if ($column -match '(?i)(predecessor|successor)_id$') { return 'oa_project' }
    return $null
}

function Get-TargetIdExpression([string]$target, [hashtable]$indexes, [hashtable]$definitionMap) {
    if (-not $target -or -not $indexes.ContainsKey($target)) { return $null }
    if ($target -eq 'sys_menu') { return '(3000+r.n)' }
    $targetDefinition = $definitionMap[$target]
    $primaryName = $targetDefinition.Primary[0]
    $primaryColumn = $targetDefinition.Columns | Where-Object Name -eq $primaryName | Select-Object -First 1
    if ($primaryColumn.Type -match 'char|varchar|text') { return Get-StringIdExpression $target $primaryName }
    $expression = Get-NumericIdExpression $indexes[$target]
    if ($target -eq 'sys_user') { return "IF(t.n=0 AND r.n=0,1,$expression)" }
    return $expression
}

function Get-StatusExpression([string]$table, [string]$column, [string]$type, [int]$length) {
    if ($type -match '(?i)(tinyint|smallint|mediumint|int|bigint|bit)') { return '1' }
    if (($type -match 'char|varchar') -and $length -gt 0 -and $length -le 2) { return "'0'" }
    if ($table -in @('sys_tenant','sys_user','sys_role','sys_post','sys_menu','sys_dict_type','sys_dict_data','sys_config')) { return "'0'" }
    if ($table -eq 'sys_legal_release') { return "'PUBLISHED'" }
    if ($table -eq 'sys_legal_document') { return "'0'" }
    if ($table -eq 'wf_task') { return "ELT(MOD(r.n,5)+1,'TODO','DONE','CANCELLED','TRANSFERRED','DONE')" }
    if ($table -eq 'wf_process_instance') { return "ELT(MOD(r.n,5)+1,'RUNNING','COMPLETED','CANCELLED','REJECTED','SUSPENDED')" }
    if ($table -like 'wf_*') { return "ELT(MOD(r.n,5)+1,'ACTIVE','PENDING','SUCCESS','FAILED','COMPLETED')" }
    if ($table -eq 'hr_employee' -and $column -eq 'employee_status') { return "ELT(MOD(r.n,5)+1,'ACTIVE','ACTIVE','PROBATION','ON_LEAVE','ACTIVE')" }
    if ($table -match '^hr_.*(training|exam)') { return "ELT(MOD(r.n,5)+1,'PLANNED','IN_PROGRESS','COMPLETED','APPROVED','CANCELLED')" }
    if ($table -like 'hr_*') { return "ELT(MOD(r.n,5)+1,'ACTIVE','PENDING','APPROVED','REJECTED','COMPLETED')" }
    if ($table -eq 'crm_lead') { return "ELT(MOD(r.n,5)+1,'NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED')" }
    if ($table -eq 'crm_customer') { return "ELT(MOD(r.n,5)+1,'POTENTIAL','NORMAL','VIP','ACTIVE','DORMANT')" }
    return "ELT(MOD(r.n,5)+1,'DRAFT','PENDING','APPROVED','REJECTED','COMPLETED')"
}

function Get-TextExpression($definition, $column) {
    $table = $definition.Table
    $name = $column.Name
    if ($name -eq 'tenant_code') {
        return "IF(t.n=0,'xinyuan',CONCAT('demo-',ELT(MOD(t.n-1,10)+1,'tech','mfg','retail','pharma','logistics','finance','energy','edu','build','consult'),'-',LPAD(FLOOR((t.n-1)/10)+1,2,'0')))"
    }
    if ($name -eq 'tenant_name') {
        return "IF(t.n=0,'默认租户',CONCAT('云流',ELT(MOD(t.n-1,10)+1,'科技软件','智能制造','连锁零售','医药健康','现代物流','金融服务','新能源','教育服务','工程建设','专业咨询'),LPAD(FLOOR((t.n-1)/10)+1,2,'0')))"
    }
    if ($name -eq 'dict_type') { return "CONCAT('demo_dict_t',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,2,'0'))" }
    if ($table -eq 'sys_user' -and $name -eq 'user_name') { return "IF(r.n=0,'admin',CONCAT('demo_u',LPAD(r.n+1,2,'0')))" }
    if ($name -eq 'password') { return Quote-Sql $demoPassword }
    if ($name -eq 'pwd_reset_required') { return "'0'" }
    if ($name -match '(?i)(email)$') { return "CONCAT('demo',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,2,'0'),'@cloudflow.demo')" }
    if ($name -match '(?i)(phone|phonenumber)$') { return "CONCAT('139',LPAD(MOD(t.n*100+r.n,100000000),8,'0'))" }
    if ($name -match '(?i)(nick_name|contact_name|employee_name|evaluatee_name|evaluator_name|interviewer_name|reviewer_name|driver_name|owner_name|approver_name|operator_name|leader|member_name)$') {
        return "ELT(MOD(t.n+r.n,20)+1,'李晨','王子涵','张嘉宁','刘思远','陈雅宁','杨宇轩','黄清禾','赵俊杰','周欣怡','吴文博','徐雨桐','孙浩然','胡婉晴','朱泽宇','高佳琪','林明远','何诗涵','郭博文','马若琳','罗天佑')"
    }
    if ($name -match '(?i)(employee_no|contract_no|candidate_no|request_no|offer_no|injury_no|dispute_no|cert_no|order_no|invoice_no|quote_no|ticket_no|lead_no|renewal_no|target_no|project_no|budget_no|trip_no|claim_no|payment_no|purchase_no|application_no|requisition_no|process_no|approval_no|change_no|txn_no)$') {
        return "CONCAT(UPPER(LEFT('$table',8)),'-T',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,4,'0'))"
    }
    if ($name -match '(?i)(code|key)$') { return "CONCAT(UPPER(LEFT('$name',12)),'-T',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))" }
    if ($name -match '(?i)(url|path|image|avatar|attachment|receipt)') { return "CONCAT('https://demo.cloudflow.local/$table/t',LPAD(t.n,2,'0'),'/',LPAD(r.n+1,3,'0'))" }
    if ($name -match '(?i)(create_by|update_by|operator|creator)$') { return "IF(r.n=0,'admin','demo_operator')" }
    if ($name -match '(?i)(title|subject|name)$') { return "CONCAT('云流',REPLACE('$table','_',' '),'示例',LPAD(r.n+1,2,'0'))" }
    return "CONCAT('租户',LPAD(t.n,2,'0'),'的$table 第',LPAD(r.n+1,3,'0'),'条全链路演示记录')"
}

function Get-ColumnExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    $type = $column.Type
    if ($name -eq 'tenant_id') { return "($tenantBase + t.n)" }
    if ($table -eq 'sys_tenant' -and $name -eq 'user_limit') { return '100' }
    if ($table -eq 'sys_tenant' -and $name -eq 'storage_limit') { return '10240' }
    if ($name -eq 'deleted') { return '0' }
    if ($name -match '(?i)^(enabled|is_enabled|required|active)$') { return '1' }

    $target = Get-TargetTable $name
    if ($table -like 'oa_knowledge_*' -and $name -eq 'document_id') { $target = 'oa_knowledge_document' }
    if ($target -and $definition.Primary.Count -gt 1) {
        $targetExpression = Get-TargetIdExpression $target $indexes $definitionMap
        if ($targetExpression) { return $targetExpression }
    }
    if ($definition.Primary -contains $name) {
        if ($type -match 'char|varchar|text') { return Get-StringIdExpression $table $name }
        return Get-NumericIdExpression $indexes[$table]
    }
    if ($target) {
        $targetExpression = Get-TargetIdExpression $target $indexes $definitionMap
        if ($targetExpression) { return $targetExpression }
    }

    if ($table -eq 'sys_menu' -and $name -eq 'parent_id') { return 'IF(r.n=0,0,3000)' }
    if ($table -eq 'sys_dept' -and $name -eq 'parent_id') { return 'IF(r.n=0,0,' + (Get-NumericIdExpression $indexes[$table] 't.n' 'r.n-1') + ')' }
    if ($table -eq 'sys_menu' -and $name -eq 'menu_type') { return "IF(r.n=0,'M',IF(r.n<25,'C','F'))" }
    if ($name -match '(?i)(status|_status)$') { return Get-StatusExpression $table $name $type $column.Length }
    if ($name -eq 'direction') { return "IF(MOD(r.n,2)=0,'IN','OUT')" }
    if ($name -eq 'mode') { return "IF(MOD(r.n,2)=0,'BLACK','WHITE')" }
    if ($name -eq 'gender') { return "IF(MOD(r.n,2)=0,'MALE','FEMALE')" }
    if ($name -eq 'sex') { return "IF(MOD(r.n,2)=0,'0','1')" }

    if ($type -match 'json') { return "JSON_OBJECT('source','demo50','tenantId',$tenantBase+t.n,'table','$table','row',r.n+1,'label','全链路演示数据')" }
    if ($type -match '(datetime|timestamp)') {
        if ($name -match '(?i)(end|expire|expiry|deadline|due|renew|next|effective|return)') { return 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL MOD(r.n,90)+1 DAY)' }
        return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL MOD(t.n*50+r.n,365)+1 DAY)'
    }
    if ($type -match '^date') {
        if ($name -match '(?i)(end|expire|expiry|deadline|due|renew|next|effective|return)') { return 'DATE_ADD(CURDATE(), INTERVAL MOD(r.n,90)+1 DAY)' }
        return 'DATE_SUB(CURDATE(), INTERVAL MOD(t.n*50+r.n,365)+1 DAY)'
    }
    if ($type -match '^time') { return "MAKETIME(9+MOD(r.n,8),MOD(r.n*7,60),0)" }
    if ($type -match '(decimal|numeric|double|float)') {
        if ($name -eq 'confidence') { return 'CAST(0.800+MOD(t.n+r.n,190)/1000 AS DECIMAL(4,3))' }
        if ($name -match '(?i)(rate|ratio|percent|percentage|weight|score)') { return 'CAST(60+MOD(t.n+r.n,40) AS DECIMAL(10,2))' }
        if ($name -match '(?i)(progress|days|hours|minutes|duration)') { return 'CAST(1+MOD(r.n,30) AS DECIMAL(10,2))' }
        return 'CAST(1000+MOD(t.n*97+r.n*233,90000) AS DECIMAL(18,2))'
    }
    if ($type -match '(bigint|int|smallint|tinyint|mediumint|bit)') {
        if ($name -match '(?i)(deleted|enabled|is_|required|visible|read_flag|primary|confirmed|locked|active|frame|cache|urgent)') { return 'MOD(r.n,2)' }
        if ($name -match '(?i)year') { return 'YEAR(CURDATE())' }
        if ($name -match '(?i)month') { return 'MOD(r.n,12)+1' }
        if ($name -match '(?i)(days|hours|minutes|duration|progress)') { return 'MOD(r.n,30)+1' }
        return 'r.n+1'
    }
    if ($name -match '(?i)(deleted|enabled|is_|required|visible|read_flag|primary|confirmed|locked|active|frame|cache|urgent)') { return "'0'" }
    return Limit-TextExpression (Get-TextExpression $definition $column) $column.Length
}

function Get-DeletePredicate($definition, [hashtable]$indexes) {
    $table = $definition.Table
    if ($table -in @('sys_log','sys_audit_log','wf_audit_log')) { return '1=0' }
    if ($table -eq 'sys_tenant') { return "tenant_id BETWEEN $($tenantBase + 1) AND $tenantLast" }
    if ($table -eq 'sys_menu') { return 'menu_id BETWEEN 3000 AND 3049' }
    if ($table -eq 'sys_audit_archive_policy') { return "biz_module LIKE 'demo50-%'" }
    if (-not $definition.HasTenant) { return '1=0' }
    $tenantPredicate = "tenant_id BETWEEN $($tenantBase + 1) AND $tenantLast"
    $primaryPredicates = @()
    foreach ($primaryName in $definition.Primary) {
        if ($primaryName -eq 'tenant_id') { continue }
        $primaryColumn = $definition.Columns | Where-Object Name -eq $primaryName | Select-Object -First 1
        if ($primaryColumn.Type -match 'char|varchar|text') { $primaryPredicates += "$primaryName LIKE 'demo50_%'" }
        else {
            $minimum = $idBase + $indexes[$table] * $tableStride + 1
            $maximum = $minimum + $RowsPerTenant - 1
            $primaryPredicates += "$primaryName BETWEEN $minimum AND $maximum"
        }
    }
    if ($primaryPredicates.Count -eq 0) { return $tenantPredicate }
    return "($tenantPredicate) OR (tenant_id=$tenantBase AND (" + ($primaryPredicates -join ' OR ') + '))'
}

$definitions = @(Read-Schema $SchemaPath)
if ($definitions.Count -ne 244) { throw "Expected 244 tables, found $($definitions.Count)." }
$definitionMap = @{}
$indexes = @{}
$tableIndex = 1
foreach ($definition in ($definitions | Sort-Object Table)) {
    $definitionMap[$definition.Table] = $definition
    $indexes[$definition.Table] = $tableIndex
    $tableIndex++
}
if ($ValidateOnly) {
    $definitions | Sort-Object Table | ForEach-Object { "{0}`t{1}`t{2}" -f $_.Table,$_.Columns.Count,$_.HasTenant }
    exit 0
}

$deleteOrder = @($definitions | Sort-Object Table -Descending)
$insertOrderNames = @('sys_tenant','sys_dept','sys_user','sys_role','sys_post','sys_menu','sys_user_role','sys_role_menu','sys_user_post','sys_file','sys_legal_release','sys_legal_document','sys_legal_consent')
$insertOrder = [System.Collections.Generic.List[object]]::new()
foreach ($name in $insertOrderNames) { if ($definitionMap.ContainsKey($name)) { $insertOrder.Add($definitionMap[$name]) } }
foreach ($definition in ($definitions | Sort-Object Table)) { if (-not $insertOrderNames.Contains($definition.Table)) { $insertOrder.Add($definition) } }

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
$writer = [System.IO.StreamWriter]::new($OutputPath, $false, [System.Text.UTF8Encoding]::new($false))
try {
    $writer.WriteLine('-- CloudFlow Pro - 50-tenant full Demo seed')
    $writer.WriteLine('-- Generated by scripts/generate-demo-seed.ps1. Do not hand-edit this file.')
    $writer.WriteLine('-- 242 tenant tables receive 50 rows per tenant; 2 global tables receive 50 rows total.')
    $writer.WriteLine('SET NAMES utf8mb4;')
    $writer.WriteLine('SET FOREIGN_KEY_CHECKS=0;')
    $writer.WriteLine('SET UNIQUE_CHECKS=0;')
    $writer.WriteLine('USE cloud_flow_db;')
    $writer.WriteLine('DROP TEMPORARY TABLE IF EXISTS demo_seed_tenants;')
    $writer.WriteLine('DROP TEMPORARY TABLE IF EXISTS demo_seed_rows;')
    $writer.WriteLine('CREATE TEMPORARY TABLE demo_seed_tenants (n INT NOT NULL PRIMARY KEY);')
    $writer.WriteLine('CREATE TEMPORARY TABLE demo_seed_rows (n INT NOT NULL PRIMARY KEY);')
    $numberValues = 0..($RowsPerTenant - 1) | ForEach-Object { "($_)" }
    $writer.WriteLine('INSERT INTO demo_seed_tenants (n) VALUES ' + ($numberValues -join ',') + ';')
    $writer.WriteLine('INSERT INTO demo_seed_rows (n) VALUES ' + ($numberValues -join ',') + ';')
    $writer.WriteLine('')
    foreach ($definition in $deleteOrder) {
        $writer.WriteLine("DELETE FROM cloud_flow_db.$($definition.Table) WHERE $(Get-DeletePredicate $definition $indexes);")
    }
    $writer.WriteLine('')
    foreach ($definition in $insertOrder) {
        $table = $definition.Table
        if ($table -eq 'sys_tenant') {
            $columns = @($definition.Columns | Where-Object { -not $_.Auto -or $definition.Primary -contains $_.Name })
            $expressions = @()
            foreach ($column in $columns) {
                if ($column.Name -eq 'tenant_id') { $expressions += "($tenantBase+t.n)" }
                elseif ($column.Name -eq 'tenant_code') { $expressions += Get-TextExpression $definition $column }
                elseif ($column.Name -eq 'tenant_name') { $expressions += Get-TextExpression $definition $column }
                else { $expressions += Get-ColumnExpression $definition $column $indexes $definitionMap }
            }
            $writer.WriteLine("INSERT IGNORE INTO cloud_flow_db.$table (" + (($columns | ForEach-Object Name) -join ',') + ')')
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_tenants t CROSS JOIN (SELECT 0 AS n) r;')
            continue
        }
        $columns = @($definition.Columns | Where-Object { -not $_.Auto -or $definition.Primary -contains $_.Name })
        $expressions = @($columns | ForEach-Object { Get-ColumnExpression $definition $_ $indexes $definitionMap })
        $writer.WriteLine("INSERT IGNORE INTO cloud_flow_db.$table (" + (($columns | ForEach-Object Name) -join ',') + ')')
        if ($table -eq 'sys_menu') {
            $expressions = @($expressions | ForEach-Object { $_ -replace 't\.n', '0' })
            $expressions[$columns.Name.IndexOf('menu_id')] = '(3000+r.n)'
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_rows r;')
        } elseif ($table -eq 'sys_audit_archive_policy') {
            $expressions = @($expressions | ForEach-Object { $_ -replace 't\.n', '0' })
            $idIndex = $columns.Name.IndexOf('id')
            if ($idIndex -ge 0) { $expressions[$idIndex] = '(3500+r.n)' }
            $moduleIndex = $columns.Name.IndexOf('biz_module')
            if ($moduleIndex -ge 0) { $expressions[$moduleIndex] = "CONCAT('demo50-',LPAD(r.n+1,3,'0'))" }
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_rows r;')
        } else {
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_tenants t CROSS JOIN demo_seed_rows r;')
        }
    }
    $writer.WriteLine('DROP TEMPORARY TABLE demo_seed_tenants;')
    $writer.WriteLine('DROP TEMPORARY TABLE demo_seed_rows;')
    $writer.WriteLine('SET UNIQUE_CHECKS=1;')
    $writer.WriteLine('SET FOREIGN_KEY_CHECKS=1;')
} finally {
    $writer.Dispose()
}

Write-Host ("Generated {0:N0} bytes for {1} tables." -f (Get-Item -LiteralPath $OutputPath).Length, $definitions.Count)
