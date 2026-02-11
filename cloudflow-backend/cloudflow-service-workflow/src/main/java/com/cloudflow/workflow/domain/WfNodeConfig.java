package com.cloudflow.workflow.domain;

import java.util.List;
import java.util.Map;
import java.io.Serializable;

/**
 * Workflow Node Configuration (mapped from frontend JSON)
 */
public class WfNodeConfig implements Serializable {
    private String id;
    private String type; // START, APPROVAL, CONDITION, PARALLEL, END, NOTIFICATION, SCRIPT, TIMER, SUBPROCESS, MANUAL
    private String title;
    private String description;
    private String approverType; // ROLE, USER, DEPT_MANAGER, DIRECT_LEADER
    private String approverValue;
    private WfNodeConfig next;
    private List<WfNodeConfig> branches;
    private String branchStrategy; // PARALLEL, RACE, EXCLUSIVE
    private String condition;
    private Boolean allowEdit;
    
    // Data Flow & Plugin Props
    private Map<String, String> inputs;
    private Map<String, String> outputs;
    private Map<String, Object> props;
    private Map<String, Object> retry; // Retry Config

    // Countersign fields (会签)
    private String signType; // ALL / ANY / PERCENT
    private Integer passPercent; // 通过百分比 (signType=PERCENT时使用)

    // SLA fields
    private Integer slaHours;
    private String slaAction; // AUTO_PASS, AUTO_REJECT

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getApproverType() {
        return approverType;
    }

    public void setApproverType(String approverType) {
        this.approverType = approverType;
    }

    public String getApproverValue() {
        return approverValue;
    }

    public void setApproverValue(String approverValue) {
        this.approverValue = approverValue;
    }

    public WfNodeConfig getNext() {
        return next;
    }

    public void setNext(WfNodeConfig next) {
        this.next = next;
    }

    public List<WfNodeConfig> getBranches() {
        return branches;
    }

    public void setBranches(List<WfNodeConfig> branches) {
        this.branches = branches;
    }
    
    public String getBranchStrategy() {
        return branchStrategy;
    }

    public void setBranchStrategy(String branchStrategy) {
        this.branchStrategy = branchStrategy;
    }

    public String getCondition() {
        return condition;
    }

    public void setCondition(String condition) {
        this.condition = condition;
    }
    
    public Boolean getAllowEdit() {
        return allowEdit;
    }

    public void setAllowEdit(Boolean allowEdit) {
        this.allowEdit = allowEdit;
    }
    
    public Integer getSlaHours() {
        return slaHours;
    }

    public void setSlaHours(Integer slaHours) {
        this.slaHours = slaHours;
    }

    public String getSlaAction() {
        return slaAction;
    }

    public void setSlaAction(String slaAction) {
        this.slaAction = slaAction;
    }

    public Map<String, String> getInputs() {
        return inputs;
    }

    public void setInputs(Map<String, String> inputs) {
        this.inputs = inputs;
    }

    public Map<String, String> getOutputs() {
        return outputs;
    }

    public void setOutputs(Map<String, String> outputs) {
        this.outputs = outputs;
    }

    public Map<String, Object> getProps() {
        return props;
    }

    public void setProps(Map<String, Object> props) {
        this.props = props;
    }

    public String getSignType() {
        return signType;
    }

    public void setSignType(String signType) {
        this.signType = signType;
    }

    public Integer getPassPercent() {
        return passPercent;
    }

    public void setPassPercent(Integer passPercent) {
        this.passPercent = passPercent;
    }

    public Map<String, Object> getRetry() {
        return retry;
    }

    public void setRetry(Map<String, Object> retry) {
        this.retry = retry;
    }
}
