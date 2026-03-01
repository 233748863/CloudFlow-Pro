package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 流程版本 DTO
 */
@Data
public class VersionDTO {
    /** 版本ID */
    private String id;

    /** 流程ID */
    private String workflowId;

    /** 版本号 */
    private String versionNumber;

    /** 变更说明 */
    private String changeLog;

    /** 变更类型 */
    private String changeType;

    /** 创建者ID */
    private String createdBy;

    /** 创建者名称 */
    private String createdByName;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 是否回滚版本 */
    private Boolean isRollback;

    /** 回滚源版本号 */
    private String rollbackFromVersion;
}
