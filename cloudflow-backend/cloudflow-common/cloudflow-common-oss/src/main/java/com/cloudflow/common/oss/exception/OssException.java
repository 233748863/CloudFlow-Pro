package com.cloudflow.common.oss.exception;

/**
 * OSS 对象存储异常
 *
 * @author CloudFlow
 */
public class OssException extends RuntimeException {

    public OssException(String message) {
        super(message);
    }

    public OssException(String message, Throwable cause) {
        super(message, cause);
    }
}
