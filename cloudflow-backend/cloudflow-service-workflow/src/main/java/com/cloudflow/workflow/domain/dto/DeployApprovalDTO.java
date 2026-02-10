package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 发布审批DTO
 */
@Data
public class DeployApprovalDTO {

    /** 流程定义ID */
    private String processDefId;

    /** 审批配置 */
    private List<ApprovalStepConfig> steps;

    @Data
    public static class ApprovalStepConfig {
        /** 步骤名称 */
        private String stepName;
        /** 审批人类型: USER/ROLE/DEPT */
        private String approverType;
        /** 审批人ID列表 */
        private List<Long> approverIds;
        /** 审批模式: ANY/ALL/SEQUENCE */
        private String approvalMode;
    }
}
