package cn.joywon.poco.merchant.OrderModule.exception;

/**
 * 订单模块错误码常量
 * 
 * @author AI Assistant
 * @since 2024-01-01
 */
public class OrderErrorCode {
    
    // 订单创建相关错误码
    public static final String STORE_NOT_FOUND = "40001";
    public static final String COUPON_NOT_AVAILABLE = "40002";
    public static final String ORDER_STATUS_INVALID = "40003";
    public static final String PAYMENT_CHANNEL_ERROR = "40004";
    public static final String ORDER_NOT_CANCELABLE = "40005";
    public static final String ORDER_ALREADY_VERIFIED = "40006";
    public static final String VERIFICATION_CODE_ERROR = "40007";
    public static final String ORDER_NOT_REFUNDABLE = "40008";
    public static final String DUPLICATE_AUDIT = "40009";
    public static final String ORDER_AMOUNT_MISMATCH = "40010";
    public static final String PAYMENT_AMOUNT_MISMATCH = "40011";
    public static final String ORDER_EXPIRED = "40012";
    public static final String ORDER_VERIFY_STATUS_INVALID = "40013";
    
    // 订单查询相关错误码
    public static final String ORDER_NOT_FOUND = "40401";
    public static final String ORDER_ITEM_NOT_FOUND = "40402";
    public static final String REFUND_APPLY_NOT_FOUND = "40403";
    
    // 系统相关错误码
    public static final String SYSTEM_ERROR = "50000";
    public static final String DATABASE_ERROR = "50001";
    public static final String EXTERNAL_SERVICE_ERROR = "50002";
    public static final String PAYMENT_SERVICE_ERROR = "50003";
    
    // 错误信息映射
    public static String getErrorMessage(String errorCode) {
        switch (errorCode) {
            case STORE_NOT_FOUND:
                return "门店不存在或已关闭";
            case COUPON_NOT_AVAILABLE:
                return "优惠券不可用";
            case ORDER_STATUS_INVALID:
                return "订单状态异常";
            case PAYMENT_CHANNEL_ERROR:
                return "支付通道异常";
            case ORDER_NOT_CANCELABLE:
                return "订单不可取消";
            case ORDER_ALREADY_VERIFIED:
                return "订单已核销";
            case VERIFICATION_CODE_ERROR:
                return "核销码错误";
            case ORDER_NOT_REFUNDABLE:
                return "订单不可退款";
            case DUPLICATE_AUDIT:
                return "重复审核";
            case ORDER_AMOUNT_MISMATCH:
                return "订单金额与优惠后金额不符";
            case PAYMENT_AMOUNT_MISMATCH:
                return "支付金额不匹配";
            case ORDER_EXPIRED:
                return "订单已过期";
            case ORDER_VERIFY_STATUS_INVALID:
                return "订单状态异常，无法核销";
            case ORDER_NOT_FOUND:
                return "订单不存在";
            case ORDER_ITEM_NOT_FOUND:
                return "订单商品不存在";
            case REFUND_APPLY_NOT_FOUND:
                return "退款申请不存在";
            case SYSTEM_ERROR:
                return "系统内部错误";
            case DATABASE_ERROR:
                return "数据库操作异常";
            case EXTERNAL_SERVICE_ERROR:
                return "外部服务调用异常";
            case PAYMENT_SERVICE_ERROR:
                return "支付服务异常";
            default:
                return "未知错误";
        }
    }
}