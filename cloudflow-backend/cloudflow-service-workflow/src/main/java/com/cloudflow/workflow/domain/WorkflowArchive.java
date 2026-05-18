package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 流程归档实体类
 * 用于记录已归档的流程信息
 */
@TableName("wf_template_archive")
public class WorkflowArchive implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 归档ID */
    @TableId
    private String id;

    /** 流程ID */
    private String workflowId;

    /** 流程名称（冗余存储） */
    private String workflowName;

    /** 归档人ID */
    private String archivedBy;

    /** 归档时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime archivedAt;

    /** 归档原因 */
    private String archiveReason;

    /** 是否可恢复 */
    private Integer canRestore;

    /** 原始数据（JSON格式） */
    private String originalData;

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

    public String getWorkflowName() {
        return workflowName;
    }

    public void setWorkflowName(String workflowName) {
        this.workflowName = workflowName;
    }

    public String getArchivedBy() {
        return archivedBy;
    }

    public void setArchivedBy(String archivedBy) {
        this.archivedBy = archivedBy;
    }

    public LocalDateTime getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(LocalDateTime archivedAt) {
        this.archivedAt = archivedAt;
    }

    public String getArchiveReason() {
        return archiveReason;
    }

    public void setArchiveReason(String archiveReason) {
        this.archiveReason = archiveReason;
    }

    public Integer getCanRestore() {
        return canRestore;
    }

    public void setCanRestore(Integer canRestore) {
        this.canRestore = canRestore;
    }

    public String getOriginalData() {
        return originalData;
    }

    public void setOriginalData(String originalData) {
        this.originalData = originalData;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }
}
