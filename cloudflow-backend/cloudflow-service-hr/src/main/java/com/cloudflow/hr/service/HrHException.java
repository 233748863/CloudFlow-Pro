package com.cloudflow.hr.service;

import lombok.Getter;

@Getter
public final class HrHException extends RuntimeException {
    private final String code;
    private final int status;

    public HrHException(String code, String message, int status) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public static HrHException conflict(String code, String message) { return new HrHException(code, message, 409); }
    public static HrHException invalid(String message) { return new HrHException("INVALID_PARAMETER", message, 400); }
    public static HrHException forbidden() { return new HrHException("FORBIDDEN", "无权操作该员工的申请", 403); }
    public static HrHException unavailable() { return new HrHException("DEPENDENCY_UNAVAILABLE", "依赖服务暂不可用，请稍后重试", 503); }
}
