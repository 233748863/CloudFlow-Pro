package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.MiniProductIndexShowVO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "小程序商家首页返回数据")
public class MiniMerchantIndexVO {

    @Schema(description = "门店数量")
    private Integer storeCount;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "门店logo")
    private String storeLogo;

    @Schema(description = "门店图片列表")
    private List<String> storeImages;

    @Schema(description = "门店地址")
    private String storeAddress;

    @Schema(description = "门店营业状态")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "门店营业时间")
    private String businessHours;

    @Schema(description = "门店联系电话")
    private String storePhone;

    @Schema(description = "门店评分")
    private BigDecimal storeScore;

    @Schema(description = "门店纬度")
    private BigDecimal latitude;

    @Schema(description = "门店经度")
    private BigDecimal longitude;

    @Schema(description = "门店距离")
    private Double distance;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo")
    private String merchantLogo;

    @Schema(description = "商家简介")
    private String description;

    @Schema(description = "商家图片列表")
    private List<String> merchantImages;

    @Schema(description = "所属行业分类ID")
    private Long industryId;

    @Schema(description = "所属行业分类名称")
    private String industryName;

    @Schema(description = "商家优惠券数量")
    private Integer couponCount;

    @Schema(description = "商家优惠券列表")
    private List<MiniCouponIndexShowVO> coupons;

    @Schema(description = "商家商品数量")
    private Integer productCount;

    @Schema(description = "商家商品列表")
    private List<MiniProductIndexShowVO> products;

    @Schema(description = "商家分类列表")
    private List<MiniCategoryMenuVO> categories;

}