package com.cloudflow.auth.im;

public interface ImIdentityProvider {
    String providerType();

    Member identify(WeComCredentials credentials, String code);

    record Member(long tenantId, long configId, int configVersion, String corpId, String externalUserId) {
        @Override
        public String toString() { return "ImIdentityProvider.Member[tenantId=" + tenantId + ", configId=" + configId + "]"; }
    }
}
