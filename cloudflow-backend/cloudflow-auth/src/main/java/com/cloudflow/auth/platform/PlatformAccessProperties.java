package com.cloudflow.auth.platform;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.LinkedHashSet;
import java.util.Set;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Data
@Component
@Validated
@ConfigurationProperties(prefix = "cloudflow.platform.access")
public class PlatformAccessProperties {
    @Positive
    private Long managementTenantId;

    @NotNull
    private Set<@NotNull @Positive Long> administratorUserIds = new LinkedHashSet<>();

    public boolean configured() {
        return managementTenantId != null && managementTenantId > 0
                && administratorUserIds != null && !administratorUserIds.isEmpty()
                && administratorUserIds.stream().allMatch(userId -> userId != null && userId > 0);
    }

    public boolean permits(Long userId, Long tenantId) {
        return configured() && managementTenantId.equals(tenantId) && administratorUserIds.contains(userId);
    }
}
