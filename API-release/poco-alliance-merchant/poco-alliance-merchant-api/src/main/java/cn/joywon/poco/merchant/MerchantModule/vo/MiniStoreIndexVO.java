package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.Common.convert.DistanceSerializer;
import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.MiniProductIndexShowVO;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "门店详情信息返回数据")
public class MiniStoreIndexVO {

    @JsonSerialize(using = DistanceSerializer.class)
    @Schema(description = "门店距离", type = "string")
    private Double distance;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "门店logo")
    private String storeLogo;

    @Schema(description = "门店地址")
    private String storeAddress;

    @Schema(description = "门店联系电话")
    private String storePhone;

    @Schema(description = "门店简介")
    private String description;

    @Schema(description = "门店营业时间")
    private String businessHours;

    @Schema(description = "门店营业状态")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "门店评分")
    private BigDecimal storeScore;

    @Schema(description = "门店图片列表")
    private List<String> storeImages;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logoURL")
    private String merchantLogo;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "行业分类名称")
    private String industryName;

    @Schema(description = "门店位置纬度")
    private Double latitude;

    @Schema(description = "门店位置经度")
    private Double longitude;

    @Schema(description = "门店优惠券数量")
    private Integer couponCount;

    @Schema(description = "商家优惠券列表")
    private List<MiniCouponIndexShowVO> coupons;

    @Schema(description = "门店商品数量")
    private Integer productCount;

    @Schema(description = "门店商品列表")
    private List<MiniProductIndexShowVO> products;

    @Schema(description = "门店分类列表")
    private List<MiniCategoryMenuVO> categories;

    @Schema(description = "门店导航菜单列表")
    private List<MiniNavigationMenuVO> naviMenus;

    @Schema(hidden = true)
    private String location;

    @Schema(hidden = true)
    private String images;

}