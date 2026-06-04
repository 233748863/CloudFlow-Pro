package com.cloudflow.common.core.exception;

/**
 * 通用错误码常量。
 */
public final class ErrorCodeConstants {

    private ErrorCodeConstants() {
    }

    public static final int BAD_REQUEST = 400;
    public static final int UNAUTHORIZED = 401;
    public static final int FORBIDDEN = 403;
    public static final int NOT_FOUND = 404;
    public static final int CONFLICT = 409;
    public static final int TOO_MANY_REQUESTS = 429;
    public static final int INTERNAL_SERVER_ERROR = 500;

    public static final int REPEAT_SUBMIT = CONFLICT;
    public static final int DISTRIBUTED_LOCK_CONFLICT = CONFLICT;
    public static final int CONCURRENT_MODIFICATION = CONFLICT;
    public static final int ILLEGAL_STATE_TRANSITION = CONFLICT;
    public static final int AUDIT_CONFIGURATION_ERROR = INTERNAL_SERVER_ERROR;
}
