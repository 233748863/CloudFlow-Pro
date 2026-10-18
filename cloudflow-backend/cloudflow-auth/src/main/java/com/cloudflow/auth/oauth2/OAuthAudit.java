package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.platform.PlatformAccessProperties;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OAuthAudit {
    private final SysAuditLogMapper mapper;
    private final PlatformAccessProperties platform;
    private final OAuthDatabase database;

    public void append(Long tenantId, Long userId, String event, String before, String after, boolean highRisk) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(tenantId != null ? tenantId : platform.getManagementTenantId());
        if (entry.getTenantId() == null) throw new OAuthFailure("temporarily_unavailable", "第三方授权审计归属尚未配置", 503);
        entry.setBizModule("auth");
        entry.setAuditName("OAUTH2_" + event);
        entry.setAuditField("oauth2_state");
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(highRisk ? 1 : 0);
        entry.setRiskLevel(highRisk ? "HIGH" : "LOW");
        entry.setCreateBy(userId == null ? "oauth2" : String.valueOf(userId));
        entry.setCreateTime(LocalDateTime.now());
        if (mapper.insert(entry) != 1) throw new OAuthFailure("server_error", "第三方授权审计保存失败", 503);
    }

    public void failure(Long tenantId, Long userId, String event, OAuthFailure failure) {
        database.write(ignored -> { append(tenantId, userId, event, "REQUESTED", failure.getError(), true); return null; });
    }
}

