package cn.joywon.poco.merchant.CommentModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 商品评价分页查询DTO
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "商品评价分页查询DTO")
public class ProductCommentPageDTO extends PageQueryDTO {

    @Schema(description = "商品ID")
    private Long productId;

    @Schema(description = "是否只看有图")
    private Boolean hasImage;

    @Schema(description = "是否只看好评 (4-5星)")
    private Boolean isGood;
    
    @Schema(description = "门店ID (可选，用于筛选特定门店的评价)")
    private Long storeId;
}
