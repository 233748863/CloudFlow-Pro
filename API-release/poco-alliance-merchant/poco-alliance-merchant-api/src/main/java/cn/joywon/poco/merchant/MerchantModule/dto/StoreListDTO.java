package cn.joywon.poco.merchant.MerchantModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "门店列表查询参数")
public class StoreListDTO extends PageQueryDTO {

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店区域编码列表")
    private List<Long> regionCodes;

    @Schema(description = "商家ID列表")
    private List<String> merchantIds;

    @Schema(description = "行业ID列表")
    private List<String> industryIds;

    @Schema(description = "营业状态列表")
    private List<@Pattern(regexp = BusinessStatusEnum.STORE_BIZ_STATUS_REGEX_PATTERN,
            message = "无效的营业状态") String> businessStatuses;

    @Schema(description = "是否仅查询启用门店")
    private Boolean enable;

    @Schema(hidden = true)
    private String regionJson;

}