-- M0-4: 剩余业务状态实体补乐观锁版本列
-- 说明：本脚本承接 10.m0-core-version-columns.sql 之后的覆盖面补齐。

ALTER TABLE crm_approval
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_assignment_rule
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_contact
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_customer
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_handover_task
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_opportunity
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_price_book
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_product
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_sales_target
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE crm_service_ticket
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_attendance_appeal
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_attendance_monthly
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_attendance_record
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_attendance_rule
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_bank_card
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_benefit_payment
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_benefit_scheme
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_candidate
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_comp_change
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_comp_component
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_comp_grade
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_comp_structure
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_employee_benefit
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_employee_comp
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_employee_contract
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_exam_attempt
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_exam_paper
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_exam_question_bank
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_interview
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_job_level
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_leave_type
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_lifecycle_application
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_lifecycle_task
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_perf_distribution_rule
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_perf_evaluator
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_performance_assignment
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_performance_interview
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_performance_objective
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_performance_result
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_performance_salary_adjustment
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_position
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_position_family
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_recruitment_channel
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_recruitment_requisition
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_schedule_assignment
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_shift
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_talent_calibration_session
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_talent_development_action
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_talent_pool
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_talent_pool_member
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_talent_review
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_talent_succession_plan
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_talent_successor
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_tax_deduction
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_tax_profile
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE hr_training_category
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_certificate
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_certificate_template
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_course
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_enrollment
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_instructor
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_plan
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_training_session
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE hr_work_injury_rehabilitation
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_announcement
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_asset
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_budget_ledger
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE oa_contract_amount_threshold
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_contract_milestone
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_contract_payment_schedule
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_contract_template
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_duty_schedule
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_expense_standard
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_invoice
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_knowledge_document
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_knowledge_template
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_license
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_license_borrow
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_license_renewal
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_meeting_minutes
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_meeting_room
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_project
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_project_milestone
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_project_risk
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_seal
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_seal_application
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_seal_renewal
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_supplier
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_vehicle
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_vehicle_maintenance
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_vehicle_usage
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_vehicle_violation
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_visitor
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE oa_work_task
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE wf_notice
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_dept
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE sys_role
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE sys_user
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE wf_callback_dead_letter
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_countersign_task
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_node_monitor
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_node_record
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_notification_log
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_process_monitor
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_process_snapshot
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_task_add_sign
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_task_candidate
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_task_delegation
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_task_monitor
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_template
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_transaction_message
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_api_ratelimit_rule
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE sys_business_rule_version
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_dict_data
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_dict_type
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_ip_acl
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE sys_menu
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_post
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE sys_tenant
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE sys_user_blacklist
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;
