package com.cloudflow.hr.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * HR 审批流程 key 配置。
 * 通过配置而不是硬编码绑定 workflow 定义，降低 HR 与 workflow 的耦合。
 */
@Data
@Component
@ConfigurationProperties(prefix = "cloudflow.hr.workflow.process-keys")
public class HrWorkflowProcessKeyProperties {

    private String leave = "leave_request";

    private String overtime = "overtime_request";

    private String attendanceSupplement = "attendance_appeal";

    private String offer = "offer_approval";

    private String onboarding = "onboarding_approval";

    private String probationConfirmation = "probation_confirmation_approval";

    private String recruitmentRequest = "biz_recruit";

    private String resignation = "resignation_approval";

    private String salaryAdjustment = "salary_adjustment_approval";

    private String transfer = "transfer_approval";

    private String performancePlan = "performance_plan_approval";

    private String performanceResult = "performance_result_approval";
}
