package com.cloudflow.crm.service.email;

import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailPolicyMapper;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmEmailPolicyService {
    private final CrmEmailPolicyMapper mapper;

    public record Policy(boolean sendingEnabled, boolean trackingEnabled, String publicOrigin,
            Set<String> allowedHosts, int confirmationThreshold, String reason) {
        public Policy { allowedHosts = Set.copyOf(allowedHosts); }

        public void requireSending() {
            if (!sendingEnabled) throw new CrmBusinessException("MAIL_DISABLED: " + reason);
        }

        public String destination(String value) { return CrmEmailSecurity.destination(value, allowedHosts); }
    }

    public Policy get(Long tenantId) {
        if (tenantId == null || tenantId <= 0) throw new CrmBusinessException("邮件配置缺少租户身份");
        Map<String, String> settings = new LinkedHashMap<>();
        for (Map<String, String> row : mapper.configuration(tenantId)) {
            if (row.get("configKey") == null || row.get("configValue") == null) throw new CrmBusinessException("邮件配置无效");
            if (settings.putIfAbsent(row.get("configKey"), row.get("configValue")) != null) throw new CrmBusinessException("邮件配置重复");
        }
        return parse(settings);
    }

    public static Policy parse(Map<String, String> settings) {
        boolean sending = enabled(settings, "crm.email.sendingEnabled");
        boolean tracking = enabled(settings, "crm.email.trackingEnabled");
        int threshold = 5000;
        try {
            String configured = settings.get("crm.email.confirmationThreshold");
            if (configured != null && !configured.isBlank()) {
                threshold = Integer.parseInt(configured.trim());
                if (threshold < 1) throw new IllegalArgumentException();
            }
            String configuredOrigin = settings.get("crm.email.publicOrigin");
            String origin = configuredOrigin == null || configuredOrigin.isBlank() ? null : CrmEmailSecurity.publicOrigin(configuredOrigin);
            Set<String> hosts = new LinkedHashSet<>();
            String configuredHosts = settings.get("crm.email.allowedHosts");
            if (configuredHosts != null && !configuredHosts.isBlank()) {
                for (String value : configuredHosts.split(",", -1)) hosts.add(CrmEmailSecurity.host(value.trim()));
            }
            String reason = !sending ? "营销邮件未启用，未发送邮件" : origin == null ? "未配置公开退订域名，未发送营销邮件"
                    : hosts.isEmpty() ? "未配置邮件链接允许域名，未发送营销邮件" : null;
            return new Policy(reason == null, tracking && origin != null && !hosts.isEmpty(), origin, hosts, threshold, reason);
        } catch (IllegalArgumentException invalid) {
            return new Policy(false, false, null, Set.of(), 5000, "邮件域名或发送数量配置无效，未发送邮件");
        }
    }

    private static boolean enabled(Map<String, String> settings, String key) {
        return "true".equalsIgnoreCase(settings.getOrDefault(key, "false").trim());
    }
}
