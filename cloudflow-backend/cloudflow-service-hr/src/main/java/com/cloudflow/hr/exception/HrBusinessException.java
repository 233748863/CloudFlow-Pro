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

    /**
     * 员工存在关联业务数据
     */
    public static HrBusinessException employeeHasRelatedRecords(Long employeeId, Object relatedRecords) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("relatedRecords", relatedRecords);
        return new HrBusinessException("EMPLOYEE_HAS_RELATED_RECORDS",
                String.format("员工 ID [%d] 仍存在关联数据，请先处理后再删除：%s", employeeId, relatedRecords),
                data);
    }

    /**
     * 员工关联用户禁用失败
     */
    public static HrBusinessException employeeLinkedUserDisableFailed(Long employeeId, Long userId) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("userId", userId);
        return new HrBusinessException("EMPLOYEE_LINKED_USER_DISABLE_FAILED",
                String.format("员工 ID [%d] 关联的用户 ID [%d] 禁用失败，已终止删除操作", employeeId, userId),
                data);
    }
    
    /**
     * 合同编号重复
     */
    public static HrBusinessException duplicateContractNo(String contractNo) {
        Map<String, Object> data = new HashMap<>();
        data.put("contractNo", contractNo);
        return new HrBusinessException("DUPLICATE_CONTRACT_NO", 
                String.format("合同编号 [%s] 已存在，请使用其他编号", contractNo), 
                data);
    }
    
    /**
     * 合同不存在
     */
    public static HrBusinessException contractNotFound(Long contractId) {
        Map<String, Object> data = new HashMap<>();
        data.put("contractId", contractId);
        return new HrBusinessException("CONTRACT_NOT_FOUND", 
                String.format("合同 ID [%d] 不存在", contractId), 
                data);
    }
    
    /**
     * 无法删除生效中的合同
     */
    public static HrBusinessException cannotDeleteActiveContract(Long contractId) {
        Map<String, Object> data = new HashMap<>();
        data.put("contractId", contractId);
        return new HrBusinessException("CANNOT_DELETE_ACTIVE_CONTRACT", 
                String.format("合同 ID [%d] 已生效，无法删除", contractId), 
                data);
    }
    
    /**
     * 证件不存在
     */
    public static HrBusinessException documentNotFound(Long documentId) {
        Map<String, Object> data = new HashMap<>();
        data.put("documentId", documentId);
        return new HrBusinessException("DOCUMENT_NOT_FOUND", 
                String.format("证件 ID [%d] 不存在", documentId), 
                data);
    }
    
    /**
     * 紧急联系人不存在
     */
    public static HrBusinessException emergencyContactNotFound(Long contactId) {
        Map<String, Object> data = new HashMap<>();
        data.put("contactId", contactId);
        return new HrBusinessException("EMERGENCY_CONTACT_NOT_FOUND", 
                String.format("紧急联系人 ID [%d] 不存在", contactId), 
                data);
    }
}
