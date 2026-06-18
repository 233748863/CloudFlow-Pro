package com.cloudflow.common.security.cookie;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Authentication cookie helpers shared by MVC services.
 */
public final class AuthCookieSupport {

    public static final String AUTH_COOKIE_NAME = "Authorization";
    public static final String CSRF_COOKIE_NAME = "XSRF-TOKEN";
    public static final String CSRF_HEADER_NAME = "X-CSRF-Token";
    public static final String SAME_SITE = "Lax";

    private static final String BEARER_PREFIX = "Bearer ";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private AuthCookieSupport() {
    }

    public static String resolveRawToken(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        String token = request.getHeader(AUTH_COOKIE_NAME);
        if (!StringUtils.hasText(token)) {
            token = request.getParameter(AUTH_COOKIE_NAME);
        }
        if (!StringUtils.hasText(token)) {
            token = request.getParameter("token");
        }
        if (!StringUtils.hasText(token)) {
            token = resolveCookieValue(request, AUTH_COOKIE_NAME);
        }
        return unwrapBearerToken(token);
    }

    public static String resolveCookieToken(HttpServletRequest request) {
        return resolveCookieValue(request, AUTH_COOKIE_NAME);
    }

    public static String resolveCsrfCookie(HttpServletRequest request) {
        return resolveCookieValue(request, CSRF_COOKIE_NAME);
    }

    public static String unwrapBearerToken(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        return token.startsWith(BEARER_PREFIX) ? token.substring(BEARER_PREFIX.length()) : token;
    }

    public static void addAuthCookies(HttpServletRequest request,
                                      HttpServletResponse response,
                                      String token,
                                      long maxAgeSeconds) {
        if (!StringUtils.hasText(token) || response == null) {
            return;
        }
        String rawToken = unwrapBearerToken(token);
        int maxAge = toCookieMaxAge(maxAgeSeconds);
        addCookie(response, AUTH_COOKIE_NAME, rawToken, true, isSecureRequest(request), maxAge);

        String csrfToken = resolveCsrfCookie(request);
        if (!StringUtils.hasText(csrfToken)) {
            csrfToken = newCsrfToken();
        }
        addCookie(response, CSRF_COOKIE_NAME, csrfToken, false, isSecureRequest(request), maxAge);
    }

    public static void clearAuthCookies(HttpServletRequest request, HttpServletResponse response) {
        if (response == null) {
            return;
        }
        boolean secure = isSecureRequest(request);
        addCookie(response, AUTH_COOKIE_NAME, "", true, secure, 0);
        addCookie(response, CSRF_COOKIE_NAME, "", false, secure, 0);
    }

    public static boolean isSecureRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        if (request.isSecure()) {
            return true;
        }
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        if (StringUtils.hasText(forwardedProto) && "https".equalsIgnoreCase(forwardedProto)) {
            return true;
        }
        String forwardedSsl = request.getHeader("X-Forwarded-Ssl");
        return StringUtils.hasText(forwardedSsl) && "on".equalsIgnoreCase(forwardedSsl);
    }

    public static String newCsrfToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String resolveCookieValue(HttpServletRequest request, String cookieName) {
        if (request == null || !StringUtils.hasText(cookieName)) {
            return null;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName()) && StringUtils.hasText(cookie.getValue())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private static void addCookie(HttpServletResponse response,
                                  String name,
                                  String value,
                                  boolean httpOnly,
                                  boolean secure,
                                  int maxAge) {
        Cookie cookie = new Cookie(name, value);
        cookie.setHttpOnly(httpOnly);
        cookie.setSecure(secure);
        cookie.setPath("/");
        cookie.setAttribute("SameSite", SAME_SITE);
        cookie.setMaxAge(maxAge);
        response.addCookie(cookie);
    }

    private static int toCookieMaxAge(long maxAgeSeconds) {
        if (maxAgeSeconds <= 0) {
            return 0;
        }
        return maxAgeSeconds > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) maxAgeSeconds;
    }
}
