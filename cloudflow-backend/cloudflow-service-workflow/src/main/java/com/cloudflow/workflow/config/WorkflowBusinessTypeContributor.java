package com.cloudflow.workflow.config;

import com.cloudflow.common.workflow.callback.registry.BusinessTypeContributor;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import org.springframework.context.annotation.Configuration;

/**
 * 工作流服务侧业务类型注册。
 *
 * <p>本模块是 {@link BusinessTypeRegistry} 的唯一真实消费者：
 * <ul>
 *   <li>{@code ProcessBusinessReconcileJob} 通过 registry 驱动 UNION ALL SQL。</li>
 *   <li>{@code WorkflowController.businessTypes()} 暴露 /wf/business-types 给前端选择器。</li>
 * </ul>
 *
 * <p>这些 31 项代码与 {@code WfReconcileAlertMapper.xml} 历史 UNION ALL 中的 business_type 标签对齐，
 * 新增业务模块在本类追加 register 调用即可同步生效。
 */
@Configuration
public class WorkflowBusinessTypeContributor implements BusinessTypeContributor {

    @Override
    public void contribute(BusinessTypeRegistry registry) {
        // ===== HR =====
        registry.register(BusinessTypeDef.builder()
                .code("HR_RECRUITMENT").module("hr").businessTable("hr_recruitment_requisition")
                .displayName("招聘需求审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_LIFECYCLE").module("hr").businessTable("hr_lifecycle_application")
                .displayName("员工生命周期申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TIME_REQUEST").module("hr").businessTable("hr_time_request")
                .displayName("考勤请假申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_OFFER").module("hr").businessTable("hr_offer")
                .displayName("录用 Offer 审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_COMP_CHANGE").module("hr").businessTable("hr_comp_change")
                .displayName("薪酬调整审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_PERFORMANCE_OBJECTIVE").module("hr").businessTable("hr_performance_objective")
                .displayName("绩效目标审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_CERTIFICATE_REQUEST").module("hr").businessTable("hr_certificate_request")
                .displayName("证明开具审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_CONTRACT_SIGN").module("hr").businessTable("hr_contract_signature")
                .displayName("电子合同签署").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TRAINING_ENROLLMENT").module("hr").businessTable("hr_training_enrollment")
                .displayName("培训报名审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TALENT_REVIEW").module("hr").businessTable("hr_talent_review")
                .displayName("人才盘点发布审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_TALENT_SUCCESSION").module("hr").businessTable("hr_talent_succession_plan")
                .displayName("继任计划发布审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_BENEFIT_REQUEST").module("hr").businessTable("hr_benefit_request")
                .displayName("福利申领审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_MALL_ORDER").module("hr").businessTable("hr_mall_order")
                .displayName("积分商城订单审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_WORK_INJURY").module("hr").businessTable("hr_work_injury")
                .displayName("工伤认定审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_LABOR_DISPUTE").module("hr").businessTable("hr_labor_dispute")
                .displayName("劳动争议处理审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("HR_ATTENDANCE_APPEAL").module("hr").businessTable("hr_attendance_appeal")
                .displayName("考勤异常申诉审批").build());

        // ===== OA =====
        registry.register(BusinessTypeDef.builder()
                .code("OA_EXPENSE_CLAIM").module("oa").businessTable("biz_expense_claim")
                .displayName("费用报销").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_PURCHASE_REQUEST").module("oa").businessTable("biz_purchase_request")
                .displayName("采购申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_PAYMENT_REQUEST").module("oa").businessTable("biz_payment_request")
                .displayName("付款申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_CONTRACT").module("oa").businessTable("oa_contract")
                .displayName("合同审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_BUSINESS_TRIP").module("oa").businessTable("oa_business_trip")
                .displayName("出差申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_BUDGET_PLAN").module("oa").businessTable("oa_budget_plan")
                .displayName("预算计划").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_BUDGET_ADJUSTMENT").module("oa").businessTable("oa_budget_adjustment")
                .displayName("预算调整").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_PROJECT").module("oa").businessTable("oa_project")
                .displayName("项目立项").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_KNOWLEDGE").module("oa").businessTable("oa_knowledge_document")
                .displayName("知识发布").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_SEAL_APPLICATION").module("oa").businessTable("oa_seal_application")
                .displayName("用印申请").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_LICENSE_BORROW").module("oa").businessTable("oa_license_borrow")
                .displayName("证照借用").build());
        registry.register(BusinessTypeDef.builder()
                .code("OA_VEHICLE_USAGE").module("oa").businessTable("oa_vehicle_usage")
                .displayName("用车申请").build());

        // ===== CRM =====
        registry.register(BusinessTypeDef.builder()
                .code("CRM_APPROVAL").module("crm").businessTable("crm_approval")
                .displayName("CRM 通用审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("CRM_QUOTE").module("crm").businessTable("crm_quote")
                .displayName("报价审批").build());
        registry.register(BusinessTypeDef.builder()
                .code("CRM_RENEWAL").module("crm").businessTable("crm_renewal")
                .displayName("续约审批").build());
    }
}
