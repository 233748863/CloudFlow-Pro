package com.cloudflow.workflow.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 批量导出请求 DTO
 * 
 * @author CloudFlow
 */
@Data
public class BatchExportRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * 要导出的流程 ID 列表
     */
    private List<String> workflowIds;

    /**
     * 是否包含敏感配置
     * 默认为 false
     */
    private Boolean includeSensitive = false;
}
