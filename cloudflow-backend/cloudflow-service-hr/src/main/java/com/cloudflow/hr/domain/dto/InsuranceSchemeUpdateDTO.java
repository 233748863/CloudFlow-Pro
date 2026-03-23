package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.DecimalMin;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 五险一金方案更新DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class InsuranceSchemeUpdateDTO {

    /**
     * 方案名称
     */
    private String schemeName;

    /**
     * 城市
     */
    private String city;

    /**
     * 养老保险-公司比例（%）
     */
    @DecimalMin(value = "0.00", message = "养老保险公司比例不能小于0")
    private BigDecimal pensionCompanyRate;

    /**
     * 养老保险-个人比例（%）
     */
    @DecimalMin(value = "0.00", message = "养老保险个人比例不能小于0")
    private BigDecimal pensionPersonalRate;

    /**
     * 医疗保险-公司比例（%）
     */
    @DecimalMin(value = "0.00", message = "医疗保险公司比例不能小于0")
    private BigDecimal medicalCompanyRate;

    /**
     * 医疗保险-个人比例（%）
     */
    @DecimalMin(value = "0.00", message = "医疗保险个人比例不能小于0")
    private BigDecimal medicalPersonalRate;

    /**
     * 失业保险-公司比例（%）
     */
    @DecimalMin(value = "0.00", message = "失业保险公司比例不能小于0")
    private BigDecimal unemploymentCompanyRate;

    /**
     * 失业保险-个人比例（%）
     */
    @DecimalMin(value = "0.00", message = "失业保险个人比例不能小于0")
    private BigDecimal unemploymentPersonalRate;

    /**
     * 工伤保险-公司比例（%）
     */
    @DecimalMin(value = "0.00", message = "工伤保险公司比例不能小于0")
    private BigDecimal injuryCompanyRate;

    /**
     * 生育保险-公司比例（%）
     */
    @DecimalMin(value = "0.00", message = "生育保险公司比例不能小于0")
    private BigDecimal maternityCompanyRate;

    /**
     * 公积金-公司比例（%）
     */
    @DecimalMin(value = "0.00", message = "公积金公司比例不能小于0")
    private BigDecimal housingFundCompanyRate;

    /**
     * 公积金-个人比例（%）
     */
    @DecimalMin(value = "0.00", message = "公积金个人比例不能小于0")
    private BigDecimal housingFundPersonalRate;

    /**
     * 缴纳基数下限
     */
    @DecimalMin(value = "0.00", message = "缴纳基数下限不能小于0")
    private BigDecimal baseMin;

    /**
     * 缴纳基数上限
     */
    @DecimalMin(value = "0.00", message = "缴纳基数上限不能小于0")
    private BigDecimal baseMax;

    /**
     * 基数计算规则
     */
    private String baseRule;

    /**
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
}
