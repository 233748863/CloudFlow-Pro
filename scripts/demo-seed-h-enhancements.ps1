function Get-HEnhancementDemoExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    if ($table -in @('hr_performance_objective','hr_performance_assignment','hr_perf_distribution_rule','hr_talent_calibration_session') -and $name -eq 'cycle_id') { return 'NULL' }
    if ($table -eq 'hr_performance_objective' -and $name -eq 'kra_id') { return 'NULL' }
    if ($table -eq 'hr_training_course' -and $name -in @('skill_id', 'target_level')) { return 'NULL' }
    if ($table -eq 'oa_contract' -and $name -in @('portal_term_ids', 'portal_milestone_ids', 'portal_payment_schedule_ids')) { return 'NULL' }
    if ($table -eq 'crm_sales_target') {
        if ($name -eq 'calculation_basis') { return "'OWNER_V1'" }
        if ($name -eq 'currency') { return "'CNY'" }
    }
    if ($table -eq 'wf_task' -and $name -in @('agent_setting_id','proxy_user_id','execution_context')) { return 'NULL' }
    if ($table -eq 'wf_task_history' -and $name -in @('on_behalf_of_user_id','on_behalf_of_user_name')) { return 'NULL' }
    if ($table -eq 'wf_task_delegation') {
        if ($name -eq 'setting_id') { return 'NULL' }
        if ($name -eq 'agent_mode') { return "'DELEGATE'" }
    }
    if ($table -eq 'oa_consumable') {
        if ($name -in @('quantity','avg_cost','stock_amount','version','deleted')) { return '0' }
        if ($name -in @('last_purchase_price','last_calc_time','category_id','max_stock')) { return 'NULL' }
        if ($name -eq 'status') { return "'ACTIVE'" }
    }
    if ($table -eq 'oa_asset_log') {
        if ($name -eq 'ref_type') { return "'1'" }
        if ($name -eq 'ref_id') { return Get-TargetIdExpression 'oa_asset' $indexes $definitionMap }
    }
    if ($table -eq 'biz_purchase_item') {
        if ($name -eq 'received_quantity') { return '0' }
        if ($name -eq 'consumable_id') { return Get-TargetIdExpression 'oa_consumable' $indexes $definitionMap }
        if ($name -in @('consumable_name','model','unit')) {
            $sourceName = if ($name -eq 'consumable_name') { 'name' } else { $name }
            $source = $definitionMap['oa_consumable']
            $sourceColumn = $source.Columns | Where-Object Name -eq $sourceName | Select-Object -First 1
            return Get-TextExpression $source $sourceColumn
        }
    }
    if ($table -eq 'biz_purchase_request' -and $name -eq 'status') { return "'DRAFT'" }
    if ($table -eq 'hr_comp_change') {
        if ($name -in @('salary_component_id','payroll_period_id','source_biz_type','source_biz_id')) { return 'NULL' }
        if ($name -eq 'change_type') { return "'ADJUSTMENT'" }
        if ($name -eq 'status') { return "'DRAFT'" }
    }
    if ($table -eq 'hr_schedule_assignment' -and $name -eq 'source_shift_request_id') { return 'NULL' }
    if ($table -eq 'hr_attendance_checkin' -and $name -eq 'overtime_request_id') { return 'NULL' }
    if ($table -eq 'hr_leave_ledger' -and $name -eq 'source_event_key') { return 'NULL' }
    return $null
}

function Write-HEnhancementDefaults($writer, [string]$schemaPath) {
    $seed = Get-Content -LiteralPath (Join-Path $schemaPath '06.cloudflow-business-seed.sql') -Raw -Encoding utf8
    $section = [regex]::Match($seed, '(?s)-- batch-h-foundations:start.*?-- batch-h-foundations:end')
    if (-not $section.Success) { throw 'Missing Batch H canonical seed section' }
    $writer.WriteLine($section.Value)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE h1_agent_demo_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO h1_agent_demo_guard
SELECT COUNT(*) = 5 FROM cloud_flow_db.sys_menu
WHERE status = '0' AND (menu_id, perms, parent_id) IN
 ((1850,'workflow:agent:mine',2),(1851,'workflow:agent:save',1850),(1852,'workflow:agent:remove',1850),
 (1853,'workflow:agent:return',1850),(1854,'workflow:agent:assist',1850));
DROP TEMPORARY TABLE h1_agent_demo_guard;
INSERT INTO cloud_flow_db.sys_role_menu (role_id, menu_id, tenant_id)
SELECT role.role_id, menu.menu_id, role.tenant_id
FROM cloud_flow_db.sys_role role CROSS JOIN cloud_flow_db.sys_menu menu
WHERE role.tenant_id BETWEEN 100000 AND 100049 AND role.status = '0' AND role.deleted = 0
 AND role.role_key IN ('admin','manager','finance','hr','employee','legal','oa_clerk','sales_manager','sales_rep','crm_ops','customer_success')
 AND menu.menu_id BETWEEN 1850 AND 1854
 AND NOT EXISTS (SELECT 1 FROM cloud_flow_db.sys_role_menu existing
                 WHERE existing.tenant_id = role.tenant_id AND existing.role_id = role.role_id AND existing.menu_id = menu.menu_id);
CREATE TEMPORARY TABLE h5_business_search_demo_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO h5_business_search_demo_guard
SELECT COUNT(*) = 1 FROM cloud_flow_db.sys_menu
WHERE menu_id = 1986 AND perms = 'system:search:business' AND parent_id = 2 AND menu_type = 'F' AND visible = '1' AND status = '0';
DROP TEMPORARY TABLE h5_business_search_demo_guard;
CREATE TEMPORARY TABLE h5_file_preview_demo_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO h5_file_preview_demo_guard
SELECT COUNT(*) = 1 FROM cloud_flow_db.sys_menu
WHERE menu_id = 1985 AND perms = 'system:file:preview' AND parent_id = 2 AND menu_type = 'F' AND visible = '1' AND status = '0';
DROP TEMPORARY TABLE h5_file_preview_demo_guard;
INSERT INTO cloud_flow_db.sys_role_menu (role_id, menu_id, tenant_id)
SELECT role.role_id, menu.menu_id, role.tenant_id
FROM cloud_flow_db.sys_role role CROSS JOIN cloud_flow_db.sys_menu menu
WHERE role.tenant_id BETWEEN 100000 AND 100049 AND role.status = '0' AND role.deleted = 0
 AND role.role_key IN ('admin','manager','finance','hr','employee','legal','oa_clerk','sales_manager','sales_rep','crm_ops','customer_success')
 AND menu.menu_id IN (1985,1986)
 AND NOT EXISTS (SELECT 1 FROM cloud_flow_db.sys_role_menu existing
                 WHERE existing.tenant_id = role.tenant_id AND existing.role_id = role.role_id AND existing.menu_id = menu.menu_id);
'@)
}

function Write-HEnhancementGuard($writer) {
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE h_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO h_demo_seed_guard
SELECT (SELECT COUNT(*) FROM hr_overtime_request WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM hr_appraisal_cycle WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM hr_appraisal_kra WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM hr_appraisal_result WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM hr_shift_request WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM wf_agent_setting WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM wf_gateway_activation WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM wf_parallel_join WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM sys_message_delivery WHERE tenant_id BETWEEN 100000 AND 100049) = 0
 AND (SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id BETWEEN 100000 AND 100049
      AND NOT (tenant_id = 100000 AND ((source_biz_type = 'MANUAL'
       AND source_event_key = CONCAT('SEED:OA08:',consumable_id,':OPENING') AND consumable_id BETWEEN 9001 AND 9008)
       OR (source_biz_type = 'PURCHASE_RECEIPT' AND source_biz_id IN (90031,90032)
           AND source_event_key = CONCAT('PURCHASE_RECEIPT:',source_biz_id))))) = 0;
DROP TEMPORARY TABLE h_demo_seed_guard;
'@)
}
