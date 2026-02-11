package cn.joywon.poco.merchant.MerchantModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
public class MerchantInviteQueryDTO extends PageQueryDTO {

    @Schema(description = "地区编码列表")
    private List<Long> regionCodes;

    @Schema(description = "行业分类ID列表")
    private List<String> industryIds;

    @Schema(description = "商家名称(模糊查询)")
    private String merchantName;

    @Schema(hidden = true)
    private String regionCodeJson;

}