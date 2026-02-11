package cn.joywon.poco.merchant.CommentModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 商品评价创建DTO
 */
@Data
@Schema(description = "商品评价创建DTO")
public class ProductCommentCreateDTO {

    @Schema(description = "订单项ID")
    @NotNull(message = "订单项ID不能为空")
    private Long orderItemId;

    @Schema(description = "商品评分 (1-5)")
    @NotNull(message = "评分不能为空")
    @Min(value = 1, message = "评分最低1分")
    @Max(value = 5, message = "评分最高5分")
    private Integer star;

    @Schema(description = "评价内容")
    private String content;

    @Schema(description = "评价图片 (JSON数组)")
    private String images;

    @Schema(description = "是否匿名 (0-否 1-是)")
    private Integer isAnonymous;
}
