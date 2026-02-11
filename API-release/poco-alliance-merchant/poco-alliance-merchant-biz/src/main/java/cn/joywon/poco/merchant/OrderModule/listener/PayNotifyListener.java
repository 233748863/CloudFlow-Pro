package cn.joywon.poco.merchant.OrderModule.listener;

import cn.joywon.poco.merchant.OrderModule.service.OrderService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 支付回调监听器
 */
@Slf4j
@Component
@AllArgsConstructor
public class PayNotifyListener {

    private final OrderService orderService;

    /**
     * 处理Redis消息
     * @param message 消息内容（订单号）
     */
    public void handleMessage(String message) {
        log.info("收到支付成功通知，订单号: {}", message);
        try {
            // 去除可能的引号
            String orderNo = message.replace("\"", "");
            orderService.paySuccess(orderNo);
        } catch (Exception e) {
            log.error("处理支付回调失败", e);
        }
    }

    /**
     * 处理退款Redis消息
     * @param message 消息内容（退款单号）
     */
    public void handleRefundMessage(String message) {
        log.info("收到退款成功通知，退款单号: {}", message);
        try {
            // 去除可能的引号
            String refundNo = message.replace("\"", "");
            orderService.refundSuccess(refundNo);
        } catch (Exception e) {
            log.error("处理退款回调失败", e);
        }
    }
}
