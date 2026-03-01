package com.cloudflow.workflow.exception;

import lombok.Getter;

/**
 * 资源不存在异常
 * 用于请求的资源（模板、流程、版本等）不存在的场景
 * 
 * @author CloudFlow
 */
@Getter
public class NotFoundException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 错误代码
     */
    private final String code;
    
    /**
     * 资源类型
     */
    private final String resourceType;
    
    /**
     * 资源 ID
     */
    private final String resourceId;
    
    public NotFoundException(String message) {
        super(message);
        this.code = "RESOURCE_NOT_FOUND";
        this.resourceType = null;
        this.resourceId = null;
    }
    
    public NotFoundException(String code, String message) {
        super(message);
        this.code = code;
        this.resourceType = null;
        this.resourceId = null;
    }
    
    public NotFoundException(String resourceType, String resourceId, String message) {
        super(message);
        this.code = "RESOURCE_NOT_FOUND";
        this.resourceType = resourceType;
        this.resourceId = resourceId;
    }
    
    // 常用资源不存在异常工厂方法
    
    /**
     * 模板不存在
     */
    public static NotFoundException templateNotFound(String templateId) {
        return new NotFoundException("template", templateId, 
                "未找到 ID 为 " + templateId + " 的流程模板");
    }
    
    /**
     * 模板分类不存在
     */
    public static NotFoundException categoryNotFound(String categoryId) {
        return new NotFoundException("category", categoryId, 
                "未找到 ID 为 " + categoryId + " 的模板分类");
    }
    
    /**
     * 流程不存在
     */
    public static NotFoundException workflowNotFound(String workflowId) {
        return new NotFoundException("workflow", workflowId, 
                "未找到 ID 为 " + workflowId + " 的流程");
    }
    
    /**
     * 版本不存在
     */
    public static NotFoundException versionNotFound(String versionId) {
        return new NotFoundException("version", versionId, 
                "未找到 ID 为 " + versionId + " 的版本记录");
    }
    
    /**
     * 归档记录不存在
     */
    public static NotFoundException archiveNotFound(String archiveId) {
        return new NotFoundException("archive", archiveId, 
                "未找到 ID 为 " + archiveId + " 的归档记录");
    }
    
    /**
     * 流程实例不存在
     */
    public static NotFoundException instanceNotFound(String instanceId) {
        return new NotFoundException("instance", instanceId, 
                "未找到 ID 为 " + instanceId + " 的流程实例");
    }
}
