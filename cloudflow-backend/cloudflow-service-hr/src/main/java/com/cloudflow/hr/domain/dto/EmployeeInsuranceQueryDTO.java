package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 员工五险一金查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeInsuranceQueryDTO {

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 方案ID
     */
    private Long schemeId;

    /**
     * 状态：ACTIVE-生效中 EXPIRED-已过期
     */
    private String status;

    /**
     * 页码
     */
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
