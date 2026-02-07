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
}
