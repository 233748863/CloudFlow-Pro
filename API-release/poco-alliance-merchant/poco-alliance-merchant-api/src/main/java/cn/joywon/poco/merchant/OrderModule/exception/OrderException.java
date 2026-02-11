package cn.joywon.poco.merchant.OrderModule.exception;

/**
 * 订单模块自定义异常
 * 
 * @author AI Assistant
 * @since 2024-01-01
 */
public class OrderException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 异常错误码
     */
    private String errorCode;
    
    /**
     * 异常错误信息
     */
    private String errorMessage;
    
    public OrderException(String errorCode, String errorMessage) {
        super(errorMessage);
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }
    
    public OrderException(String errorCode, String errorMessage, Throwable cause) {
        super(errorMessage, cause);
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }
    
    public String getErrorCode() {
        return errorCode;
    }
    
    public String getErrorMessage() {
        return errorMessage;
    }
}