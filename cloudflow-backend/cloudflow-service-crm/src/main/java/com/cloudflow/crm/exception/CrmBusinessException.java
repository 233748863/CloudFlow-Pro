package com.cloudflow.crm.exception;

public class CrmBusinessException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    public CrmBusinessException(String message) {
        super(message);
    }

    public CrmBusinessException(String message, Throwable cause) {
        super(message, cause);
    }
}
