"""Deterministic links and small, connected fixtures for the full rebuild seed.

Kept separate from the mature display-data generator. External integrations stay
disabled; tokens are expired, work requests are drafts and no external effect is
claimed. One fixture per tenant is sufficient for singleton/operational tables.
"""
import argparse
import json
import re
from demo_seed_model import schema, relationships, POLYMORPHIC, TARGET_KEYS, DB, ROOT

MODEL = schema()
INDEX = {name: i + 1 for i, name in enumerate(sorted(MODEL))}
SUPPLEMENT = set('''sys_data_source_config sys_data_source_registration hr_employee_referral
hr_employee_advance hr_advance_repayment hr_appraisal_cycle hr_appraisal_kra hr_appraisal_result
hr_skill hr_position_skill hr_employee_skill sys_portal_user sys_message_delivery
crm_mass_email_recipient crm_email_tracking_link crm_email_suppression crm_email_record
crm_opportunity_item crm_opportunity_stage_history crm_deal_team crm_deal_event crm_deal_allocation
oa_meeting_reminder wf_form_draft wf_agent_setting wf_gateway_activation wf_parallel_join
hr_overtime_request hr_shift_request oa_consumable_ledger oa_consumable_request
oa_consumable_request_item biz_purchase_receipt sys_oauth2_client sys_oauth2_code
sys_oauth2_access_token sys_oauth2_refresh_token sys_oauth2_approve sys_report_dataset
sys_report_chart sys_report_dashboard sys_report_dashboard_item sys_tenant_package
sys_tenant_package_sync sys_tenant_package_sync_item sys_im_config sys_im_user_mapping
sys_im_dept_mapping sys_im_todo_mapping sys_im_sync_run sys_im_callback_event
hr_severance_rule hr_severance_rule_slab hr_final_settlement hr_final_settlement_item
hr_training_recovery hr_exit_interview'''.split())
REFS, UNKNOWN = relationships(MODEL)
if UNKNOWN:
    raise RuntimeError(UNKNOWN)
REF = {(r['table'], r['column']): r for r in REFS}


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def identity(table, key=None, row='r.n'):
    key = key or TARGET_KEYS.get(table, MODEL[table]['primary'][0])
    if table in SUPPLEMENT:
        row = '0'
    if table == 'sys_tenant':
        return '(100000+t.n)'
    if key == 'user_name':
        return f"IF({row}=0,'admin',CONCAT('demo_u',LPAD({row}+1,2,'0')))"
    if table == 'sys_menu':
        return f'(3000+{row})'
    if MODEL[table]['columns'][key]['type'].startswith(('varchar', 'char', 'text')):
        return f"CONCAT('demo50_t',LPAD(t.n,2,'0'),'_{table}_',LPAD({row}+1,3,'0'),'_{key}')"
    result = f'(1000000+{INDEX[table]*100000}+t.n*1000+{row}+1)'
    if table in ('sys_user', 'sys_role'):
        result = f'IF(t.n=0 AND {row}=0,1,{result})'
    return result


def existing(table, key=None, order=None):
    key = key or TARGET_KEYS.get(table, MODEL[table]['primary'][0])
    scope = 'p.tenant_id=100000+t.n' if 'tenant_id' in MODEL[table]['columns'] else '1=1'
    return f'(SELECT p.`{key}` FROM cloud_flow_db.`{table}` p WHERE {scope} ORDER BY {order or "p.`"+key+"`"} LIMIT 1)'


def report_metadata():
    """Read the selected report's registration, including its exact description."""
    source = (ROOT / 'cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/report/ReportRegistry.java').read_text(encoding='utf-8')
    block = source.split('dataset("CRM_FUNNEL",', 1)[1].split('dataset("CRM_AGING",', 1)[0]
    header = re.match(r'\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*List.of\("([^"]+)"\), false, null,\s*"([^"]+)"', block)
    if not header:
        raise ValueError('CRM_FUNNEL registration changed; update fixture parser')
    name, module, mapper, permission, access, description = header.groups()
    operators = {}
    for kind in ('TEXT', 'ORDERED'):
        match = re.search(kind + r'_OPERATORS = List.of\(([^)]+)\)', source)
        operators[kind] = re.findall(r'"([^"]+)"', match[1])
    fields = []
    for match in re.finditer(r'(dimension|count|amount)\("([^"]+)",\s*"([^"]+)"(?:,\s*"([^"]+)")?\)', block):
        kind, code, label, data_type = match.groups()
        fields.append(dict(code=code, name=label, type=data_type or 'NUMBER', dimension=kind=='dimension',
            aggregates=[] if kind=='dimension' else ['COUNT' if kind=='count' else 'SUM'],
            operators=operators['TEXT' if data_type=='TEXT' else 'ORDERED'] if kind!='count' else [],
            unit=None if kind=='dimension' else ('条' if kind=='count' else '源业务金额')))
    if len(fields) != 6:
        raise ValueError('CRM_FUNNEL fields changed')
    return dict(code='CRM_FUNNEL', name=name, module=module, mapperMethod=mapper,
        permission='system:report:data:'+permission, sourcePermissions=[access], timeBased=False,
        unitPartition=None, description=description, fields=fields)


# Each discriminator is paired with an actual row of its documented business type.
CANONICAL = {
    ('sys_file','biz_id'): 'CONTRACT', ('sys_message_record','biz_id'): 'APPROVAL',
    ('sys_print_record','biz_id'): 'ASSET_LABEL', ('sys_business_rule_hit_record','business_id'): 'CONTRACT',
    ('wf_transaction_message','business_id'): 'HR_CONTRACT_RENEW',
    ('wf_callback_dead_letter','business_id'): 'HR_CONTRACT_RENEW',
    ('wf_callback_side_effect','business_id'): 'HR_CONTRACT_RENEW',
    ('wf_timeout_alert','target_id'): 'TASK', ('wf_audit_log','target_id'): 'INSTANCE',
    ('hr_audit_log','business_id'): 'EMPLOYEE',
    ('hr_headcount','target_id'): 'DEPT', ('hr_schedule_assignment','target_id'): 'EMPLOYEE',
    ('hr_contract_signature','signer_id'): 'EMPLOYEE', ('hr_performance_assignment','assignee_id'): 'EMPLOYEE',
    ('hr_point_transaction','source_id'): 'BENEFIT',
    ('hr_grievance','against_id'): 'EMPLOYEE', ('hr_grievance','related_biz_id'): 'HR_CONTRACT_RENEW',
    ('hr_employee_skill','evidence_biz_id'): 'TRAINING',
    ('oa_budget_plan','target_id'): 'DEPT', ('oa_budget_ledger','target_id'): 'DEPT',
    ('oa_budget_ledger','business_id'): 'EXPENSE_CLAIM',
    ('oa_invoice_writeoff','business_id'): 'RECEIVABLE',
    ('oa_trace_event','business_id'): 'CONTRACT', ('oa_trace_event','related_id'): 'CONTRACT',
    ('oa_risk_alert','business_id'): 'CONTRACT', ('oa_contract','source_id'): 'CUSTOMER',
    ('oa_project','source_id'): 'OPPORTUNITY',
    ('oa_borrow_reminder_log','business_id'): 'LICENSE', ('oa_borrow_reminder_log','resource_id'): 'LICENSE',
    ('oa_asset_log','ref_id'): '1', ('crm_handover_task','business_id'): 'CUSTOMER',
    ('crm_approval','business_ref_id'): 'CUSTOMER', ('crm_activity','biz_id'): 'CUSTOMER',
    ('crm_activity_participant','participant_ref_id'): 'USER',
    ('crm_target_list_member','member_ref_id'): 'CONTACT', ('crm_sla_policy','entity_id'): 'CUSTOMER',
    ('crm_campaign_log','target_id'): 'CONTACT', ('crm_mass_email_recipient','target_id'): 'CONTACT',
    ('crm_email_record','biz_id'): 'CUSTOMER', ('crm_deal_team','biz_id'): 'CONTRACT',
    ('crm_deal_event','biz_id'): 'CONTRACT',
    ('hr_final_settlement_item','source_biz_id'): 'HR_TRAINING_RECOVERY',
    ('oa_consumable_ledger','source_biz_id'): 'PURCHASE_RECEIPT',
    ('oa_consumable_ledger','source_item_id'): 'PURCHASE_RECEIPT',
}


def expression_map():
    result = {}
    for ref in REFS:
        table, column, target = ref['table'], ref['column'], ref['target']
        if column == 'parent_id':
            if table in ('sys_dept','sys_menu'):
                continue
            value = 'NULL' if MODEL[table]['columns'][column]['nullable'] else '0'
        elif target == table:
            value = 'NULL' if MODEL[table]['columns'][column]['nullable'] else identity(target, ref['key'])
        elif table == 'sys_file' and column == 'portal_owner_id':
            value = 'NULL'
        elif table == 'sys_user_blacklist' and column == 'user_id':
            value = identity(target, ref['key'], '1+MOD(r.n,49)')
        elif target in ('hr_overtime_type','crm_sales_stage'):
            value = existing(target)
        else:
            value = identity(target, ref['key'])
        result[f'{table}.{column}'] = value
    # Source history rows identify their original task, even after it is retired.
    result['wf_task_history.task_id'] = identity('wf_task')
    result['outbox_event.event_id'] = identity('outbox_event', 'event_id')
    result['outbox_event.aggregate_type'] = "'CUSTOMER'"
    result['outbox_event.aggregate_id'] = identity('crm_customer')
    result['outbox_event.status'] = "'PUBLISHED'"
    result['wf_reconcile_alert.biz_module'] = "'oa'"
    result['wf_reconcile_alert.biz_id'] = identity('oa_contract')
    for (table,column),(discriminator,targets) in POLYMORPHIC.items():
        if (table,column) not in CANONICAL:
            continue  # Optional source links deliberately left to their domain generator.
        kind = CANONICAL[(table,column)]
        result[f'{table}.{discriminator}'] = quote(kind)
        result[f'{table}.{column}'] = identity(targets[kind])
    return result


# Explicit scenarios for the tables which formerly had to remain empty.
VALUES = {}


def values(table, **items):
    invalid = set(items) - set(MODEL[table]['columns'])
    if invalid:
        raise ValueError(f'Unknown fixture columns {table}: {sorted(invalid)}')
    VALUES.setdefault(table, {}).update(items)


values('sys_data_source_config', config_name="'停用演示数据源'", ds_key="'demo_disabled'",
       url="'jdbc:mysql://db.example.invalid:3306/demo'", username="'demo_disabled'",
       password_encrypted="'DEMO_DISABLED_NOT_A_SECRET'", init_size='0', max_active='1', target_services="JSON_ARRAY('auth')", status="'DISABLED'")
values('sys_data_source_registration', service_name="'auth'", instance_key="'demo-offline'", applied_version='0', status="'DISABLED'")
values('sys_oauth2_client', client_type="'PUBLIC'", client_key="CONCAT('demo_disabled_',t.n)", client_secret_encrypted='NULL',
       redirect_uris="JSON_ARRAY('https://example.invalid/callback')", grant_types="JSON_ARRAY('authorization_code')",
       scopes="JSON_ARRAY('profile.read')", status="'DISABLED'", access_token_validity_seconds='900', refresh_token_validity_seconds='604800')
values('sys_oauth2_code', status="'DENIED'", redirect_uri="'https://example.invalid/callback'", requested_scopes="JSON_ARRAY('profile.read')",
       code_challenge="REPEAT('x',43)", code_challenge_method="'S256'", client_version='0', expires_time="'2026-01-01 00:15:00'")
for table in ('sys_oauth2_access_token','sys_oauth2_refresh_token','sys_oauth2_approve'):
    values(table, scopes="JSON_ARRAY('profile.read')", client_version='0',
           expires_time="'2026-01-01 00:15:00'", revoked_time="'2026-01-01 00:01:00'")
    if table != 'sys_oauth2_approve':
        values(table, issued_time="'2026-01-01 00:00:00'")
    else:
        values(table, approved_time="'2026-01-01 00:00:00'")
values('sys_oauth2_refresh_token', status="'REVOKED'")
values('sys_oauth2_access_token', grant_type="'authorization_code'")
values('sys_report_dataset', dataset_code="'CRM_FUNNEL'", dataset_name="'销售漏斗'", module="'crm'", mapper_method="'CrmReportMapper.funnel'",
       field_meta=quote(json.dumps(report_metadata(),ensure_ascii=False)), default_filters="JSON_OBJECT('rollingDays',0)",
       tenant_isolated_flag='1', data_scope_flag='1', permission_code="'system:report:data:crm-funnel'", status="'ACTIVE'")
values('sys_report_chart', chart_name="'销售漏斗演示'", chart_type="'BAR'", dimensions="JSON_ARRAY('STAGE')",
       measures="JSON_ARRAY(JSON_OBJECT('field','OPPORTUNITY_COUNT','aggregate','COUNT'))", limit_rows='50', share_scope="'PRIVATE'")
values('sys_report_dashboard', dashboard_name="'业务演示看板'", share_scope="'PRIVATE'")
values('sys_report_dashboard_item', grid_x='0', grid_y='0', grid_w='6', grid_h='4')
values('sys_tenant_package', package_code="'DEMO_DRAFT'", menu_ids='JSON_ARRAY(1,2,3,6,7)', max_users='100', max_storage_mb='10240',
       enabled_modules="JSON_ARRAY('WORKFLOW','OA','CRM','HR')", price='0', billing_cycle="'NONE'", status="'DRAFT'")
values('sys_tenant_package_sync', package_version='0', target_tenant_ids='JSON_ARRAY(100000+t.n)', preview_expire_time="'2026-01-01 00:00:00'", status="'CANCELLED'")
values('sys_tenant_package_sync_item', expected_version='0', before_snapshot='JSON_OBJECT()', proposed_snapshot='JSON_OBJECT()', status="'PREVIEWED'")
values('sys_im_config', im_type="'WECOM'", corp_id="'demo-disabled'", agent_id="'demo-disabled'", app_secret_encrypted="'DEMO_DISABLED_NOT_A_SECRET'",
       sync_enabled='0', login_enabled='0', message_enabled='0', todo_enabled='0', status="'DISABLED'")
for table in ('sys_im_user_mapping','sys_im_dept_mapping','sys_im_todo_mapping'):
    values(table, im_type="'WECOM'", status="'DISABLED'" if table != 'sys_im_todo_mapping' else "'CANCELLED'")
values('sys_im_user_mapping', bind_type="'MANUAL_BIND'")
values('sys_im_todo_mapping', assignment_version='0')
values('sys_im_sync_run', config_version='0', mode="'PREVIEW'", full_snapshot_flag='0', status="'FAILED'")
values('sys_im_callback_event', event_type="'DEMO_REJECTED'", status="'REJECTED'", result_code="'DEMO_DISABLED'")
values('sys_portal_user', user_type="'CUSTOMER_CONTACT'", ref_biz_type="'CRM_CONTACT'",
       ref_biz_id=identity('crm_contact',row='0'), customer_id=identity('crm_customer',row='0'),
       email="CONCAT('portal',t.n,'@example.invalid')", status="'DISABLED'")
values('sys_message_delivery', status="'SKIPPED'", channel_type="'INTERNAL'", attempt_count='0')
values('crm_email_record', direction="'OUTBOUND'", send_status="'DRAFT'",
       to_addresses="JSON_ARRAY(CONCAT('contact',t.n,'@example.invalid'))")
values('crm_mass_email_recipient', crm_email_id='NULL', target_type="'CONTACT'", status="'SKIPPED'", email_encrypted="'DEMO_DISABLED_NOT_AN_EMAIL'", email_hash="SHA2(CONCAT('demo-contact-',t.n),256)")
values('crm_email_suppression', email_hash="SHA2(CONCAT('demo-contact-',t.n),256)", reason="'MANUAL'")
values('crm_email_tracking_link', destination_url="'https://example.invalid/demo'", destination_hash="SHA2('https://example.invalid/demo',256)")
values('crm_opportunity_item', quantity='2', unit_price='100', discount_rate='100', tax_rate='0', line_amount='200', tax_amount='0')
values('crm_opportunity_stage_history', from_stage="'LEAD'", to_stage="'QUALIFIED'", duration_seconds='0')
values('crm_deal_team', allocated_percentage='1', allocated_amount='200', commission_rate='NULL', commission_amount='0', role_type="'OWNER'", current_flag='1', team_version='1')
values('crm_deal_event', event_type="'CONTRACT'", amount='200', currency="'CNY'", team_version='1', baseline_flag='1',
       source_snapshot="JSON_OBJECT('source','demo-fixture','amount',200,'currency','CNY')")
values('crm_deal_allocation', allocated_percentage='1', allocated_amount='200', commission_rate='NULL', commission_amount='NULL', role_type="'OWNER'", commission_status="'NOT_APPLICABLE'")
values('hr_skill', skill_code="'DEMO_SKILL'", skill_name="'业务协作'", level_definition="JSON_OBJECT('1','入门','2','基础','3','熟练','4','精通','5','专家')", status="'ACTIVE'")
values('hr_position_skill', required_level='3', weight='1', mandatory_flag='1')
values('hr_employee_skill', current_level='3', assessment_status="'APPROVED'", current_flag='1', assess_time="'2026-10-01 09:00:00'")
values('hr_appraisal_cycle', cycle_name="'2026年度演示周期'", cycle_type="'YEARLY'", start_date="'2026-01-01'", end_date="'2026-12-31'",
       evaluation_method="'KRA_WEIGHTED'", final_score_mode="'WEIGHTED_AVG'", score_config="JSON_OBJECT('minScore',0,'maxScore',100)", status="'DRAFT'")
values('hr_appraisal_kra', kra_name="'业务交付'", weight='1', sort_no='1')
values('hr_appraisal_result', scope_snapshot='JSON_OBJECT()', status="'PENDING'")
values('hr_employee_referral', referrer_name="'演示推荐人'", candidate_name="'演示候选人'", contact_phone="'13800000000'",
       email="CONCAT('candidate',t.n,'@example.invalid')", status="'SCREENING'", bonus_applicable_flag='0', bonus_status="'NOT_APPLICABLE'")
# A released reservation demonstrates the ledger without inventing a payment.
values('hr_employee_advance', advance_amount='1000', repaid_amount='0', outstanding_amount='0', reserved_amount='0', written_off_amount='0',
       repay_mode="'LUMP_SUM'", status="'APPLYING'", approval_status="'DRAFT'")
values('hr_advance_repayment', repay_amount='100', repay_type="'MANUAL'", status="'RELEASED'")
values('hr_severance_rule', rule_code="'DEMO_DRAFT'", rule_name="'演示补偿草案'", effective_from="'2026-01-01'",
       salary_component_ids='JSON_ARRAY()', averaging_months='12', service_rounding="'ACTUAL_MONTHS'", notice_months='0', status="'DRAFT'")
values('hr_severance_rule_slab', sort_no='1', min_service_years='0', calculation_mode="'PER_YEAR'", compensation_months='1')
values('hr_final_settlement', settlement_kind="'NORMAL'", superseded_flag='0', join_date="'2025-01-01'", relieving_date="'2026-10-01'",
       work_years='1.75', total_payable='0', total_receivable='100', asset_recovery_cost='0', severance_amount='0', net_amount='-100', status="'DRAFT'", approval_status="'DRAFT'")
values('hr_final_settlement_item', item_type="'RECEIVABLE'", item_name="'演示待核定款项'", amount='100', confirmed_flag='0', source_posted_flag='0')
values('hr_training_recovery', assessed_amount='100', collected_amount='0', assessment_reason="'演示培训协议核定追偿100元，尚未收款'", status="'CONFIRMED'",
       confirmed_by=identity('sys_user',row='0'), confirmed_time="'2026-10-01 09:00:00'")
values('hr_exit_interview', interview_time="'2026-10-01 10:00:00'", status="'DRAFT'")
values('hr_overtime_request', work_date="'2026-10-19'", attendance_date="'2026-10-19'", date_type="'WORKDAY'", triple_pay_flag='0',
       start_time="'2026-10-19 18:00:00'", end_time="'2026-10-19 20:00:00'", requested_minutes='120',
       overtime_type_id=existing('hr_overtime_type', order="(p.type_code='WORKDAY') DESC,p.type_id"), settle_mode="'PAY'", rate_multiplier='1.5',
       status="'DRAFT'", settlement_status="'NOT_READY'", settled_flag='0', currency="'CNY'")
values('hr_shift_request', request_mode="'SINGLE'", from_shift_id=identity('hr_shift', row='0'), to_shift_id=identity('hr_shift', row='1'),
       from_date="'2026-10-19'", to_date="'2026-10-19'", peer_acceptance_status="'NONE'", status="'DRAFT'", application_status="'NOT_READY'")
values('wf_form_draft', definition_id=existing('wf_process_definition'), form_id=existing('wf_process_definition','form_id', order='p.definition_id'),
       form_data="JSON_OBJECT('remark','演示草稿')", node_assignees='JSON_OBJECT()', lock_version='1',
       last_save_time='CURRENT_TIMESTAMP', expire_time='DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 30 DAY)')
values('wf_agent_setting', principal_user_id=identity('sys_user',row='0'), agent_user_id=identity('sys_user',row='1'),
       agent_mode="'AGENT'", definition_ids='JSON_ARRAY()', start_time="'2026-01-01 00:00:00'", end_time="'2026-01-02 00:00:00'", status="'DISABLED'")
values('wf_gateway_activation', gateway_id="'demo-fork'", join_node_key="'demo-join'", join_type="'PARALLEL'",
       activated_branches="JSON_ARRAY('demo-branch')", expected_count='1', status="'CANCELLED'")
values('wf_parallel_join', gateway_id="'demo-fork'", branch_key="'demo-branch'", join_type="'PARALLEL'", expected_count='1')
values('oa_meeting_reminder', event_id=existing('oa_schedule_event'), remind_minutes_before='15', status="'CANCELLED'")
values('oa_consumable_request', status="'DRAFT'")
values('oa_consumable_request_item', apply_quantity='1', approved_quantity='0', issued_quantity='0', returned_quantity='0', unit_price='100', amount='100')
values('oa_consumable_ledger', transaction_type="'INBOUND'", quantity='1', unit_price='100', amount='100', balance_after='1', balance_amount_after='100', avg_cost_after='100')
values('biz_purchase_receipt', received_quantity='1')


def supplement_expression(table, column, meta, links):
    if column in VALUES.get(table, {}):
        return VALUES[table][column]
    if column == 'tenant_id':
        return '100000+t.n'
    if column in MODEL[table]['primary']:
        return identity(table, column)
    if meta['nullable']:
        # Only explicit scenario links are populated; optional effects stay absent.
        if (table,column) in POLYMORPHIC and (table,column) in CANONICAL:
            return links[f'{table}.{column}']
        if column in ('candidate_id','settlement_id','customer_id','campaign_id','mass_email_id') and (table,column) in REF:
            return identity(REF[(table,column)]['target'], REF[(table,column)]['key'])
        return 'NULL'
    if f'{table}.{column}' in links:
        return links[f'{table}.{column}']
    if meta['default'] is not None and meta['default'].upper() != 'NULL':
        return meta['default']
    kind = meta['type']
    if kind.startswith('json'):
        return 'JSON_OBJECT()'
    if kind.startswith(('datetime','timestamp')):
        return "'2026-10-01 09:00:00'"
    if kind == 'date':
        return "'2026-10-01'"
    if kind.startswith(('decimal','int','tinyint','smallint','bigint','double','float')):
        return '1'
    if 'hash' in column or 'digest' in column:
        return f"SHA2(CONCAT('demo:{table}:{column}:',t.n),256)"
    enum = re.search(r'\b([A-Z][A-Z_]{2,})\b', meta['comment'])
    if enum and column.endswith(('type','mode','status')):
        return quote(enum[1])
    length = re.search(r'\((\d+)\)', kind)
    return f"LEFT(CONCAT('demo-',LPAD(t.n,2,'0'),'-{table}-{column}'),{int(length[1]) if length else 200})"


def sql():
    links = expression_map()
    out = ['-- Connected operational fixtures; requires fresh 01-06 plus the generated 07 prefix.']
    for table in sorted(SUPPLEMENT):
        definition = MODEL[table]
        columns = [c for c,m in definition['columns'].items() if not m['generated']]
        expr = [supplement_expression(table,c,definition['columns'][c],links).replace('r.n','0') for c in columns]
        out.append(f'INSERT INTO cloud_flow_db.`{table}` ('+','.join(f'`{c}`' for c in columns)+')\nSELECT '+','.join(expr)+' FROM demo_seed_tenants t;')
    # Reconcile the materialized display balances with the explicit source rows.
    # Restrict every update to the deterministic IDs generated by this run.
    def update(table, assignments, first_only=False):
        key = MODEL[table]['primary'][0]
        row_join = '(SELECT 0 n) r' if first_only else 'demo_seed_rows r'
        out.append(f'UPDATE `{table}` s JOIN demo_seed_tenants t JOIN {row_join} ON s.`{key}`={identity(table,key)} SET {assignments};')
    update('biz_purchase_item', 's.quantity=1,s.unit_price=100,s.amount=100,s.received_quantity=IF(r.n=0,1,0)')
    update('biz_purchase_request', "s.total_amount=100,s.status=IF(r.n=0,'RECEIVED','DRAFT'),s.payment_status='NONE',s.payment_request_id=NULL,s.instance_id=NULL")
    update('oa_consumable', 's.quantity=IF(r.n=0,1,0),s.stock_amount=IF(r.n=0,100,0),s.avg_cost=IF(r.n=0,100,0),s.last_purchase_price=IF(r.n=0,100,NULL)')
    update('oa_asset_log', f"s.ref_type='2',s.ref_id={identity('oa_consumable',row='0')},s.type='入库',s.quantity_change=1,s.remark='演示采购入库，与耗材台账一致'", True)
    update('oa_contract', "s.amount=200,s.currency='CNY',s.status='SIGNED',s.signed_flag=1", True)
    update('crm_opportunity', 's.expected_amount=200,s.weighted_amount=ROUND(200*s.win_rate/100,2)', True)
    update('outbox_event', f"s.event_id={identity('outbox_event','event_id')},s.aggregate_type='CUSTOMER',s.aggregate_id={identity('crm_customer')},s.status='PUBLISHED'")
    update('oa_trace_event', f"s.related_type='CONTRACT',s.related_id={identity('oa_contract')}")
    update('wf_reconcile_alert', f"s.biz_module='oa',s.biz_id={identity('oa_contract')},s.wf_instance_id={identity('wf_process_instance')}")
    update('sys_message_record', "s.channel_type='INTERNAL',s.send_status='SKIPPED',s.skip_reason='NO_CHANNEL',s.send_time=NULL,s.retry_count=0", True)
    update('sys_message_delivery', 's.outbox_event_id=(SELECT p.outbox_event_id FROM sys_message_record p WHERE p.record_id=s.record_id AND p.tenant_id=s.tenant_id)', True)
    update('hr_final_settlement_item', "s.item_name='演示已核定培训追偿',s.confirmed_flag=1,s.source_snapshot=JSON_OBJECT('assessedAmount',100,'collectedAmount',0,'source','demo-fixture')", True)
    # Clone the canonical 2026 template rather than inventing a second calendar.
    out.append('DELETE FROM sys_holiday_date WHERE calendar_id<>100 AND create_by=\'demo50\';')
    out.append('INSERT INTO sys_holiday_date (tenant_id,calendar_id,holiday_date,date_type,holiday_name,triple_pay_flag,year_no,remark,deleted,version,create_by,create_time) SELECT c.tenant_id,c.calendar_id,d.holiday_date,d.date_type,d.holiday_name,d.triple_pay_flag,2026,d.remark,0,0,\'demo50\',NOW() FROM sys_holiday_calendar c CROSS JOIN (SELECT holiday_date,date_type,holiday_name,triple_pay_flag,remark FROM sys_holiday_date WHERE calendar_id=100 AND year_no=2026) d WHERE c.calendar_id<>100 AND c.tenant_id BETWEEN 100000 AND 100049;')
    from demo_seed_retirement import sql as retirement_sql
    out.append(retirement_sql())
    for source in ('sys_log','sys_api_error_log'):
        out.append(f'CREATE TABLE IF NOT EXISTS {source}_archive LIKE {source};')
        out.append(f'INSERT INTO {source}_archive SELECT * FROM {source} ORDER BY {MODEL[source]["primary"][0]} LIMIT 1;')
    return '\n'.join(out)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    print(json.dumps(expression_map(),ensure_ascii=True) if args.json else sql())
