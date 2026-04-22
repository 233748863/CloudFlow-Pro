package com.cloudflow.auth.domain.dto;

import java.io.Serializable;

/**
 * 租户统计结果。
 */
public class TenantStatisticsDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private boolean expired;
    private boolean disabled;
    private boolean userLimitReached;
    private long userCount;

    public TenantStatisticsDTO() {
    }

    public TenantStatisticsDTO(Long tenantId, boolean expired, boolean disabled, boolean userLimitReached, long userCount) {
        this.tenantId = tenantId;
        this.expired = expired;
        this.disabled = disabled;
        this.userLimitReached = userLimitReached;
        this.userCount = userCount;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public boolean isExpired() {
        return expired;
    }

    public void setExpired(boolean expired) {
        this.expired = expired;
    }

    public boolean isDisabled() {
        return disabled;
    }

    public void setDisabled(boolean disabled) {
        this.disabled = disabled;
    }

    public boolean isUserLimitReached() {
        return userLimitReached;
    }

    public void setUserLimitReached(boolean userLimitReached) {
        this.userLimitReached = userLimitReached;
    }

    public long getUserCount() {
        return userCount;
    }

    public void setUserCount(long userCount) {
        this.userCount = userCount;
    }
}
