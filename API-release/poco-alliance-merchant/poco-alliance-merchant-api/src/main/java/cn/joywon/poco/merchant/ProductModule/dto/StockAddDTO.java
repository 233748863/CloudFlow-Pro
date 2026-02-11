
package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 库存增加DTO
 *
 * @author poco
 * @date 2024-12-19
 */
@Data
@Schema(description = "库存增加DTO")
public class StockAddDTO {

    /**
     * SKU ID
     */
    @NotNull(message = "SKU ID不能为空")
    @Schema(description = "SKU ID", required = true)
    private Long skuId;

    /**
     * 增加数量
     */
    @NotNull(message = "增加数量不能为空")
    @Min(value = 1, message = "增加数量必须大于0")
    @Schema(description = "增加数量", required = true)
    private Integer quantity;

    /**
     * 业务类型
     */
    @Schema(description = "业务类型：REFUND-退款，RESTOCK-补货")
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