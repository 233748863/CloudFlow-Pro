package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.Common.convert.DistanceSerializer;
import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.ProductModule.vo.MiniProductHomeListVO;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "小程序首页商家列表返回数据")
public class MiniMerchantListVO {

    @JsonSerialize(using = DistanceSerializer.class)
    @Schema(description = "与坐标点距离")
    private Double distance;

    @Schema(description = "门店ID")
    private String storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "门店logo")
    private String storeLogo;

    @Schema(description = "门店电话")
    private String storePhone;

    @Schema(description = "门店地址")
    private String storeAddress;

    @Schema(description = "门店营业时间")
    private String businessHours;

    @Schema(description = "门店营业状态")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "门店评分")
    private BigDecimal storeScore;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logoURL")
    private String merchantLogo;

    @Schema(description = "行业ID")
    private Long industryId;

    @Schema(description = "行业名称")
    private String industryName;

    @Schema(description = "商家优惠券列表")
    private List<MiniCouponIndexShowVO> coupons;

    @Schema(description = "商家商品列表")
    private List<MiniProductHomeListVO> products;

}