
package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 库存扣减DTO
 *
 * @author poco
 * @date 2024-12-19
 */
@Data
@Schema(description = "库存扣减DTO")
public class StockDeductDTO {

    /**
     * SKU ID
     */
    @NotNull(message = "SKU ID不能为空")
    @Schema(description = "SKU ID", required = true)
    private Long skuId;

    /**
     * 扣减数量
     */
    @NotNull(message = "扣减数量不能为空")
    @Min(value = 1, message = "扣减数量必须大于0")
    @Schema(description = "扣减数量", required = true)
    private Integer quantity;

    /**
     * 业务类型
     */
    @Schema(description = "业务类型：ORDER-订单，PROMOTION-促销活动")
    private String businessType;

    /**
     * 业务ID
     */
    @Schema(description = "业务ID")
    private String businessId;

    /**
     * 备注
     */
    @Schema(description = "备注")
    private String remark;
}