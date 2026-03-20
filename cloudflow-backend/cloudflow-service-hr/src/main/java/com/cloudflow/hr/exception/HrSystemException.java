package com.cloudflow.hr.exception;

import lombok.Getter;

import java.util.HashMap;
import java.util.Map;

/**
 * HR系统异常
 * 用于HR服务的系统级错误，如服务调用失败、数据同步失败等
 * 
 * @author CloudFlow
 */
@Getter
public class HrSystemException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 错误代码
     */
    private final String code;
    
    /**
     * 附加数据
     */
    private final Map<String, Object> data;
    
    public HrSystemException(String message) {
        super(message);
        this.code = "HR_SYSTEM_ERROR";
        this.data = new HashMap<>();
    }
    
    public HrSystemException(String code, String message) {
        super(message);
        this.code = code;
        this.data = new HashMap<>();
    }
    
    public HrSystemException(String code, String message, Map<String, Object> data) {
        super(message);
        this.code = code;
        this.data = data != null ? data : new HashMap<>();
    }
    
    public HrSystemException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.data = new HashMap<>();
    }
    
    public HrSystemException(String code, String message, Map<String, Object> data, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.data = data != null ? data : new HashMap<>();
    }
    
    // ==================== 工厂方法 ====================
    
    /**
     * Auth服务调用失败
     */
    public static HrSystemException authServiceFailed(String apiPath, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("serviceName", "Auth");
        data.put("apiPath", apiPath);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("SERVICE_CALL_FAILED", 
                String.format("调用 Auth 服务失败：%s - %s", apiPath, errorDetail), 
                data);
    }
    
    /**
     * Auth服务调用失败（带异常）
     */
    public static HrSystemException authServiceFailed(String apiPath, String errorDetail, Throwable cause) {
        Map<String, Object> data = new HashMap<>();
        data.put("serviceName", "Auth");
        data.put("apiPath", apiPath);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("SERVICE_CALL_FAILED", 
                String.format("调用 Auth 服务失败：%s - %s", apiPath, errorDetail), 
                data, cause);
    }
    
    /**
     * Workflow服务调用失败
     */
    public static HrSystemException workflowServiceFailed(String apiPath, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("serviceName", "Workflow");
        data.put("apiPath", apiPath);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("SERVICE_CALL_FAILED", 
                String.format("调用 Workflow 服务失败：%s - %s", apiPath, errorDetail), 
                data);
    }
    
    /**
     * Workflow服务调用失败（带异常）
     */
    public static HrSystemException workflowServiceFailed(String apiPath, String errorDetail, Throwable cause) {
        Map<String, Object> data = new HashMap<>();
        data.put("serviceName", "Workflow");
        data.put("apiPath", apiPath);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("SERVICE_CALL_FAILED", 
                String.format("调用 Workflow 服务失败：%s - %s", apiPath, errorDetail), 
                data, cause);
    }
    
    /**
     * 部门数据同步失败
     */
    public static HrSystemException deptSyncFailed(Long deptId, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", "DEPT");
        data.put("targetId", deptId);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("DATA_SYNC_FAILED", 
                String.format("部门数据同步失败：ID=%d - %s", deptId, errorDetail), 
                data);
    }
    
    /**
     * 部门数据同步失败（带异常）
     */
    public static HrSystemException deptSyncFailed(Long deptId, String errorDetail, Throwable cause) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", "DEPT");
        data.put("targetId", deptId);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("DATA_SYNC_FAILED", 
                String.format("部门数据同步失败：ID=%d - %s", deptId, errorDetail), 
                data, cause);
    }
    
    /**
     * 岗位数据同步失败
     */
    public static HrSystemException postSyncFailed(Long postId, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", "POST");
        data.put("targetId", postId);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("DATA_SYNC_FAILED", 
                String.format("岗位数据同步失败：ID=%d - %s", postId, errorDetail), 
                data);
    }
    
    /**
     * 岗位数据同步失败（带异常）
     */
    public static HrSystemException postSyncFailed(Long postId, String errorDetail, Throwable cause) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", "POST");
        data.put("targetId", postId);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("DATA_SYNC_FAILED", 
                String.format("岗位数据同步失败：ID=%d - %s", postId, errorDetail), 
                data, cause);
    }
    
    /**
     * 全量同步失败
     */
    public static HrSystemException fullSyncFailed(String syncType, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", syncType);
        data.put("errorDetail", errorDetail);
        return new HrSystemException("DATA_SYNC_FAILED", 
                String.format("%s 全量同步失败：%s", "DEPT".equals(syncType) ? "部门" : "岗位", errorDetail), 
                data);
    }
}
