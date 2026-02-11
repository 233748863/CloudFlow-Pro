package cn.joywon.poco.merchant.MerchantModule.dto;

import cn.joywon.poco.merchant.Common.page.CursorQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class MiniStoreQueryDTO extends CursorQueryDTO {

    @Schema(description = "行业分类ID")
    private String industryId;

    @Schema(description = "商家名称")
    private String name;

    @Schema(description = "是否按评分降序")
    private Boolean sortByScore;

}