package com.cloudflow.common.security.oauth2;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class OAuthRequestInterceptor implements HandlerInterceptor {
    private static final String VERIFIED = OAuthRequestInterceptor.class.getName() + ".identity";
    private final OAuthAccessPolicy policy;
    private final OAuthTokens tokens;
    private final ObjectProvider<OAuthIdentityVerifier> verifiers;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!OAuthPaths.offloaded(request.getRequestURI())) return true;
        clear();
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
        OAuthIdentityVerifier verifier = verifiers.getIfAvailable();
        try {
            if (!OAuthPaths.publicEndpoint(request.getMethod(), request.getRequestURI()) && !OAuthPaths.resource(request.getMethod(), request.getRequestURI())) {
                throw new OAuthFailure("invalid_request", "第三方授权接口不存在", 404);
            }
            policy.transport(request.isSecure(), request.getRemoteAddr(), request.getHeader("X-Forwarded-Proto"));
            if (OAuthPaths.publicEndpoint(request.getMethod(), request.getRequestURI())) return true;
            List<String> headers = Collections.list(request.getHeaders("Authorization"));
            if (headers.size() != 1 || !headers.get(0).startsWith("Bearer ")) throw OAuthFailure.unauthenticated();
            String raw = headers.get(0).substring(7);
            if (!OAuthDigests.token(raw) || verifier == null) throw OAuthFailure.unauthenticated();
            OAuthIdentity identity = verifier.verifyHash(OAuthDigests.hash(raw));
            OAuthContext.setVerified(identity);
            OAuthContext.requireScope(OAuthPaths.scope(request.getRequestURI()));
            tokens.bind(identity);
            UserContext.setTenantId(identity.tenantId());
            UserContext.setUserId(identity.userId());
            UserContext.setUserName("oauth2:" + identity.userId());
            UserContext.setDeptId(identity.deptId());
            UserContext.setRoles(Set.of());
            UserContext.setPermissions(identity.businessPermissions());
            UserContext.setDsType(identity.dsType());
            UserContext.setDsDeptIds(identity.deptIds());
            UserContext.setAuthToken(raw);
            TenantContext.setTenantId(identity.tenantId());
            request.setAttribute(VERIFIED, identity);
            return true;
        } catch (RuntimeException failure) {
            try {
                if (verifier != null) verifier.recordAccess(null, failure instanceof OAuthFailure oauth ? oauth.getCode() : 503);
            } finally { clear(); }
            throw failure;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception failure) {
        if (!OAuthPaths.offloaded(request.getRequestURI())) return;
        try {
            OAuthIdentity identity = (OAuthIdentity) request.getAttribute(VERIFIED);
            OAuthIdentityVerifier verifier = verifiers.getIfAvailable();
            if (identity != null && verifier != null) verifier.recordAccess(identity, response.getStatus());
        } finally { clear(); }
    }

    private static void clear() {
        OAuthContext.clear();
        UserContext.clear();
        TenantContext.clear();
    }
}

