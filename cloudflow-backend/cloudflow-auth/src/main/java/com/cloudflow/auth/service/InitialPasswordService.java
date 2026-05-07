package com.cloudflow.auth.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 默认密码配置读取服务。
 */
@Service
public class InitialPasswordService {

    public static final String CONFIG_KEY = "sys.user.initPassword";

    private final SysConfigHelper sysConfigHelper;

    public InitialPasswordService(SysConfigHelper sysConfigHelper) {
        this.sysConfigHelper = sysConfigHelper;
    }

    public String requireInitialPassword(Long tenantId) {
        String value = readInitialPassword(tenantId);
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException("系统未配置初始密码");
        }
        return value.trim();
    }

    private String readInitialPassword(Long tenantId) {
        if (tenantId != null) {
            return TenantBroker.applyAs(tenantId, ignored -> sysConfigHelper.getConfigValue(CONFIG_KEY));
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            return sysConfigHelper.getConfigValue(CONFIG_KEY);
        }
        return TenantBroker.applyWithoutTenant(ignored -> sysConfigHelper.getGlobalValue(CONFIG_KEY));
    }
}
