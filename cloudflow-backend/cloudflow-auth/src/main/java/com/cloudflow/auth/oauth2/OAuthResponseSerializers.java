package com.cloudflow.auth.oauth2;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;
import java.io.IOException;

public final class OAuthResponseSerializers {
    private OAuthResponseSerializers() { }

    public static final class Created extends StdSerializer<OAuthViews.Created> {
        public Created() { super(OAuthViews.Created.class); }

        @Override
        public void serialize(OAuthViews.Created value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeObjectField("client", value.client());
            output.writeStringField("clientSecret", value.clientSecret());
            output.writeEndObject();
        }
    }

    public static final class Token extends StdSerializer<OAuthProtocolService.TokenResponse> {
        public Token() { super(OAuthProtocolService.TokenResponse.class); }

        @Override
        public void serialize(OAuthProtocolService.TokenResponse value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeStringField("access_token", value.accessToken());
            output.writeStringField("token_type", value.tokenType());
            output.writeNumberField("expires_in", value.expiresIn());
            if (value.refreshToken() != null) output.writeStringField("refresh_token", value.refreshToken());
            output.writeStringField("scope", value.scope());
            output.writeEndObject();
        }
    }

    public static final class Authorization extends StdSerializer<OAuthAuthorizationService.AuthorizationView> {
        public Authorization() { super(OAuthAuthorizationService.AuthorizationView.class); }

        @Override
        public void serialize(OAuthAuthorizationService.AuthorizationView value, JsonGenerator output, SerializerProvider provider) throws IOException {
            output.writeStartObject();
            output.writeStringField("clientName", value.clientName());
            output.writeStringField("description", value.description());
            output.writeObjectField("scopes", value.scopes());
            output.writeStringField("requestToken", value.requestToken());
            output.writeObjectField("expiresTime", value.expiresTime());
            output.writeStringField("redirectUrl", value.redirectUrl());
            output.writeBooleanField("automatic", value.automatic());
            output.writeEndObject();
        }
    }
}
