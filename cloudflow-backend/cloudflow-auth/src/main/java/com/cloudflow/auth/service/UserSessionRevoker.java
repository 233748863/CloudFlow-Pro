package com.cloudflow.auth.service;

import com.cloudflow.common.security.core.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class UserSessionRevoker {

    private final TokenService tokenService;

    public int revokeByUserId(Long userId) {
        if (userId == null) {
            return 0;
        }
        List<String> tokens = tokenService.getTokenValueListByLoginId(userId);
        int revoked = 0;
        for (String token : tokens) {
            tokenService.deleteToken(token);
            revoked++;
        }
        return revoked;
    }
}
