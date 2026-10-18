package com.cloudflow.auth.im;

import org.springframework.stereotype.Component;

@Component
public class ImConnectionProbe {
    private final WeComHttp http;

    public ImConnectionProbe() { this(new WeComHttp()); }

    ImConnectionProbe(WeComHttp http) { this.http = http; }

    public void test(WeComCredentials credentials) { WeComSdk.fetchToken(credentials, http); }
}
