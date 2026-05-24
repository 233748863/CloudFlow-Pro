package com.cloudflow.hr.domain.dto.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 工伤赔偿明细新增/修改入参。
 *
 * <p>{@code bankAccount} 字段在 Entity 层会自动加密，本 DTO 不做特殊处理。
 */
@Data
@Schema(name = "HrWorkInjuryCompensationDTO", description = "工伤赔偿明细入参")
public class HrWorkInjuryCompensationDTO {

    @Schema(description = "赔偿项目类型：MEDICAL/DISABILITY/LOST_WAGES/FUNERAL/OTHER")
    @NotBlank(message = "赔偿项目类型不能为空")
    @Size(max = 32)
    private String itemType;

    @Schema(description = "金额")
    @NotNull(message = "金额不能为空")
    private BigDecimal amount;

    @Schema(description = "支付状态：PENDING/APPROVED/PAID")
    @Size(max = 16)
    private String paymentStatus;

    @Schema(description = "收款银行账号（敏感字段，落库自动加密）")
    @Size(max = 64)
    private String bankAccount;

    @Schema(description = "备注")
    @Size(max = 512)
    private String remark;
}
