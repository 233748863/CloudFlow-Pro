package com.cloudflow.hr.service;

/**
 * HR 领域事件发布入口。
 */
public interface HrEventPublisher {

    /**
     * 员工离职生效事件。至少需要 employeeId；userId/部门名称为可选。
     */
    void publishEmployeeLeft(Long employeeId, Long userId, String employeeName, Long deptId, String deptName);
}
