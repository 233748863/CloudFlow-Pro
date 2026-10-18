package com.cloudflow.common.datasource.runtime;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.cloud.client.serviceregistry.Registration;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class DataSourceInstanceIdentity {
    private final DataSourceRuntimeProperties properties;
    private final ObjectProvider<Registration> registrations;
    private final String service;
    private final String serverAddress;
    private final boolean secure;
    private volatile int port;

    public DataSourceInstanceIdentity(DataSourceRuntimeProperties properties, ObjectProvider<Registration> registrations,
            @Value("${spring.application.name}") String service, @Value("${server.address:}") String serverAddress,
            @Value("${server.ssl.enabled:false}") boolean secure) {
        this.properties = properties;
        this.registrations = registrations;
        this.service = service;
        this.serverAddress = serverAddress;
        this.secure = secure;
    }

    @EventListener
    public void serverReady(WebServerInitializedEvent event) {
        if (event.getApplicationContext().getServerNamespace() == null) port = event.getWebServer().getPort();
    }

    public String service() { return service; }

    public String key() {
        String configuredHost = properties.getInstanceHost();
        if (configuredHost != null && !configuredHost.isBlank()) {
            return keyForHost(configuredHost.trim());
        }
        Registration registration = registrations.getIfAvailable();
        if (registration != null && registration.getPort() > 0) {
            return DataSourceControlSignature.instanceKey(service, registration.getHost(), registration.getPort(), registration.isSecure());
        }
        return keyForHost(serverAddress);
    }

    private String keyForHost(String host) {
        if ("0.0.0.0".equals(host) || "::".equals(host)) throw new DataSourceFailure("INSTANCE_UNAVAILABLE", "请配置数据源实例的可发现地址", 503);
        return DataSourceControlSignature.instanceKey(service, host, port, secure);
    }
}
