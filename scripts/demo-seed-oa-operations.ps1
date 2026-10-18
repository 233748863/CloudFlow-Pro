function Get-OaOperationsDemoExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    $newTables = @('oa_asset_category','oa_asset_depreciation_schedule','oa_asset_maintenance_plan','oa_asset_maintenance_task','oa_asset_repair','oa_asset_movement','oa_supplier_category','oa_supplier_qualification','oa_supplier_scorecard','oa_supplier_score_criteria','oa_supplier_qualification_reminder_log','oa_activity_type','oa_activity_cost','oa_timesheet','oa_timesheet_detail','oa_project_task','oa_project_template','oa_project_template_task','oa_contract_fulfilment_term','oa_contract_template_term','oa_purchase_rfq','oa_purchase_rfq_item','oa_purchase_rfq_supplier','oa_supplier_quotation','oa_supplier_quotation_item')
    if ($name -in $definition.Primary -or $name -eq 'tenant_id') { return $null }
    if ($table -eq 'oa_contract_payment_schedule' -and $name -eq 'milestone_id') { return Get-TargetIdExpression 'oa_contract_milestone' $indexes $definitionMap }
    if ($table -eq 'oa_work_task' -and $name -eq 'milestone_id') { return (Get-TargetIdExpression 'oa_project_task' $indexes $definitionMap) -replace 'r\.n','9' }
    if ($table -eq 'oa_work_task' -and $name -eq 'project_id') { return (Get-TargetIdExpression 'oa_project' $indexes $definitionMap) -replace 'r\.n','0' }
    if ($table -eq 'oa_project_member' -and $name -eq 'project_id') { return (Get-TargetIdExpression 'oa_project' $indexes $definitionMap) -replace 'r\.n','0' }
    if ($table -in @('oa_purchase_request','oa_purchase_request_item') -and $name -in @('rfq_id','rfq_item_id')) { return 'NULL' }
    if ($table -eq 'oa_asset') {
        switch ($name) {
            'category_id' { return Get-TargetIdExpression 'oa_asset_category' $indexes $definitionMap }
            'status' { return "'IDLE'" }
            'purchase_amount' { return '5000.00' }
            'net_book_value' { return '5000.00' }
            'purchase_date' { return 'CURDATE()' }
            'available_from_date' { return 'CURDATE()' }
            'depreciation_flag' { return 'IF(r.n=0,1,0)' }
            'depreciation_method' { return "'STRAIGHT_LINE'" }
            'depreciation_frequency' { return "'MONTHLY'" }
            'useful_life_months' { return '50' }
            'next_depreciation_date' { return 'IF(r.n=0,DATE_ADD(CURDATE(),INTERVAL 1 MONTH),NULL)' }
            'maintenance_required_flag' { return '1' }
            'custodian_id' { return Get-TargetIdExpression 'sys_user' $indexes $definitionMap }
            'owner_id' { return 'NULL' }
            'salvage_value' { return '0.00' }
            'opening_accumulated_depreciation' { return '0.00' }
            'accumulated_depreciation' { return '0.00' }
            'depreciation_completed_flag' { return '0' }
            'disposal_date' { return 'NULL' }
        }
    }
    if ($table -eq 'oa_supplier') {
        if ($name -eq 'category_id') { return Get-TargetIdExpression 'oa_supplier_category' $indexes $definitionMap }
        if ($name -in @('score','standing','indicator_color','last_score_time','blacklist_date','blacklist_by','blacklist_reason','bypass_by','bypass_time','bypass_expire_date','bypass_reason','governance_instance_id','governance_action')) { return 'NULL' }
        if ($name -in @('blacklist_flag','prevent_rfq_flag','prevent_purchase_flag','warn_rfq_flag','warn_purchase_flag','bypass_flag')) { return '0' }
        if ($name -eq 'supplier_no') { return "CONCAT('SUP-',t.n,'-',LPAD(r.n+1,3,'0'))" }
        if ($name -eq 'unified_credit_code') { return "CONCAT('91',LPAD(t.n*50+r.n+1,16,'0'))" }
        if ($name -eq 'status') { return "'ACTIVE'" }
    }
    if ($table -eq 'oa_project') {
        if ($name -in @('estimated_cost','labor_cost_amount','purchase_cost_amount','other_cost_amount','billable_amount','billed_amount','gross_margin','actual_hours','actual_cost_amount')) { return '0.00' }
        if ($name -eq 'gross_margin_rate') { return 'NULL' }
        if ($name -eq 'percent_complete_mode') { return "'TASK_COMPLETION'" }
        if ($name -eq 'progress') { return '0.00' }
        if ($name -eq 'status') { return "'IN_PROGRESS'" }
        if ($name -eq 'start_date') { return 'DATE_SUB(CURDATE(),INTERVAL 7 DAY)' }
        if ($name -eq 'end_date') { return 'DATE_ADD(CURDATE(),INTERVAL 180 DAY)' }
    }
    if ($table -eq 'oa_contract') {
        if ($name -in @('requires_fulfilment_flag','is_signed_flag')) { return '0' }
        if ($name -eq 'fulfilment_status') { return "'NOT_STARTED'" }
        if ($name -in @('fulfilment_deadline','signed_by','signed_by_name','sign_time','sign_ip','sign_attachment_url','supplier_id')) { return 'NULL' }
    }
    $changedColumns = @{ oa_asset=@('purchase_amount','status','category_id','custodian_id','custodian_name','dept_id','dept_name','location_detail','salvage_value','useful_life_months','available_from_date','disposal_date','depreciation_flag','depreciation_method','depreciation_frequency','opening_accumulated_depreciation','accumulated_depreciation','net_book_value','next_depreciation_date','depreciation_completed_flag','insurance_policy_no','insurer_name','insured_value','insurance_start_date','insurance_end_date','insurance_reminder_days','maintenance_required_flag','warranty_expire_date'); oa_supplier=@('supplier_code','supplier_type','category_id','short_name','credit_code','legal_person','register_capital','register_date','business_scope','address','province','city','contact_email','tax_no','tax_rate','payment_terms','currency','cooperation_start_date','level_code','score','standing','indicator_color','last_score_time','blacklist_flag','blacklist_reason','blacklist_by','blacklist_time','prevent_purchase_flag','prevent_rfq_flag','qualification_expire_date','instance_id','bypass_flag','bypass_reason','bypass_by','bypass_expire_date'); oa_project=@('estimated_cost','labor_cost_amount','purchase_cost_amount','other_cost_amount','billable_amount','billed_amount','gross_margin','gross_margin_rate','actual_hours','percent_complete_mode'); oa_project_dependency=@('predecessor_task_id','successor_task_id','dependency_type','version'); oa_contract=@('supplier_id','requires_fulfilment_flag','fulfilment_status','fulfilment_deadline','fulfilled_term_count','total_term_count','fulfilment_progress','signed_flag','sign_method','our_signee_id','our_signee_name','our_sign_time','our_sign_ip','counterparty_signee','counterparty_sign_time','sign_place','sign_remark','signed_file_url','esign_provider','esign_transaction_id'); biz_purchase_request=@('rfq_id'); biz_purchase_item=@('rfq_item_id') }
    if ($table -notin $newTables -and $table -ne 'oa_project_dependency' -and (-not $changedColumns.ContainsKey($table) -or $name -notin $changedColumns[$table])) { return $null }
    if ($name -in @('deleted','version')) { return '0' }
    if ($name -in @('create_by','update_by')) { return "'demo50'" }
    if ($name -in @('create_time','update_time')) { return 'CURRENT_TIMESTAMP' }
    $user = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
    $project = (Get-TargetIdExpression 'oa_project' $indexes $definitionMap) -replace 'r\.n','0'
    $links = @{ asset_id='oa_asset'; supplier_id='oa_supplier'; qualification_id='oa_supplier_qualification'; scorecard_id='oa_supplier_scorecard'; activity_type_id='oa_activity_type'; timesheet_id='oa_timesheet'; employee_id='hr_employee'; contract_id='oa_contract'; rfq_id='oa_purchase_rfq'; quotation_id='oa_supplier_quotation'; rfq_item_id='oa_purchase_rfq_item'; dept_id='sys_dept' }
    switch ($table) {
        'oa_asset_category' {
            if ($name -eq 'category_name') { return "CONCAT($(Get-CatalogExpression @('办公电脑','会议设备','网络设备','办公家具','生产设备')),'-',LPAD(r.n+1,3,'0'))" }
            if ($name -eq 'default_useful_life_months') { return '60' }
            if ($name -eq 'default_salvage_rate') { return '0.0500' }
        }
        'oa_supplier_category' { if ($name -eq 'category_name') { return "CONCAT($(Get-CatalogExpression @('IT设备','实施服务','办公物资','运营服务','专业咨询')),'-',LPAD(r.n+1,3,'0'))" } }
        'oa_asset_depreciation_schedule' {
            switch ($name) {
                'asset_id' { return (Get-TargetIdExpression 'oa_asset' $indexes $definitionMap) -replace 'r\.n','0' }
                'period_no' { return 'r.n+1' }
                'period_date' { return 'DATE_ADD(CURDATE(),INTERVAL (r.n+1) MONTH)' }
                'depreciation_amount' { return '100.00' }
                'accumulated_amount' { return '(r.n+1)*100.00' }
                'net_value' { return '5000.00-(r.n+1)*100.00' }
            }
        }
        'oa_asset_maintenance_plan' {
            if ($name -eq 'responsible_id') { return $user }
            if ($name -eq 'next_due_date') { return 'DATE_ADD(CURDATE(),INTERVAL 30 DAY)' }
            if ($name -eq 'status') { return "'DISABLED'" }
        }
        'oa_asset_maintenance_task' {
            if ($name -eq 'plan_id') { return Get-TargetIdExpression 'oa_asset_maintenance_plan' $indexes $definitionMap }
            if ($name -eq 'planned_date') { return 'DATE_ADD(CURDATE(),INTERVAL 30 DAY)' }
        }
        'oa_asset_repair' {
            if ($name -eq 'report_by') { return $user }
            if ($name -eq 'failure_date') { return 'CURDATE()' }
            if ($name -eq 'fault_description') { return "'待排查设备异常，确认处理方案后提交维修'" }
        }
        'oa_asset_movement' {
            if ($name -eq 'purpose') { return "'TRANSFER'" }
            if ($name -eq 'movement_date') { return 'CURDATE()' }
            if ($name -eq 'from_custodian_id') { return $user }
            if ($name -eq 'to_custodian_id') { return $user -replace 'r\.n','MOD(r.n+1,50)' }
            if ($name -eq 'reason') { return "'项目交付设备调配，待审批后执行'" }
        }
        'oa_supplier_qualification' {
            if ($name -eq 'qualification_type') { return "'BUSINESS_LICENSE'" }
            if ($name -eq 'cert_name') { return "'营业执照（待核验）'" }
            if ($name -eq 'expire_date') { return 'DATE_ADD(CURDATE(),INTERVAL 180 DAY)' }
        }
        'oa_supplier_scorecard' {
            if ($name -eq 'period_start') { return "DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'),INTERVAL 1 MONTH)" }
            if ($name -eq 'period_end') { return "DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'),INTERVAL 1 DAY)" }
        }
        'oa_supplier_score_criteria' {
            if ($name -eq 'criteria_code') { return "'QUALITY'" }
            if ($name -eq 'criteria_name') { return "'质量合格率'" }
            if ($name -eq 'weight') { return '1.0000' }
        }
        'oa_supplier_qualification_reminder_log' {
            if ($name -eq 'expire_date') { return 'DATE_ADD(CURDATE(),INTERVAL 180 DAY)' }
            if ($name -eq 'days_before') { return '180' }
            if ($name -eq 'recipient_id') { return $user }
            if ($name -eq 'reminder_type') { return "'MANUAL'" }
            if ($name -eq 'cert_name') { return "'营业执照（待核验）'" }
        }
        'oa_activity_type' {
            if ($name -eq 'type_name') { return "CONCAT($(Get-CatalogExpression @('开发实施','现场交付','客户培训','项目管理','内部协作')),'-',LPAD(r.n+1,3,'0'))" }
            if ($name -eq 'billable_default_flag') { return '1' }
        }
        'oa_activity_cost' {
            if ($name -in @('employee_id','job_level_id')) { return '0' }
            if ($name -eq 'costing_rate') { return '120.00' }
            if ($name -eq 'billing_rate') { return '240.00' }
            if ($name -eq 'effective_start') { return "'2026-01-01'" }
        }
        'oa_timesheet' {
            if ($name -eq 'start_date') { return 'DATE_SUB(CURDATE(),INTERVAL WEEKDAY(CURDATE()) DAY)' }
            if ($name -eq 'end_date') { return 'DATE_ADD(DATE_SUB(CURDATE(),INTERVAL WEEKDAY(CURDATE()) DAY),INTERVAL 6 DAY)' }
            if ($name -in @('total_hours','billable_hours')) { return '8.00' }
        }
        'oa_timesheet_detail' {
            if ($name -eq 'project_id') { return $project }
            if ($name -eq 'task_id') { return Get-TargetIdExpression 'oa_project_task' $indexes $definitionMap }
            if ($name -eq 'work_date') { return 'CURDATE()' }
            if ($name -eq 'hours') { return '8.00' }
            if ($name -eq 'billable_flag') { return '1' }
            if ($name -eq 'description') { return "'实施交付与问题核验，待提交后锁定单价'" }
        }
        'oa_project_task' {
            if ($name -in @('opening_actual_hours','actual_hours')) { return '0.00' }
            if ($name -eq 'project_id') { return $project }
            if ($name -eq 'assignee_id') { return $user }
            if ($name -eq 'is_milestone_flag') { return 'IF(MOD(r.n,10)=9,1,0)' }
            if ($name -eq 'task_weight') { return 'IF(MOD(r.n,10)=9,3.00,1.00)' }
            if ($name -eq 'subject') { return "CONCAT($(Get-CatalogExpression @('需求确认','方案设计','功能交付','集成验证','阶段验收')),'-',LPAD(r.n+1,3,'0'))" }
            if ($name -eq 'planned_start') { return 'DATE_ADD(CURDATE(),INTERVAL r.n DAY)' }
            if ($name -eq 'planned_end') { return 'DATE_ADD(CURDATE(),INTERVAL (r.n+5) DAY)' }
            if ($name -eq 'planned_hours') { return '8.00' }
        }
        'oa_project_dependency' {
            if ($name -eq 'project_id') { return $project }
            if ($name -eq 'predecessor_task_id') { return (Get-TargetIdExpression 'oa_project_task' $indexes $definitionMap) -replace 'r\.n','IF(r.n=49,0,r.n)' }
            if ($name -eq 'successor_task_id') { return (Get-TargetIdExpression 'oa_project_task' $indexes $definitionMap) -replace 'r\.n','IF(r.n=49,49,r.n+1)' }
        }
        'oa_project_template_task' {
            if ($name -eq 'template_id') { return Get-TargetIdExpression 'oa_project_template' $indexes $definitionMap }
            if ($name -eq 'planned_hours') { return '8.00' }
            if ($name -eq 'subject') { return "'项目交付与验收'" }
        }
        'oa_contract_fulfilment_term' {
            if ($name -eq 'term_no') { return '1' }
            if ($name -eq 'responsible_party') { return "'OUR'" }
            if ($name -eq 'responsible_id') { return $user }
            if ($name -eq 'term_content') { return "'按约定完成交付并留存双方确认的验收材料'" }
            if ($name -eq 'deadline_date') { return 'DATE_ADD(CURDATE(),INTERVAL 30 DAY)' }
        }
        'oa_contract_template_term' {
            if ($name -eq 'template_id') { return Get-TargetIdExpression 'oa_contract_template' $indexes $definitionMap }
            if ($name -eq 'term_no') { return '1' }
            if ($name -eq 'responsible_party') { return "'OUR'" }
            if ($name -eq 'term_content') { return "'按约定完成交付并留存双方确认的验收材料'" }
            if ($name -eq 'deadline_offset_days') { return '30' }
        }
        'oa_purchase_rfq' {
            if ($name -eq 'owner_id') { return $user }
            if ($name -eq 'project_id') { return 'NULL' }
            if ($name -eq 'quote_deadline') { return 'DATE_ADD(CURDATE(),INTERVAL 7 DAY)' }
            if ($name -eq 'expected_delivery_date') { return 'DATE_ADD(CURDATE(),INTERVAL 30 DAY)' }
            if ($name -eq 'status') { return "'SENT'" }
            if ($name -eq 'invited_count') { return '1' }
            if ($name -eq 'title') { return "CONCAT('项目办公物资询价-',LPAD(r.n+1,3,'0'))" }
        }
        'oa_purchase_rfq_supplier' {
            if ($name -eq 'invite_time') { return 'CURRENT_TIMESTAMP' }
            if ($name -eq 'invite_channel') { return "'OFFLINE'" }
        }
        'oa_supplier_quotation' {
            if ($name -eq 'quote_date') { return 'CURDATE()' }
            if ($name -eq 'valid_until') { return 'DATE_ADD(CURDATE(),INTERVAL 30 DAY)' }
            if ($name -eq 'entry_by') { return $user }
            if ($name -eq 'total_amount') { return '565.00' }
            if ($name -eq 'tax_amount') { return '65.00' }
        }
    }
    if ($table -in @('oa_purchase_rfq_item','oa_supplier_quotation_item')) {
        if ($name -eq 'item_name') { return "'办公设备标准物料'" }
        if ($name -eq 'unit') { return "'件'" }
        if ($name -eq 'quantity') { return '5' }
        if ($name -in @('expected_price','unit_price')) { return '100.00' }
        if ($name -eq 'tax_rate') { return '0.1300' }
        if ($name -eq 'line_amount') { return '500.00' }
    }
    if ($links.ContainsKey($name)) { return Get-TargetIdExpression $links[$name] $indexes $definitionMap }
    if ($name -eq 'level_path') { return "CONCAT('/',$(Get-NumericIdExpression $indexes[$table]),'/')" }
    if ($name -in @('category_code','type_code','template_code','task_no','repair_no','movement_no','timesheet_no','rfq_no','quotation_no')) { return "CONCAT('F-',t.n,'-',LPAD(r.n+1,3,'0'))" }
    if ($null -ne $column.DefaultExpression) { return $column.DefaultExpression }
    if ($column.Nullable) { return 'NULL' }
    if ($name -match '_id$|_by$') { throw "Unmapped OA reference: $table.$name" }
    if ($column.Type -match 'int|decimal') { return '0' }
    if ($column.Type -match 'datetime|timestamp') { return 'CURRENT_TIMESTAMP' }
    if ($column.Type -match '^date') { return 'CURDATE()' }
    return Limit-TextExpression (Get-TextExpression $definition $column) $column.Length
}

function Write-OaOperationsDefaults($writer, [string]$schemaPath) {
    $seed = Get-Content -LiteralPath (Join-Path $schemaPath '06.cloudflow-business-seed.sql') -Raw -Encoding utf8
    $section = [regex]::Match($seed,'(?s)-- batch-f-operations:start.*?-- batch-f-operations:end')
    if (-not $section.Success) { throw 'Missing Batch F canonical seed section' }
    $writer.WriteLine($section.Value)
}
