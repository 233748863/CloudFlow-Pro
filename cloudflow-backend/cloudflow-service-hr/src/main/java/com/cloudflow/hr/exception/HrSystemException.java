package com.cloudflow.hr.exception;

import lombok.Getter;

import java.util.HashMap;
import java.util.Map;

@Getter
public class HrSystemException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;

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

    public static HrSystemException authServiceFailed(String apiPath, String errorDetail) {
        Map<String, Object> data = serviceData("Auth", apiPath, errorDetail);
        return new HrSystemException(
                "SERVICE_CALL_FAILED",
                String.format("调用 Auth 服务失败：%s - %s", apiPath, errorDetail),
                data);
    }

    public static HrSystemException authServiceFailed(String apiPath, String errorDetail, Throwable cause) {
        Map<String, Object> data = serviceData("Auth", apiPath, errorDetail);
        return new HrSystemException(
                "SERVICE_CALL_FAILED",
                String.format("调用 Auth 服务失败：%s - %s", apiPath, errorDetail),
                data,
                cause);
    }

    public static HrSystemException deptSyncFailed(Long deptId, String errorDetail) {
        Map<String, Object> data = syncData("DEPT", deptId, errorDetail);
        return new HrSystemException(
                "DATA_SYNC_FAILED",
                String.format("部门数据同步失败：ID=%d - %s", deptId, errorDetail),
                data);
    }

    public static HrSystemException deptSyncFailed(Long deptId, String errorDetail, Throwable cause) {
        Map<String, Object> data = syncData("DEPT", deptId, errorDetail);
        return new HrSystemException(
                "DATA_SYNC_FAILED",
                String.format("部门数据同步失败：ID=%d - %s", deptId, errorDetail),
                data,
                cause);
    }

    public static HrSystemException postSyncFailed(Long postId, String errorDetail) {
        Map<String, Object> data = syncData("POST", postId, errorDetail);
        return new HrSystemException(
                "DATA_SYNC_FAILED",
                String.format("岗位数据同步失败：ID=%d - %s", postId, errorDetail),
                data);
    }

    public static HrSystemException postSyncFailed(Long postId, String errorDetail, Throwable cause) {
        Map<String, Object> data = syncData("POST", postId, errorDetail);
        return new HrSystemException(
                "DATA_SYNC_FAILED",
                String.format("岗位数据同步失败：ID=%d - %s", postId, errorDetail),
                data,
                cause);
    }

    public static HrSystemException fullSyncFailed(String syncType, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", syncType);
        data.put("errorDetail", errorDetail);
        return new HrSystemException(
                "DATA_SYNC_FAILED",
                String.format("%s全量同步失败：%s", "DEPT".equals(syncType) ? "部门" : "岗位", errorDetail),
                data);
    }

    private static Map<String, Object> serviceData(String serviceName, String apiPath, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("serviceName", serviceName);
        data.put("apiPath", apiPath);
        data.put("errorDetail", errorDetail);
        return data;
    }

    private static Map<String, Object> syncData(String syncType, Long targetId, String errorDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("syncType", syncType);
        data.put("targetId", targetId);
        data.put("errorDetail", errorDetail);
        return data;
    }
}
