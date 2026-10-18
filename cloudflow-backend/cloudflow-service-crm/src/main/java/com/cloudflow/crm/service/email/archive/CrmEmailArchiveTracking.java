package com.cloudflow.crm.service.email.archive;

import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailRecordMapper;
import com.cloudflow.crm.service.email.CrmEmailPolicyService;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import java.time.Duration;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmEmailArchiveTracking {
    private static final String PREFIX = "crm:email:archive:open:";
    private static final Duration LIFETIME = Duration.ofDays(30);
    private final StringRedisTemplate redis;
    private final CrmEmailPolicyService policies;
    private final CrmEmailRecordMapper records;

    public record Pixel(String token, String origin) {
        @Override public String toString() { return "Pixel[opaque]"; }
    }

    public Pixel issue(CrmEmailRecord record) {
        CrmEmailPolicyService.Policy policy = policies.get(record.getTenantId());
        if (!policy.trackingEnabled()) return null;
        CrmEmailArchiveTracking.Pixel pixel = new Pixel(CrmEmailSecurity.newToken(), policy.publicOrigin());
        bind(record, pixel);
        return pixel;
    }

    public void bind(CrmEmailRecord record, Pixel pixel) {
        CrmEmailPolicyService.Policy policy = policies.get(record.getTenantId());
        if (!policy.trackingEnabled() || !Objects.equals(pixel.origin(), policy.publicOrigin())) throw new CrmBusinessException("邮件打开观察配置已变化");
        String key = PREFIX + CrmEmailSecurity.tokenHash(pixel.token());
        String value = record.getTenantId() + ":" + record.getEmailId();
        Boolean created = redis.opsForValue().setIfAbsent(key, value, LIFETIME);
        if (!Boolean.TRUE.equals(created) && !value.equals(redis.opsForValue().get(key))) throw new CrmBusinessException("邮件打开观察令牌归属无效");
    }

    public void open(String token) {
        String value = redis.opsForValue().get(PREFIX + CrmEmailSecurity.tokenHash(token));
        if (value == null || !value.matches("[1-9][0-9]{0,18}:[1-9][0-9]{0,18}")) return;
        String[] identifiers = value.split(":");
        try {
            Long tenantId = Long.valueOf(identifiers[0]);
            Long emailId = Long.valueOf(identifiers[1]);
            TenantBroker.runAs(tenantId, currentTenant -> {
                if (policies.get(currentTenant).trackingEnabled()) records.observeOpen(currentTenant, emailId);
            });
        } catch (NumberFormatException invalid) { throw new CrmBusinessException("邮件打开观察令牌无效"); }
    }

    public static String html(String content, Pixel pixel) {
        return pixel == null ? content : content + "<img src=\"" + CrmEmailSecurity.escape(CrmEmailSecurity.trackingUrl(pixel.origin(), "open", pixel.token()) + "&kind=ARCHIVE") + "\" alt=\"\">";
    }
}
