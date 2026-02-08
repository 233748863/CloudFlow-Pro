package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
import java.util.Date;

/**
 * 任务审批历史实体类
 */
@TableName("wf_task_history")
public class WfTaskHistory implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 历史记录ID (UUID) */
    @TableId
    private String historyId;

    /** 任务ID */
    private String taskId;

    /** 流程实例ID */
    private String instanceId;

    /** 节点名称 */
    private String nodeName;

    /** 节点Key */
    private String nodeKey;

    /** 操作人ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 审批意见 */
    private String comment;

    /** 审批结果 (APPROVE, REJECT) */
    private String action;

    /** 操作时间 */
    private Date createTime;
    
    /** 本次修改的变量 (JSON格式) */
    private String variablesChanged;

    public String getHistoryId() {
        return historyId;
    }

    public void setHistoryId(String historyId) {
        this.historyId = historyId;
    }

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

    public String getNodeName() {
        return nodeName;
    }

    public void setNodeName(String nodeName) {
        this.nodeName = nodeName;
    }

    public String getNodeKey() {
        return nodeKey;
    }

    public void setNodeKey(String nodeKey) {
        this.nodeKey = nodeKey;
    }

    public Long getOperatorId() {
        return operatorId;
    }

    public void setOperatorId(Long operatorId) {
        this.operatorId = operatorId;
    }

    public String getOperatorName() {
        return operatorName;
    }

    public void setOperatorName(String operatorName) {
        this.operatorName = operatorName;
    }

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
        this.comment = comment;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
        this.createTime = createTime;
    }

    public String getVariablesChanged() {
        return variablesChanged;
    }

    public void setVariablesChanged(String variablesChanged) {
        this.variablesChanged = variablesChanged;
    }
}
