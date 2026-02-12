package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
import java.util.Date;

/**
 * 任务实体类
 */
@TableName("wf_task")
public class WfTask implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 任务ID (UUID) */
    @TableId
    private String taskId;

    /** 租户ID */
    private Long tenantId;

    /** 流程实例ID */
    private String instanceId;

    /** 任务节点Key (如 dept_audit) */
    private String nodeKey;

    /** 任务名称 (如 部门经理审批) */
    private String nodeName;

    /** 分派给谁 (用户ID) */
    private Long assignee;

    /** 候选角色ID (逗号分隔) */
    private String candidateRoles;

    /** 状态 (TODO, DONE) */
    private String status;

    /** 创建时间 */
    private Date createTime;

    /** 截止时间 */
    private Date dueTime;

    /** 4.1/P4.11: 任务优先级 (URGENT/HIGH/NORMAL/LOW) */
    private String priority;

    /** P4.1: 处理人姓名 */
    private String assigneeName;

    /** P4.5: 代理人用户ID */
    private Long proxyUserId;

    /** P4.13: 是否超时 (0-否, 1-是) */
    private Integer isTimeout;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String processDefKey;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String processName;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String startUserId;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String startUserName;
    
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String instanceTitle;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String formId;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private java.util.Map<String, Object> variables;

    /** 8.C: 是否已读 (不存储在数据库，由getTodoTasks填充) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private Boolean isRead;

    /** 8.C: 已读时间 (不存储在数据库，由getTodoTasks填充) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private Date readTime;

    /** 当前步骤序号 (从1开始，非持久化) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private Integer currentStepIndex;

    /** 总步骤数 (非持久化) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private Integer totalSteps;

    /** 上一步节点名称 (非持久化) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String previousNodeName;

    /** 上一步处理人姓名 (非持久化) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String previousOperatorName;

    /** 下一步节点名称 (非持久化) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String nextNodeName;

    /** 下一步处理人描述 (非持久化，如角色名或具体用户名) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String nextAssigneeName;

    /** 流程步骤详情列表 (非持久化，JSON序列化后传给前端) */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private java.util.List<java.util.Map<String, Object>> stepsDetail;

    public Boolean getIsRead() { return isRead; }
    public void setIsRead(Boolean isRead) { this.isRead = isRead; }

    public Date getReadTime() { return readTime; }
    public void setReadTime(Date readTime) { this.readTime = readTime; }

    public Integer getCurrentStepIndex() { return currentStepIndex; }
    public void setCurrentStepIndex(Integer currentStepIndex) { this.currentStepIndex = currentStepIndex; }

    public Integer getTotalSteps() { return totalSteps; }
    public void setTotalSteps(Integer totalSteps) { this.totalSteps = totalSteps; }

    public String getPreviousNodeName() { return previousNodeName; }
    public void setPreviousNodeName(String previousNodeName) { this.previousNodeName = previousNodeName; }

    public String getPreviousOperatorName() { return previousOperatorName; }
    public void setPreviousOperatorName(String previousOperatorName) { this.previousOperatorName = previousOperatorName; }

    public String getNextNodeName() { return nextNodeName; }
    public void setNextNodeName(String nextNodeName) { this.nextNodeName = nextNodeName; }

    public String getNextAssigneeName() { return nextAssigneeName; }
    public void setNextAssigneeName(String nextAssigneeName) { this.nextAssigneeName = nextAssigneeName; }

    public java.util.List<java.util.Map<String, Object>> getStepsDetail() { return stepsDetail; }
    public void setStepsDetail(java.util.List<java.util.Map<String, Object>> stepsDetail) { this.stepsDetail = stepsDetail; }

    public String getProcessDefKey() { return processDefKey; }
    public void setProcessDefKey(String processDefKey) { this.processDefKey = processDefKey; }

    public String getProcessName() { return processName; }
    public void setProcessName(String processName) { this.processName = processName; }

    public String getStartUserId() { return startUserId; }
    public void setStartUserId(String startUserId) { this.startUserId = startUserId; }

    public String getStartUserName() { return startUserName; }
    public void setStartUserName(String startUserName) { this.startUserName = startUserName; }

    public String getInstanceTitle() { return instanceTitle; }
    public void setInstanceTitle(String instanceTitle) { this.instanceTitle = instanceTitle; }

    public String getFormId() { return formId; }
    public void setFormId(String formId) { this.formId = formId; }

    public java.util.Map<String, Object> getVariables() { return variables; }
    public void setVariables(java.util.Map<String, Object> variables) { this.variables = variables; }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public String getInstanceId() {
        return instanceId;
    }

    public void setInstanceId(String instanceId) {
        this.instanceId = instanceId;
    }

    public String getNodeKey() {
        return nodeKey;
    }

    public void setNodeKey(String nodeKey) {
        this.nodeKey = nodeKey;
    }

    public String getNodeName() {
        return nodeName;
    }

    public void setNodeName(String nodeName) {
        this.nodeName = nodeName;
    }

    public Long getAssignee() {
        return assignee;
    }

    public void setAssignee(Long assignee) {
        this.assignee = assignee;
    }

    public String getCandidateRoles() {
        return candidateRoles;
    }

    public void setCandidateRoles(String candidateRoles) {
        this.candidateRoles = candidateRoles;
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

    public Date getDueTime() {
        return dueTime;
    }

    public void setDueTime(Date dueTime) {
        this.dueTime = dueTime;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getAssigneeName() {
        return assigneeName;
    }

    public void setAssigneeName(String assigneeName) {
        this.assigneeName = assigneeName;
    }

    public Long getProxyUserId() {
        return proxyUserId;
    }

    public void setProxyUserId(Long proxyUserId) {
        this.proxyUserId = proxyUserId;
    }

    public Integer getIsTimeout() {
        return isTimeout;
    }

    public void setIsTimeout(Integer isTimeout) {
        this.isTimeout = isTimeout;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }
}
