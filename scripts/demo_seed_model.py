"""Schema and explicit relationships shared by demo generation and live validation.

IDs belonging to providers, workflow nodes and event keys are opaque values, not
database foreign keys. Polymorphic business IDs are resolved by their type column.
"""
from pathlib import Path
import re
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "cloudflow-backend/DB"


def schema():
    result = {}
    for path in sorted(DB.glob("0[1-5]*.sql")):
        source = path.read_text(encoding="utf-8-sig")
        for match in re.finditer(r"CREATE TABLE\s+`?(\w+)`?\s*\((.*?)\)\s*ENGINE", source, re.S | re.I):
            table, body = match.groups()
            columns = {}
            for line in body.splitlines():
                column = re.match(r"\s*`?(\w+)`?\s+((?:bigint|int|smallint|tinyint|mediumint|varchar|char|datetime|timestamp|date|time|decimal|numeric|double|float|json|text|mediumtext|longtext|bit|blob)[^\s]*)\s*(.*)", line, re.I)
                if not column:
                    continue
                name, kind, rest = column.groups()
                default = re.search(r"\bDEFAULT\s+('[^']*'|[^\s,]+)", rest, re.I)
                comment = re.search(r"\bCOMMENT\s+'((?:[^']|'')*)'", rest, re.I)
                columns[name] = dict(type=kind.lower(), nullable="NOT NULL" not in rest.upper(),
                    default=default[1] if default else None, generated="GENERATED ALWAYS" in rest.upper(),
                    comment=comment[1] if comment else "")
            primary = re.search(r"PRIMARY\s+KEY\s*\(([^)]+)\)", body, re.I)
            keys = [p.strip().strip("`") for p in primary[1].split(",")] if primary else [
                m[1] for m in re.finditer(r"^\s*`?(\w+)`?[^\n,]*\bPRIMARY KEY", body, re.I | re.M)]
            if not keys:
                raise ValueError("No primary key: " + table)
            result[table] = dict(columns=columns, primary=keys, body=body)
    return result


COMMON = dict(
    tenant_id="sys_tenant", target_tenant_id="sys_tenant", dept_id="sys_dept", user_id="sys_user",
    role_id="sys_role", post_id="sys_post", menu_id="sys_menu", employee_id="hr_employee",
    position_id="hr_position", family_id="hr_position_family", level_id="hr_job_level", job_level_id="hr_job_level",
    candidate_id="hr_candidate", requisition_id="hr_recruitment_requisition", interview_id="hr_interview",
    offer_id="hr_offer", shift_id="hr_shift", rule_id="hr_attendance_rule", attendance_record_id="hr_attendance_record",
    leave_type_id="hr_leave_type", component_id="hr_comp_component", salary_component_id="hr_comp_component",
    structure_id="hr_comp_structure", grade_id="hr_comp_grade", scheme_id="hr_benefit_scheme",
    objective_id="hr_performance_objective", assignment_id="hr_performance_assignment", result_id="hr_performance_result",
    review_id="hr_talent_review", pool_id="hr_talent_pool", course_id="hr_training_course", session_id="hr_training_session",
    enrollment_id="hr_training_enrollment", paper_id="hr_exam_paper", question_id="hr_exam_question_bank",
    certificate_id="hr_training_certificate", injury_id="hr_work_injury", dispute_id="hr_labor_dispute",
    account_id="hr_point_account", release_id="sys_legal_release", document_id="sys_legal_document", file_id="sys_file",
    form_id="wf_form_definition", definition_id="wf_process_definition", process_def_id="wf_process_definition",
    instance_id="wf_process_instance", process_instance_id="wf_process_instance", task_id="wf_task",
    history_id="wf_task_history", attachment_id="wf_task_attachment", delegation_id="wf_task_delegation",
    countersign_id="wf_countersign_task", snapshot_id="wf_process_snapshot", message_id="wf_transaction_message",
    project_id="oa_project", contract_id="oa_contract", milestone_id="oa_project_task", budget_id="oa_budget_plan",
    subject_id="oa_budget_subject", invoice_id="oa_invoice", seal_id="oa_seal", license_id="oa_license",
    vehicle_id="oa_vehicle", asset_id="oa_asset", supplier_id="oa_supplier", room_id="oa_meeting_room",
    minutes_id="oa_meeting_minutes", visitor_id="oa_visitor", lead_id="crm_lead", customer_id="crm_customer",
    contact_id="crm_contact", opportunity_id="crm_opportunity", quote_id="crm_quote", quote_line_id="crm_quote_line",
    receivable_id="crm_receivable", renewal_id="crm_renewal", ticket_id="crm_service_ticket", sales_target_id="crm_sales_target",
    announcement_id="oa_announcement", calendar_id="sys_holiday_calendar", holiday_calendar_id="sys_holiday_calendar",
    leave_period_id="hr_leave_period", payroll_period_id="hr_payroll_period", policy_id="hr_leave_policy",
    tax_slab_id="hr_tax_slab", grievance_id="hr_grievance", ledger_id="hr_leave_ledger", leave_ledger_id="hr_leave_ledger",
    batch_id="hr_payroll_batch", salary_slip_id="hr_salary_slip", original_slip_id="hr_salary_slip", correction_slip_id="hr_salary_slip",
    overtime_type_id="hr_overtime_type", overtime_request_id="hr_overtime_request", comp_change_id="hr_comp_change",
    payroll_correction_id="hr_payroll_correction", lifecycle_application_id="hr_lifecycle_application",
    settlement_id="hr_final_settlement", payment_request_id="biz_payment_request", training_session_id="hr_training_session",
    consumable_id="oa_consumable", claim_id="biz_expense_claim", expense_claim_id="biz_expense_claim",
    purchase_id="biz_purchase_request", rfq_id="oa_purchase_rfq", rfq_item_id="oa_purchase_rfq_item",
    quotation_id="oa_supplier_quotation", timesheet_id="oa_timesheet", activity_type_id="oa_activity_type",
    qualification_id="oa_supplier_qualification", scorecard_id="oa_supplier_scorecard", usage_id="oa_vehicle_usage",
    borrow_id="oa_license_borrow", vehicle_expense_id="oa_vehicle_expense", schedule_event_id="oa_schedule_event",
    message_record_id="sys_message_record", delivery_id="sys_message_delivery", job_id="sys_job", job_log_id="sys_job_log",
    client_id="sys_oauth2_client", dataset_id="sys_report_dataset", chart_id="sys_report_chart", dashboard_id="sys_report_dashboard",
    package_id="sys_tenant_package", sync_id="sys_tenant_package_sync", activity_id="crm_activity", follow_up_id="crm_follow_up",
    campaign_id="crm_campaign", mass_email_id="crm_mass_email", crm_email_id="crm_email_record", product_id="crm_product",
    competitor_id="crm_competitor", lost_reason_id="crm_lost_reason", territory_id="crm_territory", sla_policy_id="crm_sla_policy",
    skill_id="hr_skill", kra_id="hr_appraisal_kra", cycle_id="hr_appraisal_cycle", advance_id="hr_employee_advance",
    referral_id="hr_employee_referral", parent_instance_id="wf_process_instance", agent_setting_id="wf_agent_setting",
    activation_id="wf_gateway_activation", deploy_id="wf_deploy_record", approval_id="wf_deploy_approval",
    deploy_window_id="wf_deploy_window", urge_id="wf_task_urge", table_id="sys_codegen_table",
    parent_menu_id="sys_menu", channel_id="sys_message_channel", resend_from_id="sys_message_record",
    external_version_id="oa_knowledge_doc_version", seal_application_id="oa_seal_application",
    awarded_supplier_id="oa_supplier", awarded_quotation_id="oa_supplier_quotation", purchase_request_id="oa_purchase_request",
    encashment_component_id="hr_comp_component", compensatory_leave_type_id="hr_leave_type",
    source_shift_request_id="hr_shift_request", appeal_id="hr_attendance_appeal", period_id="hr_leave_period",
    performance_source_objective_id="hr_performance_objective", talent_review_participant_id="hr_talent_review_participant",
    source_review_id="hr_talent_review", joined_review_id="hr_talent_review", source_pool_id="hr_talent_pool",
    escalated_dispute_id="hr_labor_dispute", parent_task_id="oa_project_task", parent_template_task_id="oa_project_template_task",
    task_type_id="oa_project_task_type", predecessor_task_id="oa_project_task", successor_task_id="oa_project_task",
    reversal_of_detail_id="oa_timesheet_detail", source_ledger_id="oa_consumable_ledger", reversal_of_ledger_id="oa_consumable_ledger",
    asset_log_id="oa_asset_log", line_id="oa_budget_line", source_recipient_id="crm_mass_email_recipient",
    task_mapping_id="sys_im_todo_mapping", previous_token_id="sys_oauth2_refresh_token", replaced_by_id="sys_oauth2_refresh_token",
    original_deploy_id="wf_deploy_record", rollback_deploy_id="wf_deploy_record", plan_process_instance_id="wf_process_instance",
    result_process_instance_id="wf_process_instance", wf_instance_id="wf_process_instance",
)

OVERRIDES = {}


def overrides(tables, **columns):
    for table in tables.split():
        OVERRIDES.setdefault(table, {}).update(columns)


overrides("sys_business_rule_version", rule_id="sys_business_rule")
overrides("sys_message_delivery", record_id="sys_message_record")
overrides("sys_print_record", template_id="sys_print_template")
overrides("sys_file", config_id="sys_file_config", portal_owner_id="sys_portal_user")
overrides("sys_data_source_registration", config_id="sys_data_source_config")
overrides("sys_im_user_mapping sys_im_dept_mapping sys_im_todo_mapping sys_im_sync_run sys_im_callback_event", config_id="sys_im_config")
overrides("sys_portal_user", ref_biz_id="crm_contact")
overrides("sys_import_error", task_id="sys_import_task")
overrides("sys_oauth2_client", logo_file_id="sys_file")
overrides("wf_process_definition", template_id="wf_template")
overrides("wf_template", category_id="wf_template_category")
overrides("wf_template_archive", workflow_id="wf_process_definition")
overrides("wf_task_delegation", setting_id="wf_agent_setting")
overrides("hr_lifecycle_detail hr_lifecycle_task", application_id="hr_lifecycle_application")
overrides("hr_candidate", channel_id="hr_recruitment_channel")
overrides("hr_training_course hr_exam_question_bank", category_id="hr_training_category")
overrides("hr_training_course hr_training_session", instructor_id="hr_training_instructor")
overrides("hr_training_session", plan_id="hr_training_plan")
overrides("hr_training_certificate", template_id="hr_training_certificate_template")
overrides("hr_talent_successor", plan_id="hr_talent_succession_plan")
overrides("hr_perf_evaluator", evaluatee_id="hr_employee", evaluator_id="hr_employee")
overrides("hr_perf_evaluator_response", evaluatee_id="hr_employee", evaluator_id="hr_perf_evaluator")
overrides("hr_performance_interview", evaluatee_id="hr_employee")
overrides("hr_mall_order_item", order_id="hr_mall_order", item_id="hr_mall_item")
overrides("hr_tax_slab_detail", slab_id="hr_tax_slab")
overrides("hr_severance_rule_slab hr_final_settlement", rule_id="hr_severance_rule")
overrides("hr_advance_repayment hr_final_settlement hr_leave_ledger crm_deal_event crm_deal_allocation", reversal_of_id="SELF")
overrides("hr_salary_slip", reserved_settlement_id="hr_final_settlement")
overrides("oa_asset", category_id="oa_asset_category")
overrides("oa_supplier", category_id="oa_supplier_category")
overrides("oa_consumable", category_id=None, default_supplier_id="oa_supplier")
overrides("oa_contract oa_contract_template_term", template_id="oa_contract_template")
overrides("oa_project_template_task", template_id="oa_project_template")
overrides("oa_project_task oa_project_template_task", task_type_id="sys_dict_data")
overrides("oa_asset_maintenance_task", plan_id="oa_asset_maintenance_plan")
overrides("oa_consumable_request_item", request_id="oa_consumable_request")
overrides("biz_purchase_receipt", item_id="biz_purchase_item")
overrides("oa_contract_payment_schedule", milestone_id="oa_contract_milestone")
overrides("oa_knowledge_read oa_knowledge_doc_version", document_id="oa_knowledge_document")
overrides("oa_seal_handover_log", application_id="oa_seal_application")
overrides("oa_meeting_minutes oa_meeting_attendance", meeting_id="oa_schedule_event")
overrides("oa_meeting_reminder", event_id="oa_schedule_event")
overrides("crm_sla_priority crm_sla_status_rule", policy_id="crm_sla_policy")
overrides("crm_target_list_member crm_campaign_target_list", list_id="crm_target_list")
overrides("crm_customer_pool_log", rule_id="crm_assignment_rule")
overrides("crm_email_tracking_link", recipient_id="crm_mass_email_recipient")
overrides("crm_deal_allocation", event_id="crm_deal_event")
overrides("oa_purchase_rfq", purchase_request_id="biz_purchase_request")
overrides("sys_message_record", receiver_id="sys_user", outbox_event_id="outbox_event")
overrides("sys_message_delivery", outbox_event_id="outbox_event")
overrides("hr_work_injury_rehabilitation", new_position_id="hr_position")
overrides("hr_performance_interview", hr_observer_id="sys_user")
overrides("hr_shift_request", from_shift_id="hr_shift", to_shift_id="hr_shift", from_rule_id="hr_attendance_rule", to_rule_id="hr_attendance_rule")
overrides("hr_employee_referral", target_position_id="hr_position")
overrides("oa_purchase_rfq_supplier", invite_message_record_id="sys_message_record")
overrides("oa_schedule_event", parent_event_id="oa_schedule_event")
overrides("oa_asset_log", target_id="sys_user")
overrides("oa_contract", our_signee_id="sys_user")
overrides("oa_contract_payment_schedule", payee_id="oa_supplier")
overrides("oa_meeting_minutes", organizer_id="sys_user")
overrides("crm_lead", converted_customer_id="crm_customer")
overrides("crm_service_ticket", portal_contact_id="crm_contact")
overrides("hr_contract_signature", contract_id="hr_employee_contract")
overrides("oa_timesheet_detail", task_id="oa_project_task")
overrides("wf_reconcile_alert", biz_id=None)  # Resolved with its module AND workflow instance.
# The form's stable public key differs from its numeric revision row ID.
overrides("wf_form_definition", form_id=None)
overrides("wf_task_history", task_id=None)
NATURAL_KEYS = {("sys_dict_version", "published_by"): "user_name",
                ("sys_message_record", "outbox_event_id"): "event_id",
                ("sys_message_delivery", "outbox_event_id"): "event_id"}
TARGET_KEYS = {"wf_form_definition": "form_id"}

# A discriminator determines the referenced table. Values not listed here are
# reported by the validator; none are silently treated as a database reference.
BUSINESS = {name.upper(): name for name in schema()}
BUSINESS.update({
    "CUSTOMER": "crm_customer", "CONTACT": "crm_contact", "LEAD": "crm_lead",
    "OPPORTUNITY": "crm_opportunity", "QUOTE": "crm_quote", "RECEIVABLE": "crm_receivable",
    "TICKET": "crm_service_ticket", "CONTRACT": "oa_contract", "SALES_CONTRACT": "oa_contract",
    "CRM_SALES_CONTRACT": "oa_contract", "BUDGET": "oa_budget_plan", "PROJECT": "oa_project",
    "EXPENSE_CLAIM": "biz_expense_claim", "PAYMENT_REQUEST": "biz_payment_request",
    "TRAVEL_APPLY": "biz_business_trip", "PURCHASE_REQUEST": "biz_purchase_request",
    "HR_RESIGNATION": "hr_lifecycle_application", "HR_CONTRACT_RENEW": "hr_employee_contract",
    "HR_OVERTIME": "hr_overtime_request", "HR_SETTLEMENT": "hr_final_settlement",
    "HR_ADVANCE": "hr_employee_advance", "HR_REFERRAL": "hr_employee_referral",
    "SEAL_APPLY": "oa_seal_application", "SEAL_RENEWAL": "oa_seal_renewal",
    "SEAL": "oa_seal", "LICENSE": "oa_license", "APPROVAL": "wf_process_instance",
    "RISK": "oa_risk_alert", "PAYMENT": "biz_payment_request", "USER": "sys_user",
    "DEPT": "sys_dept", "POST": "hr_position", "POLICY": "hr_leave_policy",
    "EMPLOYEE": "hr_employee", "TASK": "wf_task", "PROCESS": "wf_process_instance",
    "INSTANCE": "wf_process_instance", "PROCESS_INSTANCE": "wf_process_instance", "DEFINITION": "wf_process_definition",
    "FORM": "wf_form_definition", "TEMPLATE": "wf_template", "BENEFIT": "hr_benefit_request",
    "MALL_ORDER": "hr_mall_order", "ADJUST": "oa_budget_adjustment", "SEED_OPENING": "hr_leave_quota",
    "PURCHASE_RECEIPT": "biz_purchase_receipt", "CONSUMABLE_REQUEST": "oa_consumable_request",
    "TRAINING": "hr_training_enrollment", "EXAM": "hr_exam_attempt", "CERTIFICATE": "hr_training_certificate",
    "ASSET_LABEL": "oa_asset", "HR_TRAINING_RECOVERY": "hr_training_recovery",
    "DEMO_INITIAL_ALLOCATION": "hr_leave_policy_assignment",
})
POLYMORPHIC = {}


def polymorphic(tables, column, discriminator, targets=None):
    for table in tables.split():
        POLYMORPHIC[(table, column)] = (discriminator, targets or BUSINESS)


polymorphic("sys_file sys_message_record sys_print_record crm_activity crm_deal_team crm_deal_event crm_email_record", "biz_id", "biz_type")
polymorphic("sys_business_rule_hit_record wf_transaction_message wf_callback_dead_letter wf_callback_side_effect oa_budget_ledger oa_invoice_writeoff oa_trace_event oa_risk_alert crm_handover_task", "business_id", "business_type")
polymorphic("wf_timeout_alert", "target_id", "alert_type")
polymorphic("wf_audit_log", "target_id", "target_type")
polymorphic("hr_headcount hr_schedule_assignment oa_budget_plan oa_budget_ledger", "target_id", "target_type")
polymorphic("hr_comp_change hr_leave_ledger hr_final_settlement_item biz_payment_request oa_consumable_ledger", "source_biz_id", "source_biz_type")
polymorphic("hr_audit_log", "business_id", "business_domain", {
    "EMPLOYEE": "hr_employee", "CONTRACT": "hr_employee_contract", "SALARY": "hr_employee_comp",
    "SALARY_SLIP": "hr_salary_slip", "BANK_CARD": "hr_bank_card", "BENEFIT": "hr_benefit_request",
    "POINT": "hr_point_account", "POSITION": "hr_position", "PERFORMANCE": "hr_performance_result",
    "TALENT": "hr_talent_review", "TRAINING": "hr_training_enrollment", "WORK_INJURY": "hr_work_injury",
    "LABOR_DISPUTE": "hr_labor_dispute", "CERTIFICATE_REQ": "hr_certificate_request", "MALL_ORDER": "hr_mall_order",
    "AUDIT": "hr_audit_log"})
polymorphic("hr_point_transaction", "source_id", "source_type")
polymorphic("hr_grievance", "against_id", "against_type")
polymorphic("hr_grievance", "related_biz_id", "related_biz_type")
polymorphic("hr_employee_skill", "evidence_biz_id", "evidence_type")
polymorphic("oa_consumable_ledger", "source_item_id", "source_biz_type", {"PURCHASE_RECEIPT": "biz_purchase_item", "CONSUMABLE_REQUEST": "oa_consumable_request_item"})
polymorphic("oa_asset_log", "ref_id", "ref_type", {"1": "oa_asset", "2": "oa_consumable"})
polymorphic("oa_contract oa_project", "source_id", "source_type")
polymorphic("oa_trace_event", "related_id", "related_type")
polymorphic("oa_borrow_reminder_log", "business_id", "business_type", {"SEAL": "oa_seal_application", "LICENSE": "oa_license_borrow"})
polymorphic("oa_borrow_reminder_log", "resource_id", "business_type", {"SEAL": "oa_seal", "LICENSE": "oa_license"})
polymorphic("crm_approval", "business_ref_id", "business_ref_type")
polymorphic("crm_activity_participant", "participant_ref_id", "participant_type")
polymorphic("crm_target_list_member", "member_ref_id", "member_type")
polymorphic("crm_sla_policy", "entity_id", "entity_type", {"CUSTOMER": "crm_customer"})
polymorphic("crm_campaign_log crm_mass_email_recipient", "target_id", "target_type")
polymorphic("hr_contract_signature", "signer_id", "signer_type", {"EMPLOYEE": "hr_employee", "COMPANY": "oa_seal"})
polymorphic("hr_performance_assignment", "assignee_id", "assignee_type", {"EMPLOYEE": "hr_employee", "DEPT": "sys_dept"})

# Non-table identifiers are deliberately listed, so a new ID column cannot silently
# disappear from the relationship audit.
OPAQUE = set("trace_id service_id aggregate_id provider_message_id corp_id agent_id im_user_id im_open_id im_union_id im_dept_id im_parent_dept_id im_todo_id refresh_family_id gateway_id node_id field_id device_id timezone_id esign_transaction_id trigger_event_id disabled_release_event_id".split())
OPAQUE_BY_TABLE = {
    "wf_gateway_activation": {"gateway_id"}, "wf_parallel_join": {"gateway_id"},
    "hr_employee_skill": {"current_skill_id"}, "hr_final_settlement": {"active_lifecycle_id"},
    "crm_deal_team": {"current_member_id"},
    "sys_oauth2_refresh_token": {"family_id"},
    "outbox_event": {"event_id"},
}
USER_COLUMNS = set("published_by requested_by resolved_by trigger_by process_by deploy_by rollback_by executed_by created_by archived_by verify_by decided_by corrected_by reviewed_by priced_by assessed_by calibrated_by confirmed_by uploaded_by issue_by cancel_by entry_by award_by fulfilled_by calc_by report_by post_by blacklist_by bypass_by portal_published_by".split())
USER_ID = re.compile(r"(?:assignee|approver|reviewer|manager|interviewer|investigator|operator|driver|owner|applicant|handler|creator|recipient|sender|voter|evaluatee|evaluator|uploaded_by|executor|submitter|initiator|facilitator|mentor|mediator|responsible|custodian|keeper|host|beneficiary|signer|escalated_to|resolved_by)_id$")


def parent_match(model, table, column, target, key):
    source = f"s.`{column}`"
    if model[target]['columns'][key]['type'].startswith(('varchar', 'char', 'text')):
        source = f"CAST({source} AS CHAR)"
    match = f"p.`{key}`={source}"
    if target != 'sys_tenant' and 'tenant_id' in model[target]['columns'] and 'tenant_id' in model[table]['columns']:
        scope = 'p.tenant_id=s.tenant_id'
        if target in ('wf_process_category', 'wf_template_category'):
            scope = f'({scope} OR p.tenant_id IS NULL)'
        match += ' AND ' + scope
    return match


def reconcile_match(model):
    """Use the same registered tables and instance columns as the server job."""
    path = ROOT / 'cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/config/WorkflowBusinessTypeContributor.java'
    clauses = []
    for block in path.read_text(encoding='utf-8').split('registry.register(')[1:]:
        block = block.split('.build());', 1)[0]
        fields = dict(re.findall(r'\.(module|businessTable|idField|processInstanceIdField)\("(\w+)"\)', block))
        table, key, instance = fields['businessTable'], fields.get('idField','id'), fields.get('processInstanceIdField','process_instance_id')
        if key not in model[table]['columns'] or instance not in model[table]['columns']:
            raise ValueError('Workflow registry changed: ' + table)
        clauses.append(f"(LOWER(s.biz_module)='{fields['module']}' AND EXISTS(SELECT 1 FROM `{table}` p WHERE p.`{key}`=s.biz_id AND p.tenant_id=s.tenant_id AND p.`{instance}`=s.wf_instance_id))")
    if not clauses:
        raise ValueError('No registered workflow business types')
    return '(' + ' OR '.join(clauses) + ')'


def relationships(model):
    result, unknown = [], []
    for table, definition in model.items():
        for column, meta in definition["columns"].items():
            if (len(definition["primary"]) == 1 and column in definition["primary"] and column != "tenant_id") or meta["generated"]:
                continue
            if (table, column) in POLYMORPHIC:
                continue
            target = OVERRIDES.get(table, {}).get(column, "UNSET")
            if target == "UNSET":
                if column in OPAQUE_BY_TABLE.get(table, set()) or column in OPAQUE:
                    continue
                if column == "parent_id":
                    target = table
                elif column in COMMON:
                    target = COMMON[column]
                elif column.endswith("_employee_id"):
                    target = "hr_employee"
                elif column.endswith("_dept_id"):
                    target = "sys_dept"
                elif column.endswith("_file_id"):
                    target = "sys_file"
                elif column.endswith("_user_id") or column in USER_COLUMNS or USER_ID.search(column):
                    target = "sys_user"
                elif column.endswith("_id"):
                    unknown.append((table, column, meta["comment"]))
                    continue
                else:
                    continue
            if target is None:
                continue
            if target == "SELF":
                target = table
            if target not in model:
                unknown.append((table, column, "Unknown target " + target))
                continue
            item = dict(table=table, column=column, target=target,
                key=NATURAL_KEYS.get((table, column), TARGET_KEYS.get(target, model[target]["primary"][0])),
                zero=column in {"parent_id", "job_level_id", "tenant_id"})
            if (table,column) == ('wf_template','created_by'):
                item['where'] = "NOT (s.tenant_id IS NULL AND s.created_by='system')"
            result.append(item)
    return result, unknown


if __name__ == "__main__":
    model = schema()
    refs, unknown = relationships(model)
    if "--json" in sys.argv:
        print(json.dumps(dict(refs=refs, polymorphic=[dict(table=t, column=c, discriminator=d, targets=v) for (t,c),(d,v) in POLYMORPHIC.items()]), ensure_ascii=True))
    else:
        print("tables", len(model), "relationships", len(refs), "unclassified", len(unknown))
        for item in unknown:
            print(*item, sep=" | ")
