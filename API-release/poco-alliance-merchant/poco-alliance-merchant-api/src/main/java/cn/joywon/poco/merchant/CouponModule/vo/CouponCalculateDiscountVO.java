package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "优惠券计算折扣返回数据")
public class CouponCalculateDiscountVO {

    @Schema(description = "总原始金额")
    private BigDecimal totalOriginalAmount;

    @Schema(description = "总优惠金额")
    private BigDecimal totalDiscountAmount;

    @Schema(description = "平台优惠金额")
    private BigDecimal platformDiscountAmount;

    @Schema(description = "商家优惠金额")
    private BigDecimal merchantDiscountAmount;

    @Schema(description = "商家优惠明细列表")
    private List<MerchantDiscountInfo> merchantDiscountInfos;

    @Data
    @Schema(description = "商家优惠信息")
    public static class MerchantDiscountInfo {

        @Schema(description = "商家ID")
        private Long merchantId;

        @Schema(description = "商家名称")
        private String merchantName;

        @Schema(description = "商家logoURL")
        private String merchantLogo;

        @Schema(description = "商品主图")
        private List<String> productImages;

        @Schema(description = "商品总金额")
        private BigDecimal totalAmount;

        @Schema(description = "优惠金额")
        private BigDecimal discountAmount;

        @Schema(description = "优惠描述")
        private String discountDesc;

    }

    public static CouponCalculateDiscountVO of() {
        CouponCalculateDiscountVO vo = new CouponCalculateDiscountVO();
        vo.setTotalDiscountAmount(BigDecimal.ZERO);
        vo.setPlatformDiscountAmount(BigDecimal.ZERO);
        vo.setMerchantDiscountAmount(BigDecimal.ZERO);
        vo.setMerchantDiscountInfos(new ArrayList<>());

        return vo;
    }

    public static MerchantDiscountInfo discountInfo(Long merchantId) {
        MerchantDiscountInfo info = new MerchantDiscountInfo();
        info.setMerchantId(merchantId);
        info.setDiscountDesc("无优惠可用");
        info.setTotalAmount(BigDecimal.ZERO);
        info.setDiscountAmount(BigDecimal.ZERO);
        info.setProductImages(new ArrayList<>());

        return info;
    }


}