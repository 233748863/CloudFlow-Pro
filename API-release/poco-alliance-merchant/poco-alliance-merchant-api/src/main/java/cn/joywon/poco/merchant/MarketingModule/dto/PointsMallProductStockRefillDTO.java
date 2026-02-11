package cn.joywon.poco.merchant.MarketingModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "积分商城商品库存补充参数")
public class PointsMallProductStockRefillDTO {

    @Schema(description = "商品ID")
    private String id;

    @Schema(description = "补充库存数量")
    private Integer stock;

}