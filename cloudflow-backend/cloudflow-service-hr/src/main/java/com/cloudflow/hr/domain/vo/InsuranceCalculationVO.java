package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 五险一金计算结果VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InsuranceCalculationVO {

    /**
     * 缴纳基数
     */
    private BigDecimal base;

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
