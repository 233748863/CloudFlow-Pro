package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Date;

/**
 * 工作流实例实体类
 */
@TableName("wf_process_instance")
public class WfProcessInstance implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 实例ID (UUID) */
    @TableId
    private String instanceId;

    /** 租户ID */
    private Long tenantId;

    /** 流程定义Key (如 purchase_request) */
    private String processDefKey;

    /** 业务主键ID */
    private String businessKey;

    /** 流程标题 */
    private String title;

    /** 发起人ID */
    private Long startUserId;

    /** 发起人姓名 */
    private String startUserName;

    /** 状态 (RUNNING, COMPLETED, CANCELLED) */
    private String status;

    /** 开始时间 */
    private Date startTime;

    /** 结束时间 */
    private Date endTime;

    /** 流程变量 (JSON) */
    private String variables;

    /** 4.1: 流程实例优先级 (URGENT/HIGH/NORMAL/LOW) */
    private String priority;

    /** 4.9: 流程编号 (自动生成的业务编号) */
    private String processNo;

    /** 流程定义ID (版本锁定) */
    private String definitionId;
    
    /** 部门ID - 数据权限 */
    private Long deptId;
    
    /** 创建人 */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /** 更新人 */
    @TableField(fill = FieldFill.UPDATE)
    private String updateBy;
    
    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /** 更新时间 */
    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime updateTime;
    
    /** 删除标记 */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private String delFlag;

    @TableField(exist = false)
    private String formId;

    /** 当前任务ID (非持久化，用于查询结果填充) */
    @TableField(exist = false)
    private String taskId;

    /** 当前处理人ID (非持久化，用于查询结果填充) */
    @TableField(exist = false)
    private Long assignee;

    /** 当前处理人姓名 (非持久化，用于查询结果填充) */
    @TableField(exist = false)
    private String assigneeName;

    public String getVariables() {
        return variables;
    }

    public void setVariables(String variables) {
        this.variables = variables;
    }

    public String getFormId() {
        return formId;
    }

    public void setFormId(String formId) {
        this.formId = formId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public Long getAssignee() {
        return assignee;
    }

    public void setAssignee(Long assignee) {
        this.assignee = assignee;
    }

    public String getAssigneeName() {
        return assigneeName;
    }

    public void setAssigneeName(String assigneeName) {
        this.assigneeName = assigneeName;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getProcessNo() {
        return processNo;
    }

    public void setProcessNo(String processNo) {
        this.processNo = processNo;
    }

    public String getDefinitionId() {
        return definitionId;
    }

    public void setDefinitionId(String definitionId) {
        this.definitionId = definitionId;
    }

    public String getInstanceId() {
        return instanceId;
    }

    public void setInstanceId(String instanceId) {
        this.instanceId = instanceId;
    }

    public String getProcessDefKey() {
        return processDefKey;
    }

    public void setProcessDefKey(String processDefKey) {
        this.processDefKey = processDefKey;
    }

    public String getBusinessKey() {
        return businessKey;
    }

    public void setBusinessKey(String businessKey) {
        this.businessKey = businessKey;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Long getStartUserId() {
        return startUserId;
    }

    public void setStartUserId(Long startUserId) {
        this.startUserId = startUserId;
    }

    public String getStartUserName() {
        return startUserName;
    }

    public void setStartUserName(String startUserName) {
        this.startUserName = startUserName;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Date getStartTime() {
        return startTime;
    }

    public void setStartTime(Date startTime) {
        this.startTime = startTime;
    }

    public Date getEndTime() {
        return endTime;
    }

    public void setEndTime(Date endTime) {
        this.endTime = endTime;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
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
    
    public LocalDateTime getCreateTime() {
        return createTime;
    }
    
    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }
    
    public LocalDateTime getUpdateTime() {
        return updateTime;
    }
    
    public void setUpdateTime(LocalDateTime updateTime) {
        this.updateTime = updateTime;
    }
    
    public String getDelFlag() {
        return delFlag;
    }
    
    public void setDelFlag(String delFlag) {
        this.delFlag = delFlag;
    }

    /** Alias for definitionId - used by DeployEnhancementServiceImpl */
    public String getProcessDefId() {
        return definitionId;
    }

    public void setProcessDefId(String processDefId) {
        this.definitionId = processDefId;
    }
}
