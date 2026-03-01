package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 版本回滚请求 DTO
 */
@Data
public class RollbackVersionRequest {
    /** 流程ID */
    private String workflowId;

    /** 目标版本ID */
    private String targetVersionId;

    /** 回滚原因 */
    private String reason;

    /** 是否强制回滚（即使有运行中的实例） */
    private Boolean forceRollback;
}
