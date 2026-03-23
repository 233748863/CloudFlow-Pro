package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 员工五险一金详情VO（包含计算结果）
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeInsuranceDetailVO {

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
     * 养老保险-公司缴纳金额
     */
    private BigDecimal pensionCompanyAmount;

    /**
     * 养老保险-个人缴纳金额
     */
    private BigDecimal pensionPersonalAmount;

    /**
     * 医疗保险-公司缴纳金额
     */
    private BigDecimal medicalCompanyAmount;

    /**
     * 医疗保险-个人缴纳金额
     */
    private BigDecimal medicalPersonalAmount;

    /**
     * 失业保险-公司缴纳金额
     */
    private BigDecimal unemploymentCompanyAmount;

    /**
     * 失业保险-个人缴纳金额
     */
    private BigDecimal unemploymentPersonalAmount;

    /**
     * 工伤保险-公司缴纳金额
     */
    private BigDecimal injuryCompanyAmount;

    /**
     * 生育保险-公司缴纳金额
     */
    private BigDecimal maternityCompanyAmount;

    /**
     * 公积金-公司缴纳金额
     */
    private BigDecimal housingFundCompanyAmount;

    /**
     * 公积金-个人缴纳金额
     */
    private BigDecimal housingFundPersonalAmount;

    /**
     * 公司总缴纳金额
     */
    private BigDecimal companyTotalAmount;

    /**
     * 个人总缴纳金额
     */
    private BigDecimal personalTotalAmount;

    /**
     * 总缴纳金额
     */
    private BigDecimal totalAmount;
}
