package com.cloudflow.hr.exception;

/**
 * 假期额度不足异常
 */
public class InsufficientQuotaException extends RuntimeException {
    
    public InsufficientQuotaException(String message) {
        super(message);
    }
    
    public InsufficientQuotaException(String message, Throwable cause) {
        super(message, cause);
    }
}
