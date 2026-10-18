package com.cloudflow.common.security.oauth2;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;
import java.io.IOException;

public final class OAuthTransportSerializers {
    private OAuthTransportSerializers() { }

    public static final class Identity extends StdSerializer<OAuthIdentity> {
        public Identity() { super(OAuthIdentity.class); }

        @Override
        public void serialize(OAuthIdentity value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeNumberField("accessId", value.accessId());
            output.writeNumberField("tenantId", value.tenantId());
            output.writeNumberField("clientId", value.clientId());
            output.writeNumberField("userId", value.userId());
            output.writeStringField("tokenHash", value.tokenHash());
            output.writeStringField("grantType", value.grantType());
            output.writeObjectField("scopes", value.scopes());
            output.writeObjectField("deptId", value.deptId());
            output.writeNumberField("dsType", value.dsType());
            output.writeObjectField("deptIds", value.deptIds());
            output.writeObjectField("businessPermissions", value.businessPermissions());
            output.writeNumberField("expiresAt", value.expiresAt());
            output.writeEndObject();
        }
    }

    public static final class Verification extends StdSerializer<OAuthResources.Verification> {
        public Verification() { super(OAuthResources.Verification.class); }

        @Override
        public void serialize(OAuthResources.Verification value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeStringField("tokenHash", value.tokenHash());
            output.writeEndObject();
        }
    }

    public static final class CustomerQuery extends StdSerializer<OAuthResources.CustomerQuery> {
        public CustomerQuery() { super(OAuthResources.CustomerQuery.class); }

        @Override
        public void serialize(OAuthResources.CustomerQuery value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeStringField("tokenHash", value.tokenHash());
            output.writeNumberField("pageNum", value.pageNum());
            output.writeNumberField("pageSize", value.pageSize());
            output.writeStringField("name", value.name());
            output.writeEndObject();
        }
    }

    public static final class CustomerRequest extends StdSerializer<OAuthResources.CustomerRequest> {
        public CustomerRequest() { super(OAuthResources.CustomerRequest.class); }

        @Override
        public void serialize(OAuthResources.CustomerRequest value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeStringField("tokenHash", value.tokenHash());
            output.writeObjectField("customerId", value.customerId());
            output.writeEndObject();
        }
    }

    public static final class InstanceRequest extends StdSerializer<OAuthResources.InstanceRequest> {
        public InstanceRequest() { super(OAuthResources.InstanceRequest.class); }

        @Override
        public void serialize(OAuthResources.InstanceRequest value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeStringField("tokenHash", value.tokenHash());
            output.writeStringField("instanceId", value.instanceId());
            output.writeEndObject();
        }
    }
}
