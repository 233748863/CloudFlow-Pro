package com.cloudflow.hr.domain.dto.benefit;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 积分商城下单入参。
 *
 * <p>{@code receiverPhone} / {@code receiverAddress} 落库时由 Entity 上的 @EncryptField 自动加密。
 */
@Data
@Schema(name = "HrMallOrderPlaceDTO", description = "积分商城下单入参")
public class HrMallOrderPlaceDTO {

    @Schema(description = "商品 ID")
    @NotNull(message = "商品 ID 不能为空")
    private Long itemId;

    @Schema(description = "兑换数量")
    @NotNull(message = "兑换数量不能为空")
    @Min(value = 1, message = "兑换数量至少 1 件")
    private Integer quantity;

    @Schema(description = "收件人姓名")
    @NotBlank(message = "收件人不能为空")
    @Size(max = 64)
    private String receiverName;

    @Schema(description = "收件人手机号（落库自动加密）")
    @NotBlank(message = "收件人手机号不能为空")
    @Size(max = 32)
    private String receiverPhone;

    @Schema(description = "收件人地址（落库自动加密）")
    @NotBlank(message = "收件人地址不能为空")
    @Size(max = 512)
    private String receiverAddress;

    @Schema(description = "备注")
    @Size(max = 256)
    private String remark;
}
