package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "待审核联合营销计划查询参数")
public class JointMarketingPendingDTO extends PageQueryDTO {

    @Schema(description = "计划名称")
    private String planName;

    @Schema(description = "商家名称")
    private String merchantName;

}