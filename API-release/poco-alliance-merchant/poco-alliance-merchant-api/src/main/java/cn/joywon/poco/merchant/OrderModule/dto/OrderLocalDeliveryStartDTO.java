package cn.joywon.poco.merchant.OrderModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "本地配送开始DTO")
public class OrderLocalDeliveryStartDTO {

    @NotNull(message = "订单ID不能为空")
    @Schema(description = "订单ID", required = true)
    private Long orderId;

    @NotBlank(message = "配送员姓名不能为空")
    @Schema(description = "配送员姓名", required = true)
    private String deliveryPersonName;

    @NotBlank(message = "配送员联系方式不能为空")
    @Schema(description = "配送员联系方式", required = true)
    private String deliveryPersonPhone;
}