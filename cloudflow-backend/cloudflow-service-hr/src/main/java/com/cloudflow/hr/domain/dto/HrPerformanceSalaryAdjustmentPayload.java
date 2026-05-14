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
@TableName("hr_performance_salary_adjustment")
public class HrPerformanceSalaryAdjustmentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long objectiveId;
    private Long employeeId;
    private Long compChangeId;

    @JsonIgnore
    @EncryptField
    @TableField("adjustment_amount")
    private String adjustmentAmountText;

    @TableField(exist = false)
    private BigDecimal adjustmentAmount;
    private String reason;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getAdjustmentAmount() {
        if (adjustmentAmount == null && adjustmentAmountText != null) {
            adjustmentAmount = HrFieldCodec.parseDecimal(adjustmentAmountText);
        }
        return adjustmentAmount;
    }

    public void setAdjustmentAmount(BigDecimal adjustmentAmount) {
        this.adjustmentAmount = adjustmentAmount;
        this.adjustmentAmountText = HrFieldCodec.formatDecimal(adjustmentAmount);
    }
}
