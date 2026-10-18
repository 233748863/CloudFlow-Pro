package com.cloudflow.auth.tenantpackage;

import com.cloudflow.common.core.exception.ServiceException;

public final class TenantPackageFailure extends ServiceException {
    private final String reason;

    public TenantPackageFailure(String reason, String message, int status) {
        super(message, status);
        this.reason = reason;
    }

    public String reason() { return reason; }

    public static TenantPackageFailure invalid() { return new TenantPackageFailure("INVALID_PACKAGE", "套餐参数或已保存配置不合法", 400); }
    public static TenantPackageFailure conflict() { return new TenantPackageFailure("VERSION_CONFLICT", "套餐或租户已发生变更，请重新预览", 409); }
}
