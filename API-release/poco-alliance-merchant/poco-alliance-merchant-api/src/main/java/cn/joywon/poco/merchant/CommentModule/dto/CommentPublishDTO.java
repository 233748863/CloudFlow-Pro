package cn.joywon.poco.merchant.CommentModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 评价发布DTO
 */
@Data
@Schema(description = "评价发布DTO")
public class CommentPublishDTO {

    @Schema(description = "订单ID")
    @NotNull(message = "订单ID不能为空")
    private Long orderId;

    @Schema(description = "商品评价列表")
    @Valid
    private List<ProductCommentCreateDTO> productComments;

    @Schema(description = "物流评分 (1-5，可选)")
    @Min(value = 1, message = "评分最低1分")
    @Max(value = 5, message = "评分最高5分")
    private Integer deliveryStar;

    @Schema(description = "服务态度评分 (1-5)")
    @Min(value = 1, message = "评分最低1分")
    @Max(value = 5, message = "评分最高5分")
    private Integer serviceStar;
}