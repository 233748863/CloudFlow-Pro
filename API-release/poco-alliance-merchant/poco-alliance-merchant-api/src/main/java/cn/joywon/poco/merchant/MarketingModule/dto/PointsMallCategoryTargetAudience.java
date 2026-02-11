package cn.joywon.poco.merchant.MarketingModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "积分商城商品分类目标用户配置")
public class PointsMallCategoryTargetAudience {

    @Schema(description = "最小等级可见")
    private Integer minLevel;

    @Schema(description = "最大等级可见")
    private Integer maxLevel;

    @Schema(description = "用户类型可见")
    private List<String> userTypes;

}