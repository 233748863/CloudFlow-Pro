package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 薪资等级视图对象
 */
@Data
public class SalaryGradeVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 职级ID
     */
    private Long levelId;
    
    /**
     * 职级编码（从hr_job_level关联查询）
     */
    private String levelCode;
    
    /**
     * 职级名称（从hr_job_level关联查询）
     */
    private String levelName;
    
    /**
     * 最低薪资
     */
    private BigDecimal minSalary;
    
    /**
     * 最高薪资
     */
    private BigDecimal maxSalary;
    
    /**
     * 中位薪资
     */
    private BigDecimal midSalary;
    
    /**
     * 币种：CNY-人民币 USD-美元
     */
    private String currency;
    
    /**
     * 币种描述
     */
    private String currencyDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
