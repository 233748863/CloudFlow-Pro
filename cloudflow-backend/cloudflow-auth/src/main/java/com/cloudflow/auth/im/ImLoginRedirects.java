package com.cloudflow.auth.im;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLoginRedirects {
    public static final String BINDING_PATH = "/workspace/im-bindings";
    private final ImProperties properties;

    public String callbackUrl() {
        return origin() + "/api/auth/im/WECOM/callback";
    }

    public String bindingCallbackUrl() { return origin() + "/api/auth/im/WECOM/binding-callback"; }

    public String bindingDestination() { return origin() + BINDING_PATH; }

    public String bindingPage(boolean ready) {
        String origin = ImConfigRules.origin(properties.getPublicUrl());
        if (origin == null) throw ImFailure.configuration();
        return origin + BINDING_PATH + "?imBinding=" + (ready ? "ready" : "error");
    }

    public void verify(ImLoginChallenges.Context context) {
        if (context == null) throw ImFailure.loginChallenge();
        if (context.purpose() == ImLoginChallenges.Purpose.BIND) {
            if (!bindingCallbackUrl().equals(context.callbackUrl()) || !BINDING_PATH.equals(context.redirectPath())) {
                throw ImFailure.loginChallenge();
            }
        } else verify(context.callbackUrl(), context.redirectPath());
    }

    public String defaultPath() {
        List<String> paths = properties.getLoginRedirectPaths();
        if (paths == null || paths.isEmpty()) throw ImFailure.configuration();
        String path = paths.get(0);
        destination(path);
        if (List.of("/login", "/register").contains(path)) throw ImFailure.configuration();
        return path;
    }

    public String loginPage(boolean requiresTotp) {
        String origin = ImConfigRules.origin(properties.getPublicUrl());
        if (origin == null) throw ImFailure.configuration();
        return origin + (requiresTotp ? "/login?im=totp" : "/login?im=error");
    }

    public String destination(String path) {
        String origin = origin();
        List<String> allowed = properties.getLoginRedirectPaths();
        if (allowed == null || allowed.isEmpty() || allowed.size() > 32
                || allowed.stream().anyMatch(candidate -> !validPath(candidate))
                || !validPath(path) || !allowed.contains(path)) throw ImFailure.configuration();
        return origin + path;
    }

    public void verify(String callbackUrl, String redirectPath) {
        if (!callbackUrl().equals(callbackUrl)) throw ImFailure.loginChallenge();
        destination(redirectPath);
    }

    private String origin() {
        if (!properties.isEnabled()) throw ImFailure.disabled();
        String origin = ImConfigRules.origin(properties.getPublicUrl());
        if (origin == null) throw ImFailure.configuration();
        return origin;
    }

    private static boolean validPath(String path) {
        return path != null && path.length() <= 256 && path.matches("/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]*");
    }
}
