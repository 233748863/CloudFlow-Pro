package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 批量操作结果 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchOperationResultDTO {

    /**
     * 总数
     */
    private Integer totalCount;

    /**
     * 成功数
     */
    private Integer successCount;

    /**
     * 失败数
     */
    private Integer failedCount;

    /**
     * 跳过数
     */
    private Integer skippedCount;

    /**
     * 操作消息
     */
    private String message;

    /**
     * 详细结果列表
     */
    private List<OperationDetailDTO> details;
}
