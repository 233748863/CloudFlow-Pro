package com.cloudflow.auth.service;

import com.cloudflow.common.security.core.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@Component
@RequiredArgsConstructor
public class UserSessionRevoker {

    private final TokenService tokenService;

    public int revokeByUserId(Long userId) {
        if (userId == null) {
            return 0;
        }
        List<String> tokens = tokenService.searchTokenValue("", 0, -1, false);
        int revoked = 0;
        for (String token : tokens) {
            Map<String, Object> loginUser = tokenService.getLoginUserByToken(token);
            if (loginUser == null) {
                continue;
            }
            Object loginUserId = loginUser.get("userId");
            if (Objects.equals(userId, toLong(loginUserId))) {
                tokenService.deleteToken(token);
                revoked++;
            }
        }
        return revoked;
    }

    private Long toLong(Object value) {
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
