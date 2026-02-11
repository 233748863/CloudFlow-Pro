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
@Schema(description = "商家列表查询参数")
public class MerchantListDTO extends PageQueryDTO {

    @Schema(description = "商家名称")
    private String name;

    @Schema(description = "商家ID列表")
    private List<String> merchantIds;

    @Schema(description = "行业分类ID列表")
    private List<String> industryIds;

    @Schema(description = "区域编码列表")
    private List<Long> regionCodes;

    @Schema(description = "商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业")
    private List<@Pattern(regexp = BusinessStatusEnum.MERCHANT_BIZ_STATUS_REGEX_PATTERN,
            message = "无效的商家经营状态") String> businessStatus;

    @Schema(description = "是否查询启用商家")
    private Boolean enable;

    @Schema(description = "是否按创建时间升序排序")
    private Boolean orderByCreateTime;

    @Schema(description = "区域JSON字符串", hidden = true)
    private String regionCodeJsonStr;

}