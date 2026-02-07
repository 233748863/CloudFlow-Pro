package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
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

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private String formId;

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
}
