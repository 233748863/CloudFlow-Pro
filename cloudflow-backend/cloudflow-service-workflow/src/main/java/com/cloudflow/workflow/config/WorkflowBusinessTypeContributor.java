package com.cloudflow.workflow.config;

import com.cloudflow.common.workflow.callback.registry.BusinessTypeContributor;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import org.springframework.context.annotation.Configuration;
import java.util.List;

/**
 * 工作流服务侧业务类型注册。
 *
 * <p>本模块内的 {@link BusinessTypeRegistry} 消费端：
 * <ul>
 *   <li>{@code ProcessBusinessReconcileJob} 通过 registry 驱动 UNION ALL SQL。</li>
 *   <li>{@code WorkflowController.businessTypes()} 暴露 /wf/business-types 给前端选择器。</li>
 *   <li>{@code TimeoutDetectionServiceImpl} 根据业务类型解析所属模块。</li>
 * </ul>
 *
 * <p>注册项使用各业务实际表列及审批阶段状态；绩效计划和结果分别关联自己的流程。
 * 新增业务模块时需同时登记流程关联字段和该阶段的待审批、已结束状态。
 */
@Configuration
public class WorkflowBusinessTypeContributor implements BusinessTypeContributor {

    @Override
    public void contribute(BusinessTypeRegistry registry) {
        // ===== HR =====
        registry.register(BusinessTypeDef.builder()
                .code("HR_RECRUITMENT").module("hr").businessTable("hr_recruitment_requisition")
                .finishedStatuses(finished("RECRUITING"))
                .displayName("招聘需求审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_LIFECYCLE").module("hr").businessTable("hr_lifecycle_application")
                .displayName("员工生命周期申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TIME_REQUEST").module("hr").businessTable("hr_time_request")
                .displayName("考勤请假申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OFFER").module("hr").businessTable("hr_offer")
                .finishedStatuses(finished("SENT", "ACCEPTED", "EXPIRED"))
                .displayName("录用 Offer 审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_COMP_CHANGE").module("hr").businessTable("hr_comp_change")
                .displayName("薪酬调整审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_PERFORMANCE_PLAN").module("hr").businessTable("hr_performance_objective")
                .processInstanceIdField("plan_process_instance_id").pendingStatuses(List.of("PLAN_APPROVING"))
                .finishedStatuses(List.of("PLAN_APPROVED", "RESULT_APPROVING", "RESULT_APPROVED", "COMPLETED", "REJECTED", "CANCELLED"))
                .displayName("绩效计划审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_PERFORMANCE_RESULT").module("hr").businessTable("hr_performance_objective")
                .processInstanceIdField("result_process_instance_id").pendingStatuses(List.of("RESULT_APPROVING"))
                .finishedStatuses(List.of("RESULT_APPROVED", "COMPLETED", "REJECTED", "CANCELLED"))
                .displayName("绩效结果审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_CERTIFICATE_REQUEST").module("hr").businessTable("hr_certificate_request")
                .finishedStatuses(finished("ISSUED"))
                .displayName("证明开具审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_CONTRACT_SIGN").module("hr").businessTable("hr_contract_signature")
                .statusField("sign_status").pendingStatuses(List.of("PENDING", "SIGNING"))
                .finishedStatuses(List.of("SIGNED", "REJECTED", "EXPIRED", "CANCELLED"))
                .displayName("电子合同签署").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TRAINING_ENROLLMENT").module("hr").businessTable("hr_training_enrollment")
                .finishedStatuses(finished("ATTENDED", "PASSED", "WITHDRAWN"))
                .displayName("培训报名审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TALENT_REVIEW").module("hr").businessTable("hr_talent_review")
                .finishedStatuses(finished("PUBLISHED", "ARCHIVED"))
                .displayName("人才盘点发布审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TALENT_SUCCESSION").module("hr").businessTable("hr_talent_succession_plan")
                .finishedStatuses(finished("PUBLISHED", "ARCHIVED"))
                .displayName("继任计划发布审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_BENEFIT_REQUEST").module("hr").businessTable("hr_benefit_request")
                .finishedStatuses(finished("PAID"))
                .displayName("福利申领审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_MALL_ORDER").module("hr").businessTable("hr_mall_order")
                .finishedStatuses(finished("SHIPPED"))
                .displayName("积分商城订单审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_WORK_INJURY").module("hr").businessTable("hr_work_injury")
                .finishedStatuses(finished("DETERMINED", "COMPENSATING", "REHABILITATING", "CLOSED"))
                .displayName("工伤认定审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_LABOR_DISPUTE").module("hr").businessTable("hr_labor_dispute")
                .finishedStatuses(finished("AWARDED", "EXECUTED", "CLOSED"))
                .displayName("劳动争议处理审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_ATTENDANCE_APPEAL").module("hr").businessTable("hr_attendance_appeal")
                .processInstanceIdField("instance_id")
                .displayName("考勤异常申诉审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_PAYROLL_CORRECTION").module("hr").businessTable("hr_payroll_correction")
                .idField("correction_id").processInstanceIdField("instance_id")
                .finishedStatuses(finished("APPLIED"))
                .displayName("工资补正审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_OVERTIME").module("hr").businessTable("hr_overtime_request")
                .idField("request_id").processInstanceIdField("instance_id")
                .displayName("加班申请审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_SHIFT_REQUEST").module("hr").businessTable("hr_shift_request")
                .idField("request_id").processInstanceIdField("instance_id")
                .displayName("调班申请审批").build());

        registry.register(BusinessTypeDef.builder()
                .code("HR_REFERRAL").module("hr").businessTable("hr_employee_referral")
                .idField("referral_id").statusField("bonus_status").processInstanceIdField("instance_id")
                .finishedStatuses(finished("PAID"))
                .displayName("内推奖金审批").build());

        registry.register(BusinessTypeDef.builder()
                .code("HR_ADVANCE").module("hr").businessTable("hr_employee_advance")
                .idField("advance_id").statusField("approval_status").processInstanceIdField("instance_id")
                .displayName("员工借款审批").build());

        registry.register(BusinessTypeDef.builder()
                .code("HR_SETTLEMENT").module("hr").businessTable("hr_final_settlement")
                .idField("settlement_id").statusField("approval_status").processInstanceIdField("instance_id")
                .displayName("离职结算财务复核").build());

        // ===== OA =====
        registry.register(BusinessTypeDef.builder()
                .code("OA_EXPENSE_CLAIM").module("oa").businessTable("biz_expense_claim")
                .processInstanceIdField("instance_id").finishedStatuses(finished("PAID"))
                .displayName("费用报销").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_PURCHASE_REQUEST").module("oa").businessTable("biz_purchase_request")
                .processInstanceIdField("instance_id").finishedStatuses(finished("PARTIAL_RECEIVED", "RECEIVED"))
                .displayName("采购申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_CONSUMABLE_REQUEST").module("oa").businessTable("oa_consumable_request")
                .idField("request_id").processInstanceIdField("instance_id")
                .finishedStatuses(finished("ISSUED"))
                .displayName("耗材领用审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_MEETING_BOOKING").module("oa").businessTable("oa_schedule_event")
                .idField("event_id").statusField("approval_status").processInstanceIdField("instance_id")
                .displayName("会议室预约审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_PAYMENT_REQUEST").module("oa").businessTable("biz_payment_request")
                .processInstanceIdField("instance_id").finishedStatuses(finished("PAID"))
                .displayName("付款申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_CONTRACT").module("oa").businessTable("oa_contract")
                .idField("contract_id").processInstanceIdField("instance_id")
                .finishedStatuses(finished("SEALING", "SEALED", "ACTIVE", "EXPIRED", "TERMINATED"))
                .displayName("合同审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_BUSINESS_TRIP").module("oa").businessTable("biz_business_trip")
                .processInstanceIdField("instance_id")
                .displayName("出差申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_BUDGET_PLAN").module("oa").businessTable("oa_budget_plan")
                .idField("budget_id").processInstanceIdField("instance_id")
                .displayName("预算计划").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_BUDGET_ADJUSTMENT").module("oa").businessTable("oa_budget_adjustment")
                .idField("adjustment_id").processInstanceIdField("instance_id")
                .displayName("预算调整").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_PROJECT").module("oa").businessTable("oa_project")
                .idField("project_id").processInstanceIdField("instance_id")
                .finishedStatuses(finished("IN_PROGRESS", "ARCHIVED"))
                .displayName("项目立项").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_KNOWLEDGE").module("oa").businessTable("oa_knowledge_document")
                .idField("document_id").processInstanceIdField("instance_id").finishedStatuses(finished("PUBLISHED"))
                .displayName("知识发布").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_SEAL_APPLICATION").module("oa").businessTable("oa_seal_application")
                .processInstanceIdField("instance_id").finishedStatuses(finished("BORROWED", "RETURNED", "OVERDUE"))
                .displayName("用印申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_LICENSE_BORROW").module("oa").businessTable("oa_license_borrow")
                .processInstanceIdField("instance_id").finishedStatuses(finished("BORROWED", "RETURNED", "OVERDUE"))
                .displayName("证照借用").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_VEHICLE_USAGE").module("oa").businessTable("oa_vehicle_usage")
                .idField("usage_id").pendingStatuses(List.of("0")).finishedStatuses(List.of("1", "2", "3", "4", "5"))
                .displayName("用车申请").build());

        // ===== CRM =====
        registry.register(BusinessTypeDef.builder()
                .code("CRM_APPROVAL").module("crm").businessTable("crm_approval")
                .idField("approval_id").processInstanceIdField("instance_id")
                .displayName("CRM 通用审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("CRM_QUOTE").module("crm").businessTable("crm_quote")
                .idField("quote_id").processInstanceIdField("instance_id").finishedStatuses(finished("SENT", "ACCEPTED", "EXPIRED"))
                .displayName("报价审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("CRM_RENEWAL").module("crm").businessTable("crm_renewal")
                .idField("renewal_id").processInstanceIdField("instance_id").finishedStatuses(finished("WON", "LOST", "CLOSED"))
                .displayName("续约审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("CRM_CUSTOMER_CREDIT").module("crm").businessTable("crm_approval")
                .idField("approval_id").processInstanceIdField("instance_id")
                .displayName("客户信用额度调整").build());
        registry.register(BusinessTypeDef.builder()
                .code("CRM_OPPORTUNITY_DOWNGRADE").module("crm").businessTable("crm_approval")
                .idField("approval_id").processInstanceIdField("instance_id")
                .displayName("商机降级与输单审批").build());

        // ===== AUTH =====
        registry.register(BusinessTypeDef.builder()
                .code("AUTH_DICT_CHANGE").module("auth").businessTable("sys_dict_change_approval")
                .idField("approval_id").processInstanceIdField("instance_id")
                .displayName("高风险字典变更审批").build());
    }

    private static List<String> finished(String... subsequentStatuses) {
        return java.util.stream.Stream.concat(
                java.util.stream.Stream.of("APPROVED", "REJECTED", "COMPLETED", "CANCELLED"),
                java.util.Arrays.stream(subsequentStatuses)).distinct().toList();
    }
}
