package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 批量删除请求 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchDeleteRequest {

    /**
     * 流程 ID 列表
     */
    private List<String> workflowIds;

    /**
     * 是否已确认（用于二次确认）
     */
    private Boolean confirmed;
}
