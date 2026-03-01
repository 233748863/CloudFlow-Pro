package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 批量操作结果 DTO
 */
@Data
public class BatchOperationResultDTO {
    /** 总数 */
    private Integer totalCount;

    /** 成功数 */
    private Integer successCount;

    /** 失败数 */
    private Integer failedCount;

    /** 跳过数 */
    private Integer skippedCount;

    /** 详细结果列表 */
    private List<OperationDetail> details;

    /**
     * 操作详情
     */
    @Data
    public static class OperationDetail {
        /** 流程ID */
        private String workflowId;

        /** 流程名称 */
        private String workflowName;

        /** 状态 (success/failed/skipped) */
        private String status;

        /** 消息 */
        private String message;
    }
}
