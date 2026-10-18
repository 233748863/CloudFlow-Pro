package com.cloudflow.common.datasource.runtime;

import com.cloudflow.common.core.exception.ServiceException;

public class DataSourceFailure extends ServiceException {
    private final String errorCode;

    public DataSourceFailure(String errorCode, String message, int status) {
        super(message, status);
        this.errorCode = errorCode;
    }

    public String getErrorCode() { return errorCode; }

    public static DataSourceFailure disabled() {
        return new DataSourceFailure("FEATURE_DISABLED", "动态数据源尚未完成部署配置，功能已停用", 503);
    }

    public static DataSourceFailure conflict() {
        return new DataSourceFailure("VERSION_CONFLICT", "数据源配置已变更，请刷新后重试", 409);
    }
}
