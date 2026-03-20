package com.cloudflow.hr.exception;

import lombok.Getter;

import java.util.HashMap;
import java.util.Map;

/**
 * HR业务异常
 * 用于HR服务的所有业务逻辑错误、业务规则违反等场景
 * 
 * @author CloudFlow
 */
@Getter
public class HrBusinessException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 错误代码
     */
    private final String code;
    
    /**
     * 附加数据
     */
    private final Map<String, Object> data;
    
    public HrBusinessException(String message) {
        super(message);
        this.code = "HR_BUSINESS_ERROR";
        this.data = new HashMap<>();
    }
    
    public HrBusinessException(String code, String message) {
        super(message);
        this.code = code;
        this.data = new HashMap<>();
    }
    
    public HrBusinessException(String code, String message, Map<String, Object> data) {
        super(message);
        this.code = code;
        this.data = data != null ? data : new HashMap<>();
    }
    
    public HrBusinessException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.data = new HashMap<>();
    }
    
    // ==================== 工厂方法 ====================
    
    /**
     * 假期额度不足
     */
    public static HrBusinessException insufficientQuota(String leaveTypeName, Object availableQuota, Object requestedQuota) {
        Map<String, Object> data = new HashMap<>();
        data.put("leaveTypeName", leaveTypeName);
        data.put("availableQuota", availableQuota);
        data.put("requestedQuota", requestedQuota);
        return new HrBusinessException("INSUFFICIENT_QUOTA", 
                String.format("假期额度不足：%s 可用额度为 %s，申请额度为 %s", leaveTypeName, availableQuota, requestedQuota), 
                data);
    }
    
    /**
     * 职位存在在职员工
     */
    public static HrBusinessException positionHasEmployee(Long positionId, String positionName, Integer employeeCount) {
        Map<String, Object> data = new HashMap<>();
        data.put("positionId", positionId);
        data.put("positionName", positionName);
        data.put("employeeCount", employeeCount);
        return new HrBusinessException("POSITION_HAS_EMPLOYEE", 
                String.format("职位 [%s] 存在 %d 名在职员工，无法删除", positionName, employeeCount), 
                data);
    }
    
    /**
     * 合同已过期
     */
    public static HrBusinessException contractExpired(Long employeeId, String employeeName, Object expiryDate) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("employeeName", employeeName);
        data.put("expiryDate", expiryDate);
        return new HrBusinessException("CONTRACT_EXPIRED", 
                String.format("员工 [%s] 的合同已于 %s 过期，请及时续签", employeeName, expiryDate), 
                data);
    }
    
    /**
     * 员工状态无效
     */
    public static HrBusinessException invalidEmployeeStatus(Long employeeId, String currentStatus, String operation) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("currentStatus", currentStatus);
        data.put("operation", operation);
        return new HrBusinessException("INVALID_EMPLOYEE_STATUS", 
                String.format("员工状态不符合要求：当前状态为 [%s]，无法执行 %s 操作", currentStatus, operation), 
                data);
    }
    
    /**
     * 编制超额
     */
    public static HrBusinessException headcountExceeded(String targetType, Long targetId, String targetName, 
                                                        Integer approvedCount, Integer actualCount) {
        Map<String, Object> data = new HashMap<>();
        data.put("targetType", targetType);
        data.put("targetId", targetId);
        data.put("targetName", targetName);
        data.put("approvedCount", approvedCount);
        data.put("actualCount", actualCount);
        return new HrBusinessException("HEADCOUNT_EXCEEDED", 
                String.format("%s [%s] 编制已满：核定编制 %d 人，实际在职 %d 人", 
                        "DEPT".equals(targetType) ? "部门" : "岗位", targetName, approvedCount, actualCount), 
                data);
    }
    
    /**
     * 工号重复
     */
    public static HrBusinessException duplicateEmployeeNo(String employeeNo) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeNo", employeeNo);
        return new HrBusinessException("DUPLICATE_EMPLOYEE_NO", 
                String.format("工号 [%s] 已存在，请使用其他工号", employeeNo), 
                data);
    }
    
    /**
     * 考勤冲突
     */
    public static HrBusinessException attendanceConflict(String conflictType, Object conflictDate, String conflictDetail) {
        Map<String, Object> data = new HashMap<>();
        data.put("conflictType", conflictType);
        data.put("conflictDate", conflictDate);
        data.put("conflictDetail", conflictDetail);
        return new HrBusinessException("ATTENDANCE_CONFLICT", 
                String.format("考勤冲突：%s - %s - %s", conflictType, conflictDate, conflictDetail), 
                data);
    }
    
    /**
     * 部门或岗位无效
     */
    public static HrBusinessException invalidDeptOrPost(String type, Long invalidId) {
        Map<String, Object> data = new HashMap<>();
        data.put("type", type);
        data.put("invalidId", invalidId);
        return new HrBusinessException("INVALID_DEPT_OR_POST", 
                String.format("%s ID [%d] 不存在或已失效", "DEPT".equals(type) ? "部门" : "岗位", invalidId), 
                data);
    }
    
    /**
     * 员工不存在
     */
    public static HrBusinessException employeeNotFound(Long employeeId) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        return new HrBusinessException("EMPLOYEE_NOT_FOUND", 
                String.format("员工 ID [%d] 不存在", employeeId), 
                data);
    }
    
    /**
     * 职位不存在
     */
    public static HrBusinessException positionNotFound(Long positionId) {
        Map<String, Object> data = new HashMap<>();
        data.put("positionId", positionId);
        return new HrBusinessException("POSITION_NOT_FOUND", 
                String.format("职位 ID [%d] 不存在", positionId), 
                data);
    }
    
    /**
     * 无法删除在职员工
     */
    public static HrBusinessException cannotDeleteActiveEmployee(Long employeeId) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        return new HrBusinessException("CANNOT_DELETE_ACTIVE_EMPLOYEE", 
                String.format("员工 ID [%d] 处于在职状态，无法删除", employeeId), 
                data);
    }
}
