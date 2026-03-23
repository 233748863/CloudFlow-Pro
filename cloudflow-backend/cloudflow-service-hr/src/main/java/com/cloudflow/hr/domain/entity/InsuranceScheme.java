package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 五险一金方案实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_insurance_scheme")
public class InsuranceScheme {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

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
    private BigDecimal pensionCompanyRate;

    /**
     * 养老保险-个人比例（%）
     */
    private BigDecimal pensionPersonalRate;

    /**
     * 医疗保险-公司比例（%）
     */
    private BigDecimal medicalCompanyRate;

    /**
     * 医疗保险-个人比例（%）
     */
    private BigDecimal medicalPersonalRate;

    /**
     * 失业保险-公司比例（%）
     */
    private BigDecimal unemploymentCompanyRate;

    /**
     * 失业保险-个人比例（%）
     */
    private BigDecimal unemploymentPersonalRate;

    /**
     * 工伤保险-公司比例（%）
     */
    private BigDecimal injuryCompanyRate;

    /**
     * 生育保险-公司比例（%）
     */
    private BigDecimal maternityCompanyRate;

    /**
     * 公积金-公司比例（%）
     */
    private BigDecimal housingFundCompanyRate;

    /**
     * 公积金-个人比例（%）
     */
    private BigDecimal housingFundPersonalRate;

    /**
     * 缴纳基数下限
     */
    private BigDecimal baseMin;

    /**
     * 缴纳基数上限
     */
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

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
