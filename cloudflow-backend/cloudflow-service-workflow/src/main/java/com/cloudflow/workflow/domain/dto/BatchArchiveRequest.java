package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 批量归档请求 DTO
 */
@Data
public class BatchArchiveRequest {
    /** 流程ID列表 */
    private List<String> workflowIds;

    /** 归档原因 */
    private String reason;

    /** 是否强制归档（即使有运行中的实例） */
    private Boolean forceArchive;
}
