package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_comp_grade")
public class HrCompGradePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String gradeCode;
    private String gradeName;
    private Long levelId;

    @JsonIgnore
    @EncryptField
    @TableField("min_salary")
    private String minSalaryText;

    @TableField(exist = false)
    private BigDecimal minSalary;

    @JsonIgnore
    @EncryptField
    @TableField("mid_salary")
    private String midSalaryText;

    @TableField(exist = false)
    private BigDecimal midSalary;

    @JsonIgnore
    @EncryptField
    @TableField("max_salary")
    private String maxSalaryText;

    @TableField(exist = false)
    private BigDecimal maxSalary;
    private String currency;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getMinSalary() {
        if (minSalary == null && minSalaryText != null) {
            minSalary = HrFieldCodec.parseDecimal(minSalaryText);
        }
        return minSalary;
    }

    public void setMinSalary(BigDecimal minSalary) {
        this.minSalary = minSalary;
        this.minSalaryText = HrFieldCodec.formatDecimal(minSalary);
    }

    public BigDecimal getMidSalary() {
        if (midSalary == null && midSalaryText != null) {
            midSalary = HrFieldCodec.parseDecimal(midSalaryText);
        }
        return midSalary;
    }

    public void setMidSalary(BigDecimal midSalary) {
        this.midSalary = midSalary;
        this.midSalaryText = HrFieldCodec.formatDecimal(midSalary);
    }

    public BigDecimal getMaxSalary() {
        if (maxSalary == null && maxSalaryText != null) {
            maxSalary = HrFieldCodec.parseDecimal(maxSalaryText);
        }
        return maxSalary;
    }

    public void setMaxSalary(BigDecimal maxSalary) {
        this.maxSalary = maxSalary;
        this.maxSalaryText = HrFieldCodec.formatDecimal(maxSalary);
    }
}
