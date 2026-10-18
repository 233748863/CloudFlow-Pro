package com.cloudflow.common.security.portal;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class PortalRequestInterceptor implements HandlerInterceptor {
    private static final String VERIFIED = PortalRequestInterceptor.class.getName() + ".identity";
    private final PortalAccessPolicy access;
    private final PortalTokens tokens;
    private final PortalRateLimits limits;
    private final ObjectProvider<PortalIdentityVerifier> verifiers;
    private final ObjectProvider<PortalRequestAudit> audits;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!PortalPaths.portal(request.getRequestURI())) return true;
        clear();
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Referrer-Policy", "no-referrer");
        try {
            if (!PortalPaths.supported(request.getMethod(), request.getRequestURI())) {
                throw new ServiceException("客户门户接口不存在", 404);
            }
            access.checkTransport(request.isSecure(), request.getRemoteAddr(), request.getHeader("X-Forwarded-Proto"),
                    request.getHeader("Origin"));
            if (PortalPaths.publicEndpoint(request.getMethod(), request.getRequestURI())) {
                limits.publicIp(PortalPaths.publicGroup(request.getRequestURI()), clientIp(request));
                return true;
            }
            if (Collections.list(request.getHeaders(PortalTokens.HEADER)).size() != 1) throw unauthenticated();
            String token = request.getHeader(PortalTokens.HEADER);
            PortalIdentity snapshot = tokens.verify(token);
            PortalIdentityVerifier verifier = verifiers.getIfAvailable();
            if (snapshot == null || verifier == null) throw unauthenticated();
            PortalIdentity identity = verifier.verifyCurrent(snapshot);
            if (identity == null) throw unauthenticated();
            limits.user(identity);
            if (PortalPaths.fileEndpoint(request.getMethod(), request.getRequestURI())) limits.file(identity);
            PortalContext.setVerified(identity);
            UserContext.setTenantId(identity.tenantId());
            UserContext.setUserName("portal:" + identity.portalUserId());
            TenantContext.setTenantId(identity.tenantId());
            request.setAttribute(VERIFIED, identity);
            tokens.touch(token);
            return true;
        } catch (RuntimeException failure) {
            try {
                record(request, failure instanceof ServiceException service && service.getCode() != null ? service.getCode() : 503);
            } finally {
                clear();
            }
            throw failure;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception failure) {
        if (!PortalPaths.portal(request.getRequestURI())) return;
        try {
            record(request, response.getStatus());
        } finally {
            clear();
        }
    }

    private void record(HttpServletRequest request, int status) {
        PortalRequestAudit audit = audits.getIfAvailable();
        if (audit != null) audit.record((PortalIdentity) request.getAttribute(VERIFIED), request.getRequestURI(),
                request.getMethod(), clientIp(request), status);
    }

    private static String clientIp(HttpServletRequest request) {
        return PortalClientAddress.resolve(request.getRemoteAddr(), request.getHeader("X-Forwarded-For"));
    }

    private static ServiceException unauthenticated() {
        return new ServiceException("门户登录状态已失效，请重新登录", 401);
    }

    private static void clear() {
        PortalContext.clear();
        UserContext.clear();
        TenantContext.clear();
    }
}
