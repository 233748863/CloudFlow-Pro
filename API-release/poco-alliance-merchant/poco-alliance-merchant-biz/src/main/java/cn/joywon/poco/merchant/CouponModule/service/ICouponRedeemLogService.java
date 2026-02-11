package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.merchant.CouponModule.entity.CouponRedeemLog;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import com.baomidou.mybatisplus.extension.service.IService;

public interface ICouponRedeemLogService extends IService<CouponRedeemLog> {


    /**
     * 添加优惠券核销记录
     *
     * @param userCoupon      用户优惠券
     * @param couponTemplate  优惠券模板
     * @param issueMerchantId 优惠券原始发放商家ID
     * @param order           关联订单
     */
    void sendNewRecordMsg(UserCoupon userCoupon, CouponTemplate couponTemplate, Long issueMerchantId, Order order);


}