package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_tax_deduction")
public class HrTaxDeductionPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String deductionType;

    @JsonIgnore
    @EncryptField
    @TableField("amount")
    private String amountText;

    @TableField(exist = false)
    private BigDecimal amount;
    private LocalDate startDate;
    private LocalDate endDate;
    private String status;
    private String remark;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getAmount() {
        if (amount == null && amountText != null) {
            amount = HrFieldCodec.parseDecimal(amountText);
        }
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
        this.amountText = HrFieldCodec.formatDecimal(amount);
    }
}
