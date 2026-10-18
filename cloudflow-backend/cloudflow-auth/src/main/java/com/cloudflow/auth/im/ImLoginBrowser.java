package com.cloudflow.auth.im;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public final class ImLoginBrowser {
    private static final String COOKIE_NAME = "__Host-CloudFlowIM";

    private ImLoginBrowser() { }

    public static String begin(HttpServletRequest request, HttpServletResponse response) {
        if (request == null || response == null) throw ImFailure.loginChallenge();
        String browser = read(request);
        if (browser == null) browser = ImLoginChallenges.randomToken();
        ImLoginChallenges.requireToken(browser);
        Cookie cookie = new Cookie(COOKIE_NAME, browser);
        cookie.setSecure(true);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(ImLoginChallenges.TTL_SECONDS);
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
        return browser;
    }

    public static String require(HttpServletRequest request) {
        String browser = read(request);
        ImLoginChallenges.requireToken(browser);
        return browser;
    }

    private static String read(HttpServletRequest request) {
        if (request == null) throw ImFailure.loginChallenge();
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        String browser = null;
        boolean found = false;
        for (Cookie cookie : cookies) {
            if (!COOKIE_NAME.equals(cookie.getName())) continue;
            if (found) throw ImFailure.loginChallenge();
            found = true;
            browser = cookie.getValue();
            ImLoginChallenges.requireToken(browser);
        }
        return browser;
    }
}
