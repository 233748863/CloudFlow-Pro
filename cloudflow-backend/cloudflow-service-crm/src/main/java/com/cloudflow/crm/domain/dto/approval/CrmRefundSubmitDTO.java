package com.cloudflow.crm.domain.dto.approval;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
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

    @Schema(description = "退款金额")
    @NotNull(message = "退款金额不能为空")
    @DecimalMin(value = "0.0", inclusive = false, message = "退款金额必须大于 0")
    private BigDecimal refundAmount;

    @Schema(description = "退款原因")
    @Size(max = 500)
    private String reason;
}
