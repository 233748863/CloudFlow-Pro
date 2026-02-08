package com.cloudflow.workflow.exception;

/**
 * 工作流自定义异常
 * 
 * @author CloudFlow
 */
public class WorkflowException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    private String code;
    
    public WorkflowException(String message) {
        super(message);
        this.code = "WORKFLOW_ERROR";
    }
    
    public WorkflowException(String code, String message) {
        super(message);
        this.code = code;
    }
    
    public WorkflowException(String message, Throwable cause) {
        super(message, cause);
        this.code = "WORKFLOW_ERROR";
    }
    
    public WorkflowException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }
    
    public String getCode() {
        return code;
    }
    
    public void setCode(String code) {
        this.code = code;
    }
    
    // 常用异常工厂方法
    public static WorkflowException processNotFound(String processKey) {
        return new WorkflowException("PROCESS_NOT_FOUND", "流程定义不存在: " + processKey);
    }
    
    public static WorkflowException taskNotFound(String taskId) {
        return new WorkflowException("TASK_NOT_FOUND", "任务不存在: " + taskId);
    }
    
    public static WorkflowException instanceNotFound(String instanceId) {
        return new WorkflowException("INSTANCE_NOT_FOUND", "流程实例不存在: " + instanceId);
    }
    
    public static WorkflowException permissionDenied(String operation) {
        return new WorkflowException("PERMISSION_DENIED", "无权限执行操作: " + operation);
    }
    
    public static WorkflowException invalidState(String message) {
        return new WorkflowException("INVALID_STATE", message);
    }
    
    public static WorkflowException rateLimitExceeded(String message) {
        return new WorkflowException("RATE_LIMIT_EXCEEDED", message);
    }
    
    public static WorkflowException validationError(String message) {
        return new WorkflowException("VALIDATION_ERROR", message);
    }
}
