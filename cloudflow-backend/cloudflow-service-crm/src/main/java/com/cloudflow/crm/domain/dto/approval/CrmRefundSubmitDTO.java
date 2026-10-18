package com.cloudflow.crm.domain.dto.approval;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * CRM 退款审批入参。
 */
@Data
@Schema(name = "CrmRefundSubmitDTO", description = "CRM 退款审批入参")
public class CrmRefundSubmitDTO {

    @Schema(description = "应收 ID")
    @NotNull(message = "应收 ID 不能为空")
    private Long receivableId;

    @Schema(description = "财务选定的原收款记录ID")
    @NotNull(message = "请选择原收款记录")
    @Positive(message = "原收款记录ID无效")
    private Long receiptEventId;

    @Schema(description = "核对原收款记录时的回款计划版本")
    @NotNull(message = "请读取最新回款计划后重试")
    @Min(0)
    private Integer version;

    @Schema(description = "退款金额")
    @NotNull(message = "退款金额不能为空")
    @DecimalMin(value = "0.0", inclusive = false, message = "退款金额必须大于 0")
    private BigDecimal refundAmount;

    @Schema(description = "退款原因")
    @Size(max = 500)
    private String reason;
}
