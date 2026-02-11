package cn.joywon.poco.merchant.OrderModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "订单地址快照VO")
public class OrderAddressSnapshotVO {

    @Schema(description = "地址ID")
    private Long id;

    @Schema(description = "收货人姓名")
    private String receiverName;

    @Schema(description = "收货人手机号")
    private String receiverPhone;

    @Schema(description = "省")
    private String province;

    @Schema(description = "市")
    private String city;

    @Schema(description = "区/县")
    private String district;

    @Schema(description = "详细地址")
    private String detailAddress;

    @Schema(description = "纬度")
    private BigDecimal latitude;

    @Schema(description = "经度")
    private BigDecimal longitude;
}