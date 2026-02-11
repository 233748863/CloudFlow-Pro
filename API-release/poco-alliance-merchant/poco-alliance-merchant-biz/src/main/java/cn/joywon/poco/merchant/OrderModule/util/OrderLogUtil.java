package cn.joywon.poco.merchant.OrderModule.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 订单操作日志记录工具类
 * 
 * @author AI Assistant
 * @since 2024-01-01
 */
@Slf4j
@Component
public class OrderLogUtil {
    
    /**
     * 记录订单创建日志
     */
    public void logOrderCreate(Long userId, Long storeId, String orderNo, String payAmount) {
        log.info("订单创建 - 用户ID: {}, 门店ID: {}, 订单号: {}, 支付金额: {}", 
                userId, storeId, orderNo, payAmount);
    }
    
    /**
     * 记录订单支付日志
     */
    public void logOrderPay(Long orderId, String orderNo, String payMethod, String payAmount) {
        log.info("订单支付 - 订单ID: {}, 订单号: {}, 支付方式: {}, 支付金额: {}", 
                orderId, orderNo, payMethod, payAmount);
    }
    
    /**
     * 记录订单支付成功日志
     */
    public void logOrderPaySuccess(Long orderId, String orderNo, String tradeNo, String payAmount) {
        log.info("订单支付成功 - 订单ID: {}, 订单号: {}, 第三方单号: {}, 支付金额: {}", 
                orderId, orderNo, tradeNo, payAmount);
    }
    
    /**
     * 记录订单支付失败日志
     */
    public void logOrderPayFail(Long orderId, String orderNo, String errorCode, String errorMessage) {
        log.warn("订单支付失败 - 订单ID: {}, 订单号: {}, 错误码: {}, 错误信息: {}", 
                orderId, orderNo, errorCode, errorMessage);
    }
    
    /**
     * 记录订单取消日志
     */
    public void logOrderCancel(Long orderId, String orderNo, Long userId, String cancelReason) {
        log.info("订单取消 - 订单ID: {}, 订单号: {}, 用户ID: {}, 取消原因: {}", 
                orderId, orderNo, userId, cancelReason);
    }
    
    /**
     * 记录订单核销日志
     */
    public void logOrderVerify(Long orderId, String orderNo, Long verifierId, String verifyCode) {
        log.info("订单核销 - 订单ID: {}, 订单号: {}, 核销人ID: {}, 核销码: {}", 
                orderId, orderNo, verifierId, verifyCode);
    }
    
    /**
     * 记录退款申请日志
     */
    public void logRefundApply(Long orderId, String orderNo, Long userId, String refundAmount, String refundReason) {
        log.info("退款申请 - 订单ID: {}, 订单号: {}, 用户ID: {}, 退款金额: {}, 退款原因: {}", 
                orderId, orderNo, userId, refundAmount, refundReason);
    }
    
    /**
     * 记录退款审核日志
     */
    public void logRefundAudit(Long orderId, String orderNo, Long auditBy, String auditStatus, String auditRemark) {
        log.info("退款审核 - 订单ID: {}, 订单号: {}, 审核人ID: {}, 审核状态: {}, 审核备注: {}", 
                orderId, orderNo, auditBy, auditStatus, auditRemark);
    }
    
    /**
     * 记录退款成功日志
     */
    public void logRefundSuccess(Long orderId, String orderNo, String refundTradeNo, String refundAmount) {
        log.info("退款成功 - 订单ID: {}, 订单号: {}, 退款单号: {}, 退款金额: {}", 
                orderId, orderNo, refundTradeNo, refundAmount);
    }
    
    /**
     * 记录订单状态变更日志
     */
    public void logOrderStatusChange(Long orderId, String orderNo, String fromStatus, String toStatus, Long operatorId, String operatorType) {
        log.info("订单状态变更 - 订单ID: {}, 订单号: {}, 原状态: {}, 新状态: {}, 操作人ID: {}, 操作人类型: {}", 
                orderId, orderNo, fromStatus, toStatus, operatorId, operatorType);
    }
    
    /**
     * 记录业务异常日志
     */
    public void logBusinessError(String operation, Long orderId, String orderNo, String errorCode, String errorMessage) {
        log.error("业务异常 - 操作: {}, 订单ID: {}, 订单号: {}, 错误码: {}, 错误信息: {}", 
                operation, orderId, orderNo, errorCode, errorMessage);
    }
    
    /**
     * 记录系统异常日志
     */
    public void logSystemError(String operation, Long orderId, String orderNo, Exception e) {
        log.error("系统异常 - 操作: {}, 订单ID: {}, 订单号: {}", operation, orderId, orderNo, e);
    }
    
    /**
     * 记录外部服务调用日志
     */
    public void logExternalServiceCall(String serviceName, String method, String request, String response, long duration) {
        log.info("外部服务调用 - 服务: {}, 方法: {}, 请求: {}, 响应: {}, 耗时: {}ms", 
                serviceName, method, request, response, duration);
    }
    
    /**
     * 记录外部服务调用异常日志
     */
    public void logExternalServiceError(String serviceName, String method, String request, Exception e) {
        log.error("外部服务调用异常 - 服务: {}, 方法: {}, 请求: {}", serviceName, method, request, e);
    }
}