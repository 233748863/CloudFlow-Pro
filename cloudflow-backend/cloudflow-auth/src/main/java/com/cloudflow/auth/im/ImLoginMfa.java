package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.auth.service.TotpService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLoginMfa {
    private final ImLoginAccounts accounts;
    private final ImLoginMfaChallenges challenges;
    private final TotpService totp;
    private final LoginLockService locks;
    private final ILoginLogService logs;

    public boolean required(ImLoginAccounts.Account account) {
        SysUser user = accounts.recheck(account);
        return totp.requiresLoginVerification(user.getUserId(), user.getTenantId());
    }

    public String issue(ImLoginMfaChallenges.Proof proof, String browser) {
        if (proof == null || !required(proof.account())) throw ImFailure.loginChallenge();
        return challenges.issue(proof, browser);
    }

    public ImLoginMfaChallenges.Proof verify(String token, String browser, String code, HttpServletRequest request) {
        ImLoginMfaChallenges.Proof proof = challenges.consume(token, browser);
        return verify(proof, code, request);
    }

    ImLoginMfaChallenges.Proof verify(ImLoginMfaChallenges.Proof proof, String code, HttpServletRequest request) {
        if (proof == null) throw ImFailure.loginChallenge();
        SysUser user = accounts.recheck(proof.account());
        if (!totp.verifyLoginCode(user.getUserId(), user.getTenantId(), code)) {
            locks.recordFailure(user.getUserName(), user.getTenantId());
            logs.recordLoginFailure(user.getUserName(), user.getTenantId(), request,
                    "企业微信登录动态验证码错误", Math.max(0, System.currentTimeMillis() - proof.startedAt()));
            throw ImFailure.loginMfa();
        }
        accounts.recheck(proof.account());
        return proof;
    }
}
