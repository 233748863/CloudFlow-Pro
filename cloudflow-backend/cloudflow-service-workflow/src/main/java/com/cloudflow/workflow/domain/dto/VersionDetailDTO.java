package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 流程版本详情 DTO
 * 包含完整的流程定义
 */
@Data
public class VersionDetailDTO {
    /** 版本ID */
    private String id;

    /** 流程ID */
    private String workflowId;

    /** 版本号 */
    private String versionNumber;

    /** 流程定义（JSON对象） */
    private Object definition;

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

    /** 校验和 */
    private String checksum;
}
