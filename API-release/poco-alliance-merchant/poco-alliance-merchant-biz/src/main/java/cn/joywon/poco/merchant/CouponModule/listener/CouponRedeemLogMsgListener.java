package cn.joywon.poco.merchant.CouponModule.listener;

import cn.hutool.core.lang.Assert;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.CouponModule.entity.CouponRedeemLog;
import cn.joywon.poco.merchant.CouponModule.service.ICouponRedeemLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CouponRedeemLogMsgListener implements MessageListener {

    private final ICouponRedeemLogService couponRedeemLogService;

    /**
     * 监听优惠券核销记录消息
     * 接收到消息后向数据库写入优惠券核销记录
     *
     * @param message 优惠券核销记录消息
     */
    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        String body = null;
        try {
            body = new String(message.getBody());
            CouponRedeemLog couponRedeemLog = JSONUtil.toBean(body, CouponRedeemLog.class);
            boolean result = couponRedeemLogService.save(couponRedeemLog);
            Assert.isTrue(result, () -> new RuntimeException("优惠券核销记录写入失败"));

        } catch (Exception e) {
            log.error("优惠券核销记录消息处理失败, 消息体: {}", body, e);
        }
    }

}