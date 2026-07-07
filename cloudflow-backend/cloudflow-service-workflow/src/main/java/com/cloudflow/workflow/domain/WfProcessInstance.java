package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.annotation.Version;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

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

    private Integer starterLeft;

    /** 开始时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime startTime;

    /** 结束时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime endTime;

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
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /** 更新时间 */
    @TableField(fill = FieldFill.UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
    
    /** 删除标记 */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @TableField("lock_version")
    @Version
    private Integer version;
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

    /** 当前节点名称 (非持久化) */
    @TableField(exist = false)
    private String currentNodeName;

    /** 当前步骤序号 (从1开始，非持久化) */
    @TableField(exist = false)
    private Integer currentStepIndex;

    /** 总步骤数 (非持久化) */
    @TableField(exist = false)
    private Integer totalSteps;

    /** 上一步节点名称 (非持久化) */
    @TableField(exist = false)
    private String previousNodeName;

    /** 上一步处理人姓名 (非持久化) */
    @TableField(exist = false)
    private String previousOperatorName;

    /** 下一步节点名称 (非持久化) */
    @TableField(exist = false)
    private String nextNodeName;

    /** 下一步处理人描述 (非持久化) */
    @TableField(exist = false)
    private String nextAssigneeName;

    /** 流程步骤详情列表 (非持久化，包含每个步骤的审批人分配信息) */
    @TableField(exist = false)
    private java.util.List<java.util.Map<String, Object>> stepsDetail;

    /** 父流程实例ID（子流程场景，标识由哪个父流程启动） */
    private String parentInstanceId;

    /** 父流程中触发子流程的节点Key（子流程完成后回调父流程用） */
    private String parentNodeKey;

    public String getCurrentNodeName() { return currentNodeName; }
    public void setCurrentNodeName(String currentNodeName) { this.currentNodeName = currentNodeName; }

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

    public String getVariables() {
        return variables;
    }

    public void setVariables(String variables) {
        this.variables = variables;
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

    public Integer getStarterLeft() {
        return starterLeft;
    }

    public void setStarterLeft(Integer starterLeft) {
        this.starterLeft = starterLeft;
    }

    public LocalDateTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalDateTime startTime) {
        this.startTime = startTime;
    }

    public LocalDateTime getEndTime() {
        return endTime;
    }

    public void setEndTime(LocalDateTime endTime) {
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
    
    public Integer getDeleted() {
        return deleted;
    }

    public void setDeleted(Integer deleted) {
        this.deleted = deleted;
    }

    /** Alias for definitionId - used by DeployEnhancementServiceImpl */
    public String getProcessDefId() {
        return definitionId;
    }

    public void setProcessDefId(String processDefId) {
        this.definitionId = processDefId;
    }

    public String getParentInstanceId() {
        return parentInstanceId;
    }

    public void setParentInstanceId(String parentInstanceId) {
        this.parentInstanceId = parentInstanceId;
    }

    public String getParentNodeKey() {
        return parentNodeKey;
    }

    public void setParentNodeKey(String parentNodeKey) {
        this.parentNodeKey = parentNodeKey;
    }
}
