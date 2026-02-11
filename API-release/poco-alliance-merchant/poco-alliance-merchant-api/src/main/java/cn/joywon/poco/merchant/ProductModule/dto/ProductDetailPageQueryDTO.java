package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "商品明细分页查询DTO（支持多条件筛选）")
public class ProductDetailPageQueryDTO {

    @Schema(description = "页码", defaultValue = "1")
    private Long pageNum = 1L;

    @Schema(description = "每页大小", defaultValue = "10")
    private Long pageSize = 10L;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商品ID")
    private Long productId;

    @Schema(description = "商品名称（模糊查询）")
    private String name;

    @Schema(description = "商品状态：DRAFT/ACTIVE/INACTIVE/DELETED")
    private String status;

    @Schema(description = "SKU启用状态：1-启用，0-禁用")
    private Integer skuEnabled;

    @Schema(description = "创建开始时间")
    private java.time.LocalDateTime createdStart;

    @Schema(description = "创建结束时间")
    private java.time.LocalDateTime createdEnd;
}