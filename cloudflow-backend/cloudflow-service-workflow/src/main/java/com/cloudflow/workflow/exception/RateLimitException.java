package com.cloudflow.workflow.exception;

/**
 * 限流异常
 */
public class RateLimitException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    
    public RateLimitException(String message) {
        super(message);
    }
    
    public RateLimitException(String message, Throwable cause) {
        super(message, cause);
    }
}
