package cn.joywon.poco.merchant.CouponModule.sender;

import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.CouponModule.definition.CouponMessageChannel;
import cn.joywon.poco.merchant.CouponModule.entity.CouponRedeemLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;


@Slf4j
@Component
@RequiredArgsConstructor
public class CouponMsgSender implements CouponMessageChannel {

    private final StringRedisTemplate stringRedisTemplate;


    /**
     * 发送优惠券核销记录消息
     *
     * @param couponRedeemLog 优惠券核销记录实体
     * @return 发送结果
     */
    public boolean sendCouponRedeemMsg(CouponRedeemLog couponRedeemLog) {
        String msg = null;
        Long count = null;
        try {
            msg = JSONUtil.toJsonStr(couponRedeemLog);
            count = stringRedisTemplate.convertAndSend(COUPON_REDEEM_LOG_TOPIC, msg);
        } catch (Exception e) {
            log.error("发送优惠券核销记录消息失败, 消息体: {}", msg, e);
        }
        return count != null && count == 1L;
    }

}