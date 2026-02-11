package cn.joywon.poco.merchant.PlatformModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 行业分类查询参数
 */
@Data
@Schema(description = "行业分类查询参数")
public class IndustryQueryDTO {

    @Schema(description = "行业分类ID")
    private Long id;

    @Schema(description = "行业分类名称（模糊查询）")
    private String name;

    @Schema(description = "排序权重")
    private Integer weight;

    @Schema(description = "行业分类描述（模糊查询）")
    private String description;

    @Schema(description = "是否启用")
    private Boolean enable;

    @Schema(description = "创建人ID")
    private Long createdBy;

    @Schema(description = "创建时间-开始")
    private LocalDateTime createdTimeStart;

    @Schema(description = "创建时间-结束")
    private LocalDateTime createdTimeEnd;

    @Schema(description = "更新人ID")
    private Long updatedBy;

    @Schema(description = "更新时间-开始")
    private LocalDateTime updatedTimeStart;

    @Schema(description = "更新时间-结束")
    private LocalDateTime updatedTimeEnd;

}
