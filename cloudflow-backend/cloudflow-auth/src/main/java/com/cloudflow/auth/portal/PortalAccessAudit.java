package com.cloudflow.auth.portal;

import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalRequestAudit;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalAccessAudit implements PortalRequestAudit {
    private final ApplicationEventPublisher events;

    @Override
    public void record(PortalIdentity identity, String path, String method, String clientIp, int status) {
        SysLogEntity entry = new SysLogEntity();
        entry.setTenantId(identity == null ? 0L : identity.tenantId());
        entry.setCreateBy(identity == null ? "portal:anonymous" : "portal:" + identity.portalUserId());
        entry.setTitle(status >= 400 ? "客户门户访问拒绝" : "客户门户访问");
        entry.setLogType(status >= 400 ? "9" : "0");
        entry.setServiceId("cloudflow-auth");
        entry.setServiceName("cloudflow-auth");
        entry.setRequestUri(path.replaceFirst("^/portal/[^/]+/(login|activate|register|status)$", "/portal/{tenantCode}/$1"));
        entry.setRequestUrl(entry.getRequestUri());
        entry.setMethod(method);
        entry.setRequestMethod(method);
        entry.setRemoteAddr(clientIp);
        entry.setClientIp(clientIp);
        entry.setResultCode(status);
        entry.setTraceId(TraceContext.currentOrCreate());
        entry.setCreateTime(LocalDateTime.now());
        entry.setTime(0L);
        entry.setDurationMs(0L);
        entry.setSlowFlag(0);
        events.publishEvent(new SysLogEvent(entry));
    }
}
