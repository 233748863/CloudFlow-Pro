package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 流程版本实体类
 * 用于记录流程的历史版本信息
 */
@TableName("workflow_version")
public class WorkflowVersion implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 版本ID */
    @TableId
    private String id;

    /** 流程ID */
    private String workflowId;

    /** 版本号（语义化版本格式：X.Y.Z） */
    private String versionNumber;

    /** 流程定义快照（JSON格式） */
    private String definition;

    /** 变更说明 */
    private String changeLog;

    /** 变更类型 (major/minor/patch) */
    private String changeType;

    /** 创建者ID */
    private String createdBy;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdAt;

    /** 是否回滚版本 */
    private Integer isRollback;

    /** 回滚源版本号 */
    private String rollbackFromVersion;

    /** 校验和（用于验证数据完整性） */
    private String checksum;

    /** 租户ID */
    private Long tenantId;

    // Getters and Setters

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getWorkflowId() {
        return workflowId;
    }

    public void setWorkflowId(String workflowId) {
        this.workflowId = workflowId;
    }

    public String getVersionNumber() {
        return versionNumber;
    }

    public void setVersionNumber(String versionNumber) {
        this.versionNumber = versionNumber;
    }

    public String getDefinition() {
        return definition;
    }

    public void setDefinition(String definition) {
        this.definition = definition;
    }

    public String getChangeLog() {
        return changeLog;
    }

    public void setChangeLog(String changeLog) {
        this.changeLog = changeLog;
    }

    public String getChangeType() {
        return changeType;
    }

    public void setChangeType(String changeType) {
        this.changeType = changeType;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public Integer getIsRollback() {
        return isRollback;
    }

    public void setIsRollback(Integer isRollback) {
        this.isRollback = isRollback;
    }

    public String getRollbackFromVersion() {
        return rollbackFromVersion;
    }

    public void setRollbackFromVersion(String rollbackFromVersion) {
        this.rollbackFromVersion = rollbackFromVersion;
    }

    public String getChecksum() {
        return checksum;
    }

    public void setChecksum(String checksum) {
        this.checksum = checksum;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }
}
