package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工五险一金VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeInsuranceVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 员工姓名
     */
    private String employeeName;

    /**
     * 员工工号
     */
    private String employeeNo;

    /**
     * 方案ID
     */
    private Long schemeId;

    /**
     * 方案名称
     */
    private String schemeName;

    /**
     * 城市
     */
    private String city;

    /**
     * 缴纳基数
     */
    private BigDecimal base;

    /**
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 状态：ACTIVE-生效中 EXPIRED-已过期
     */
    private String status;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
