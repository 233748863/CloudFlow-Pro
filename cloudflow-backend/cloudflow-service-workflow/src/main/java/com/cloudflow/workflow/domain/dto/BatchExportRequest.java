package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 批量导出请求 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchExportRequest {

    /**
     * 流程 ID 列表
     */
    private List<String> workflowIds;

    /**
     * 是否包含敏感信息
     */
    @Builder.Default
    private Boolean includeSensitive = false;
}
