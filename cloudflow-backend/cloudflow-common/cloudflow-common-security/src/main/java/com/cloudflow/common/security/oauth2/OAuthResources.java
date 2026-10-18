package com.cloudflow.common.security.oauth2;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.time.LocalDateTime;
import java.util.Map;

public final class OAuthResources {
    private OAuthResources() { }

    @JsonSerialize(using = OAuthTransportSerializers.Verification.class)
    public record Verification(String tokenHash) {
        @Override public String toString() { return "OAuthVerification[REDACTED]"; }
    }
    @JsonSerialize(using = OAuthTransportSerializers.CustomerQuery.class)
    public record CustomerQuery(String tokenHash, int pageNum, int pageSize, String name) {
        @Override public String toString() { return "OAuthCustomerQuery[REDACTED]"; }
    }
    @JsonSerialize(using = OAuthTransportSerializers.CustomerRequest.class)
    public record CustomerRequest(String tokenHash, Long customerId) {
        @Override public String toString() { return "OAuthCustomerRequest[REDACTED]"; }
    }
    @JsonSerialize(using = OAuthTransportSerializers.InstanceRequest.class)
    public record InstanceRequest(String tokenHash, String instanceId) {
        @Override public String toString() { return "OAuthInstanceRequest[REDACTED]"; }
    }
    public record Customer(Long customerId, String customerCode, String customerName, String customerType, String industry, String status) { }
    public record Instance(String instanceId, String processNo, String title, String status, LocalDateTime startTime,
            LocalDateTime endTime, String formState, Map<String, Object> formFields) {
        public Instance { formFields = java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(formFields)); }
    }
}
