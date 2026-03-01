package com.cloudflow.workflow.exception;

import lombok.Getter;

import java.util.List;
import java.util.Map;

/**
 * 业务异常
 * 用于业务逻辑错误、业务规则违反等场景
 * 
 * @author CloudFlow
 */
@Getter
public class BusinessException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 错误代码
     */
    private final String code;
    
    /**
     * 附加数据
     */
    private final Map<String, Object> data;
    
    public BusinessException(String message) {
        super(message);
        this.code = "BUSINESS_ERROR";
        this.data = null;
    }
    
    public BusinessException(String code, String message) {
        super(message);
        this.code = code;
        this.data = null;
    }
    
    public BusinessException(String code, String message, Map<String, Object> data) {
        super(message);
        this.code = code;
        this.data = data;
    }
    
    public BusinessException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.data = null;
    }
    
    // 常用业务异常工厂方法
    
    /**
     * 模板正在使用中，无法删除
     */
    public static BusinessException templateInUse(int usageCount) {
        return new BusinessException("TEMPLATE_IN_USE", 
                "该模板正在被使用，无法删除", 
                Map.of("usageCount", usageCount));
    }
    
    /**
     * 流程有运行中的实例
     */
    public static BusinessException hasRunningInstances(List<String> workflowIds) {
        return new BusinessException("RUNNING_INSTANCES_WARNING", 
                "该流程有正在运行的实例，操作可能影响运行中的流程", 
                Map.of("affectedWorkflows", workflowIds));
    }
    
    /**
     * 导入失败
     */
    public static BusinessException importFailed(String message) {
        return new BusinessException("IMPORT_FAILED", "导入失败: " + message);
    }
    
    /**
     * 导出失败
     */
    public static BusinessException exportFailed(String message) {
        return new BusinessException("EXPORT_FAILED", "导出失败: " + message);
    }
    
    /**
     * 版本回滚失败
     */
    public static BusinessException rollbackFailed(String message) {
        return new BusinessException("ROLLBACK_FAILED", "版本回滚失败: " + message);
    }
    
    /**
     * 归档失败
     */
    public static BusinessException archiveFailed(String message) {
        return new BusinessException("ARCHIVE_FAILED", "归档失败: " + message);
    }
    
    /**
     * 操作状态无效
     */
    public static BusinessException invalidState(String message) {
        return new BusinessException("INVALID_STATE", message);
    }
}
