package com.cloudflow.hr.exception;

import lombok.Getter;

import java.util.HashMap;
import java.util.Map;

@Getter
public class HrBusinessException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;
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

    public static HrBusinessException invalidEmployeeStatus(Long employeeId, String currentStatus, String operation) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("currentStatus", currentStatus);
        data.put("operation", operation);
        return new HrBusinessException(
                "INVALID_EMPLOYEE_STATUS",
                String.format("Employee status [%s] cannot perform operation [%s]", currentStatus, operation),
                data
        );
    }

    public static HrBusinessException duplicateEmployeeNo(String employeeNo) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeNo", employeeNo);
        return new HrBusinessException(
                "DUPLICATE_EMPLOYEE_NO",
                String.format("Employee number [%s] already exists", employeeNo),
                data
        );
    }

    public static HrBusinessException invalidDeptOrPost(String type, Long invalidId) {
        Map<String, Object> data = new HashMap<>();
        data.put("type", type);
        data.put("invalidId", invalidId);
        return new HrBusinessException(
                "INVALID_DEPT_OR_POST",
                String.format("%s ID [%d] does not exist or is disabled", type, invalidId),
                data
        );
    }

    public static HrBusinessException employeeNotFound(Long employeeId) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        return new HrBusinessException(
                "EMPLOYEE_NOT_FOUND",
                String.format("Employee ID [%d] does not exist", employeeId),
                data
        );
    }

    public static HrBusinessException cannotDeleteActiveEmployee(Long employeeId) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        return new HrBusinessException(
                "CANNOT_DELETE_ACTIVE_EMPLOYEE",
                String.format("Employee ID [%d] is active and cannot be deleted", employeeId),
                data
        );
    }

    public static HrBusinessException employeeHasRelatedRecords(Long employeeId, Object relatedRecords) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("relatedRecords", relatedRecords);
        return new HrBusinessException(
                "EMPLOYEE_HAS_RELATED_RECORDS",
                String.format("Employee ID [%d] still has related records: %s", employeeId, relatedRecords),
                data
        );
    }

    public static HrBusinessException employeeLinkedUserDisableFailed(Long employeeId, Long userId) {
        Map<String, Object> data = new HashMap<>();
        data.put("employeeId", employeeId);
        data.put("userId", userId);
        return new HrBusinessException(
                "EMPLOYEE_LINKED_USER_DISABLE_FAILED",
                String.format("Failed to disable linked user [%d] for employee [%d]", userId, employeeId),
                data
        );
    }

    public static HrBusinessException emergencyContactNotFound(Long contactId) {
        Map<String, Object> data = new HashMap<>();
        data.put("contactId", contactId);
        return new HrBusinessException(
                "EMERGENCY_CONTACT_NOT_FOUND",
                String.format("Emergency contact ID [%d] does not exist", contactId),
                data
        );
    }
}
