package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;

/**
 * 提供给 CRM 等外部模块查员工归属与在职状态的视图。
 */
@Data
public class HrEmployeeSummaryVO {

    private Long employeeId;

    /** sys_user 的 userId，部分 CRM 业务以 userId 作为 ownerId。 */
    private Long userId;

    private String employeeNo;

    private String employeeName;

    private Long deptId;

    private String deptName;

    private Long positionId;

    private String positionName;

    /** 员工状态：ACTIVE / ON_LEAVE / LEFT 等。 */
    private String status;

    /** 是否在职。 */
    private boolean active;

    private LocalDate birthDate;
}
