package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.annotation.Version;
import java.io.Serializable;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 流程定义实体类
 */
@TableName("wf_process_definition")
public class WfProcessDefinition implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 定义ID */
    @TableId
    private String definitionId;

    /** 租户ID */
    private Long tenantId;

    /** 流程名称 */
    private String processName;

    /** 流程Key */
    private String processKey;

    /** 版本 */
    private Integer version;

    /** 关联表单ID */
    private String formId;

    /** 流程模型JSON */
    private String modelJson;

    /** 状态 (DRAFT/PUBLISHED) */
    private String status;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;

    /** 启动权限类型 (ALL/ROLE/DEPT/USER) */
    private String startPermissionType;

    /** 启动权限值 (JSON格式) */
    private String startPermissionValue;

    /** 1.4: 流程分类 */
    private String category;

    /** 1.4: 流程标签 (JSON数组) */
    private String tags;

    /** 1.B: 乐观锁版本号 */
    @TableField("lock_version")
    @Version
    private Integer versionLock;

    /** 12.A: 是否最新版本 (0-否, 1-是) */
    private Integer isLatest;

    /** 来源模板ID */
    private String templateId;

    /** 当前版本号（语义化版本） */
    private String currentVersion;

    /** C6: 版本变更说明（版本体系统一后由 definition 行自身承载版本元数据） */
    private String changeLog;

    /** C6: 版本变更类型 (major/minor/patch) */
    private String changeType;

    /** C6: 模型内容 SHA-256 校验和 */
    private String checksum;

    /** C6: 是否回滚产生的版本 (0-否, 1-是) */
    private Integer isRollback;

    /** C6: 回滚源版本号（语义化版本） */
    private String rollbackFromVersion;

    /** 是否已归档 (0-否, 1-是) */
    private Integer isArchived;

    /** 流程描述 */
    private String description;

    /** 部门ID - 数据权限 */
    private Long deptId;

    /** 创建人 */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /** 更新人 */
    @TableField(fill = FieldFill.UPDATE)
    private String updateBy;

    /** 更新时间 */
    @TableField(fill = FieldFill.UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    /** 删除标记 */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    public String getDefinitionId() {
        return definitionId;
    }

    public void setDefinitionId(String definitionId) {
        this.definitionId = definitionId;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public String getProcessName() {
        return processName;
    }

    public void setProcessName(String processName) {
        this.processName = processName;
    }

    public String getProcessKey() {
        return processKey;
    }

    public void setProcessKey(String processKey) {
        this.processKey = processKey;
    }

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    public String getFormId() {
        return formId;
    }

    public void setFormId(String formId) {
        this.formId = formId;
    }

    public String getModelJson() {
        return modelJson;
    }

    public void setModelJson(String modelJson) {
        this.modelJson = modelJson;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }

    public String getStartPermissionType() {
        return startPermissionType;
    }

    public void setStartPermissionType(String startPermissionType) {
        this.startPermissionType = startPermissionType;
    }

    public String getStartPermissionValue() {
        return startPermissionValue;
    }

    public void setStartPermissionValue(String startPermissionValue) {
        this.startPermissionValue = startPermissionValue;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getTags() {
        return tags;
    }

    public void setTags(String tags) {
        this.tags = tags;
    }

    public Integer getVersionLock() {
        return versionLock;
    }

    public void setVersionLock(Integer versionLock) {
        this.versionLock = versionLock;
    }

    public Integer getIsLatest() {
        return isLatest;
    }

    public void setIsLatest(Integer isLatest) {
        this.isLatest = isLatest;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getCurrentVersion() {
        return currentVersion;
    }

    public void setCurrentVersion(String currentVersion) {
        this.currentVersion = currentVersion;
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

    public String getChecksum() {
        return checksum;
    }

    public void setChecksum(String checksum) {
        this.checksum = checksum;
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

    public Integer getIsArchived() {
        return isArchived;
    }

    public void setIsArchived(Integer isArchived) {
        this.isArchived = isArchived;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Long getDeptId() {
        return deptId;
    }

    public void setDeptId(Long deptId) {
        this.deptId = deptId;
    }

    public String getCreateBy() {
        return createBy;
    }

    public void setCreateBy(String createBy) {
        this.createBy = createBy;
    }

    public String getUpdateBy() {
        return updateBy;
    }

    public void setUpdateBy(String updateBy) {
        this.updateBy = updateBy;
    }

    public LocalDateTime getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(LocalDateTime updateTime) {
        this.updateTime = updateTime;
    }

    public Integer getDeleted() {
        return deleted;
    }

    public void setDeleted(Integer deleted) {
        this.deleted = deleted;
    }

}
