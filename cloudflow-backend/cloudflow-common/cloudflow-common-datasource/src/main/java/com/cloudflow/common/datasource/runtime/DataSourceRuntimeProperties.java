package com.cloudflow.common.datasource.runtime;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "cloudflow.datasource.runtime")
public class DataSourceRuntimeProperties {
    private boolean enabled;
    private Long managementTenantId;
    private String secretKey = "";
    private String controlKey = "";
    private String instanceHost = "";
    private Set<String> allowedAuthAddresses = new LinkedHashSet<>();
    private Set<String> allowedServices = new LinkedHashSet<>();
    private List<Target> targets = new ArrayList<>();

    public boolean configured() {
        return enabled && managementTenantId != null && managementTenantId > 0
                && controlKey != null && controlKey.trim().length() >= 32
                && secretKey != null && secretKey.trim().length() >= 32
                && !secretKey.trim().equals(controlKey.trim())
                && allowedAuthAddresses != null && !allowedAuthAddresses.isEmpty()
                && allowedServices != null && !allowedServices.isEmpty()
                && targets != null && !targets.isEmpty();
    }

    @Getter
    @Setter
    public static class Target {
        private String host;
        private Integer port;
        private String database;
        private Set<String> addresses = new LinkedHashSet<>();
        private Set<String> usernames = new LinkedHashSet<>();
    }
}
