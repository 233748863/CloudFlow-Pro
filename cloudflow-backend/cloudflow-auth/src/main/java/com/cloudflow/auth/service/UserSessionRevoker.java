package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.security.core.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class UserSessionRevoker {

    private final TokenService tokenService;
    private final SysUserMapper sysUserMapper;
    private final UserDataScopeService userDataScopeService;
    private final com.cloudflow.auth.oauth2.OAuthRevocations oauthRevocations;

    public int revokeByUserId(Long userId) {
        if (userId == null) {
            return 0;
        }
        SysUser user = sysUserMapper.selectById(userId);
        if (user != null) {
            oauthRevocations.forUser(user.getTenantId(), userId);
            userDataScopeService.clear(user.getTenantId(), userId);
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
