package cn.joywon.poco.merchant.CouponModule.bo;

import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import lombok.Data;

import java.util.List;

@Data
// 商家优惠券分组信息数据
public class MerchantCouponGroupBO {

    // 商家ID
    private Long merchantId;

    // 优惠券分组列表
    private List<MiniCouponIndexShowVO> coupons;

}