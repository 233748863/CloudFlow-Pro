package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.definition.BannerTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "轮播图查询参数")
public class BannerQueryDTO extends PageQueryDTO {

    @Schema(description = "轮播图名称")
    private String imageName;

    @Schema(description = "轮播图类型: NOTICE-公告; COUPON-优惠券; PRODUCT-商品; STORE-门店; MERCHANT-商家; INDUSTRY-行业")
    private List<@Pattern(regexp = BannerTypeEnum.BANNER_TYPE_REGEX_PATTERN,
            message = "无效的轮播图类型") String> targetTypes;

    @Schema(description = "是否查询已启用的轮播图")
    private Boolean enable;

    @Schema(description = "是否按权重升序排序")
    private Boolean orderByWeight;

    @Schema(description = "是否按创建时间升序排序")
    private Boolean orderByCreatedTime;

    @Schema(description = "查询轮播图创建开始时间")
    private LocalDate startDate;

    @Schema(description = "查询轮播图创建结束时间")
    private LocalDate endDate;

}