package com.cloudflow.auth.im;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public final class ImBindingMemberCookie {
    private static final String NAME = "__Host-CloudFlowIMBinding";

    private ImBindingMemberCookie() { }

    public static void set(HttpServletResponse response, String token) {
        ImLoginChallenges.requireToken(token);
        write(response, token, ImBindingProofs.TTL_SECONDS);
    }

    public static String read(HttpServletRequest request) {
        String token = null;
        if (request.getCookies() != null) for (Cookie cookie : request.getCookies()) {
            if (!NAME.equals(cookie.getName())) continue;
            if (token != null) throw ImFailure.bindingRequest();
            ImLoginChallenges.requireToken(cookie.getValue());
            token = cookie.getValue();
        }
        return token;
    }

    public static String require(HttpServletRequest request) {
        String token = read(request);
        if (token == null) throw ImFailure.bindingVerification();
        return token;
    }

    public static void clear(HttpServletResponse response) { write(response, "", 0); }

    private static void write(HttpServletResponse response, String token, int seconds) {
        Cookie cookie = new Cookie(NAME, token);
        cookie.setHttpOnly(true); cookie.setSecure(true); cookie.setPath("/"); cookie.setMaxAge(seconds);
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);
    }
}
