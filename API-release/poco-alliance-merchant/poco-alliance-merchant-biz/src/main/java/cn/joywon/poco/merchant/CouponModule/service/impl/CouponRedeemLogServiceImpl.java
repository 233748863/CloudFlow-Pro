package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.joywon.poco.merchant.CouponModule.entity.CouponRedeemLog;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.CouponModule.mapper.CouponRedeemLogMapper;
import cn.joywon.poco.merchant.CouponModule.sender.CouponMsgSender;
import cn.joywon.poco.merchant.CouponModule.service.ICouponRedeemLogService;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class CouponRedeemLogServiceImpl extends
        ServiceImpl<CouponRedeemLogMapper, CouponRedeemLog> implements ICouponRedeemLogService {

    private final CouponMsgSender couponMsgSender;


    /**
     * 添加优惠券核销记录
     *
     * @param userCoupon      用户优惠券
     * @param couponTemplate  优惠券模板
     * @param issueMerchantId 优惠券原始发放商家ID
     * @param order           关联订单
     */
    @Override
    public void sendNewRecordMsg(UserCoupon userCoupon, CouponTemplate couponTemplate, Long issueMerchantId, Order order) {
        if (ObjUtil.isNull(order)) {
            order = new Order();
            order.setId(0L);
            order.setCouponDiscountAmount(BigDecimal.valueOf(0L));
        }

        CouponRedeemLog couponRedeemLog = new CouponRedeemLog();
        couponRedeemLog.setRedeemAmount(order.getCouponDiscountAmount());
        couponRedeemLog.setMerchantId(couponTemplate.getMerchantId());
        couponRedeemLog.setTemplateId(couponTemplate.getId());
        couponRedeemLog.setUserCouponId(userCoupon.getId());
        couponRedeemLog.setIssueMerchantId(issueMerchantId);
        couponRedeemLog.setUserId(userCoupon.getUserId());
        couponRedeemLog.setUsedOrderId(order.getId());

        boolean result = couponMsgSender.sendCouponRedeemMsg(couponRedeemLog);
        Assert.isTrue(result, () -> new RuntimeException("发送优惠券核销记录消息失败"));
    }


}