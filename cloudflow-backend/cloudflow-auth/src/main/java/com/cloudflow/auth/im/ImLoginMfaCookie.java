package com.cloudflow.auth.im;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public final class ImLoginMfaCookie {
    private static final String NAME = "__Host-CloudFlowIMMfa";
    private ImLoginMfaCookie() { }

    public static void set(HttpServletResponse response, String challenge) {
        ImLoginChallenges.requireToken(challenge);
        write(response, challenge, ImLoginChallenges.TTL_SECONDS);
    }

    public static String require(HttpServletRequest request) {
        String challenge = null;
        if (request.getCookies() != null) for (Cookie cookie : request.getCookies()) {
            if (!NAME.equals(cookie.getName())) continue;
            if (challenge != null) throw ImFailure.loginChallenge();
            ImLoginChallenges.requireToken(cookie.getValue());
            challenge = cookie.getValue();
        }
        ImLoginChallenges.requireToken(challenge);
        return challenge;
    }

    public static void clear(HttpServletResponse response) { write(response, "", 0); }

    private static void write(HttpServletResponse response, String value, int seconds) {
        Cookie cookie = new Cookie(NAME, value);
        cookie.setHttpOnly(true); cookie.setSecure(true); cookie.setPath("/"); cookie.setMaxAge(seconds);
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);
    }
}
