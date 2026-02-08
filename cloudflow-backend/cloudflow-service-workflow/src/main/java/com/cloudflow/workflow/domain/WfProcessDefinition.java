package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
import java.util.Date;

/**
 * 流程定义实体类
 */
@TableName("wf_process_definition")
public class WfProcessDefinition implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 定义ID */
    @TableId
    private String definitionId;

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
    private Date createTime;
    
    /** 启动权限类型 (ALL/ROLE/DEPT/USER) */
    private String startPermissionType;
    
    /** 启动权限值 (JSON格式) */
    private String startPermissionValue;

    public String getDefinitionId() {
        return definitionId;
    }

    public void setDefinitionId(String definitionId) {
        this.definitionId = definitionId;
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

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
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
}
