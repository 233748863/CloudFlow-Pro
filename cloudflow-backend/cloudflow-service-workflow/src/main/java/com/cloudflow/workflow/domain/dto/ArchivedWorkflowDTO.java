package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 归档流程 DTO
 */
@Data
public class ArchivedWorkflowDTO {
    /** 归档ID */
    private String id;

    /** 流程ID */
    private String workflowId;

    /** 流程名称 */
    private String workflowName;

    /** 归档人ID */
    private String archivedBy;

    /** 归档人名称 */
    private String archivedByName;

    /** 归档时间 */
    private LocalDateTime archivedAt;

    /** 归档原因 */
    private String archiveReason;

    /** 是否可恢复 */
    private Boolean canRestore;
}
