package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 操作详情 DTO
 * 用于批量操作时记录每个流程的操作结果
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OperationDetailDTO {

    /**
     * 流程 ID
     */
    private String workflowId;

    /**
     * 流程名称
     */
    private String workflowName;

    /**
     * 操作状态：success-成功，failed-失败，skipped-跳过
     */
    private String status;

    /**
     * 操作消息（成功或失败的详细信息）
     */
    private String message;
}
