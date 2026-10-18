package com.cloudflow.auth.im;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLoginAuthorization {
    private final ImLoginChallenges challenges;
    private final ImLoginRedirects redirects;

    public Grant begin(WeComCredentials credentials, ImLoginChallenges.Context context, String browser) {
        if (context == null) throw ImFailure.configuration();
        context.verifyConfiguration(credentials);
        redirects.verify(context);
        String state = challenges.issue(context, browser);
        WeComSdk sdk = new WeComSdk(credentials, new WeComHttp(), () -> { throw ImFailure.unsupported(); },
                rejected -> { throw ImFailure.unsupported(); });
        String url = context.purpose() == ImLoginChallenges.Purpose.EMBEDDED_LOGIN
                ? sdk.getOauth2Service().buildAuthorizationUrl(context.callbackUrl(), state, "snsapi_base")
                : sdk.buildQrConnectUrl(context.callbackUrl(), state);
        return new Grant(url, ImLoginChallenges.TTL_SECONDS);
    }

    public record Grant(String authorizationUrl, int expiresIn) {
        @Override
        public String toString() { return "ImLoginAuthorization.Grant[expiresIn=" + expiresIn + "]"; }
    }
}
