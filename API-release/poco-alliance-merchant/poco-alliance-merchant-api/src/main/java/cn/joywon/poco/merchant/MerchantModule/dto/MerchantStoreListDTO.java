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
@Schema(description = "商家门店列表查询参数")
public class MerchantStoreListDTO extends PageQueryDTO {

    @Schema(description = "商家ID")
    private String merchantId;

    @Schema(description = "门店是否启用")
    private Boolean enable;

    @Schema(description = "门店营业状态: OPEN(营业中), CLOSED(已关店), RESTING(休息中)")
    private List<@Pattern(regexp = BusinessStatusEnum.STORE_BIZ_STATUS_REGEX_PATTERN,
            message = "无效的营业状态") String> businessStatus;

    @Schema(description = "门店名称关键字")
    private String keyword;

}