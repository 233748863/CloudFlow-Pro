package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 汇报关系VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class ReportingLineVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

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
     * 汇报对象ID
     */
    private Long reportToId;

    /**
     * 汇报对象姓名
     */
    private String reportToName;

    /**
     * 汇报对象工号
     */
    private String reportToNo;

    /**
     * 汇报类型：DIRECT-直接汇报 DOTTED-虚线汇报
     */
    private String reportType;

    /**
     * 汇报类型描述
     */
    private String reportTypeDesc;

    /**
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 失效日期
     */
    private LocalDate expiryDate;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
