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
@TableName("hr_comp_change")
public class HrCompChangePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String changeNo;
    private Long employeeId;
    private String changeType;

    @JsonIgnore
    @EncryptField
    @TableField("before_total")
    private String beforeTotalText;

    @TableField(exist = false)
    private BigDecimal beforeTotal;

    @JsonIgnore
    @EncryptField
    @TableField("after_total")
    private String afterTotalText;

    @TableField(exist = false)
    private BigDecimal afterTotal;

    @JsonIgnore
    @EncryptField
    @TableField("change_amount")
    private String changeAmountText;

    @TableField(exist = false)
    private BigDecimal changeAmount;
    private LocalDate effectiveDate;
    private String reason;
    private String status;
    private String processInstanceId;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getBeforeTotal() {
        if (beforeTotal == null && beforeTotalText != null) {
            beforeTotal = HrFieldCodec.parseDecimal(beforeTotalText);
        }
        return beforeTotal;
    }

    public void setBeforeTotal(BigDecimal beforeTotal) {
        this.beforeTotal = beforeTotal;
        this.beforeTotalText = HrFieldCodec.formatDecimal(beforeTotal);
    }

    public BigDecimal getAfterTotal() {
        if (afterTotal == null && afterTotalText != null) {
            afterTotal = HrFieldCodec.parseDecimal(afterTotalText);
        }
        return afterTotal;
    }

    public void setAfterTotal(BigDecimal afterTotal) {
        this.afterTotal = afterTotal;
        this.afterTotalText = HrFieldCodec.formatDecimal(afterTotal);
    }

    public BigDecimal getChangeAmount() {
        if (changeAmount == null && changeAmountText != null) {
            changeAmount = HrFieldCodec.parseDecimal(changeAmountText);
        }
        return changeAmount;
    }

    public void setChangeAmount(BigDecimal changeAmount) {
        this.changeAmount = changeAmount;
        this.changeAmountText = HrFieldCodec.formatDecimal(changeAmount);
    }
}
