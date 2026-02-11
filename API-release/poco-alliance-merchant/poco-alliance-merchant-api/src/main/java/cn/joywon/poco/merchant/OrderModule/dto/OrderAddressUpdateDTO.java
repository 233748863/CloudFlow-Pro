package cn.joywon.poco.merchant.OrderModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "订单地址更新DTO（支付前可更新，会写入快照）")
public class OrderAddressUpdateDTO {

    @NotNull(message = "订单ID不能为空")
    @Schema(description = "订单ID", required = true)
    private Long orderId;

    @Schema(description = "收货人姓名")
    private String receiverName;

    @Schema(description = "收货人联系方式")
    private String receiverPhone;

    @Schema(description = "省")
    private String province;

    @Schema(description = "市")
    private String city;

    @Schema(description = "区县")
    private String district;

    @Schema(description = "详细地址")
    private String detailAddress;

    @Schema(description = "纬度")
    private BigDecimal latitude;

    @Schema(description = "经度")
    private BigDecimal longitude;
}