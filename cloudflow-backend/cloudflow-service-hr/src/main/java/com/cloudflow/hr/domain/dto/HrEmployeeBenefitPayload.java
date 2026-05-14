package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_employee_benefit")
public class HrEmployeeBenefitPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private Long schemeId;

    @JsonIgnore
    @EncryptField
    @TableField("base_amount")
    private String baseAmountText;

    @TableField(exist = false)
    private BigDecimal baseAmount;
    private LocalDate effectiveDate;
    private String status;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getBaseAmount() {
        if (baseAmount == null && baseAmountText != null) {
            baseAmount = HrFieldCodec.parseDecimal(baseAmountText);
        }
        return baseAmount;
    }

    public void setBaseAmount(BigDecimal baseAmount) {
        this.baseAmount = baseAmount;
        this.baseAmountText = HrFieldCodec.formatDecimal(baseAmount);
    }
}
