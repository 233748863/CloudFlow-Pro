package com.cloudflow.crm.domain.vo;

import lombok.Data;

/**
 * HR 员工视图（从 service-hr Feign 拉取的精简数据）。
 */
@Data
public class HrEmployeeSummaryVO {

    private Long employeeId;

    private Long userId;

    private String employeeNo;

    private String employeeName;

    private Long deptId;

    private String deptName;

    private Long positionId;

    private String positionName;

    private String status;

    private boolean active;
}
