package com.cloudflow.auth.im;

import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.auth.oauth2.OAuthAccessToken;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.oauth2.OAuthTokens;
import com.cloudflow.common.tenant.TenantContext;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
@RequiredArgsConstructor
public class ImSecurityEffects {
    private final OAuthMapper oauth;
    private final OAuthTokens oauthTokens;
    private final UserDataScopeStore scopes;
    private final RedisCache redis;
    private final CacheManager caches;
    private final HolidayCalendarService calendars;

    void user(long tenantId, long userId) {
        users(tenantId, List.of(userId));
    }

    void users(long tenantId, List<Long> userIds) {
        requireScope(tenantId);
        if (userIds == null || userIds.size() > ImSyncApplication.BATCH_SIZE
                || userIds.stream().anyMatch(userId -> userId == null || userId <= 0)
                || userIds.stream().distinct().count() != userIds.size()) throw ImFailure.orgLocal();
        if (userIds.isEmpty()) return;
        List<String> negativeCacheKeys = new ArrayList<>();
        for (Long userId : userIds) {
            ImSyncBudget.check();
            SysUser user = revoke(tenantId, userId);
            if (user != null) negativeCacheKeys.add("cache:null:userinfo:" + tenantId + ":" + user.getUserName());
        }
        scopes.deleteAll(tenantId, userIds);
        redis.deleteObjects(negativeCacheKeys);
        cache(tenantId, CacheConstants.USER_MENUS).invalidate();
        cache(tenantId, CacheConstants.USER_DETAILS).invalidate();
    }

    private SysUser revoke(long tenantId, long userId) {
        SysUser user = oauth.lockUser(tenantId, userId);
        if (user != null && (!Objects.equals(user.getTenantId(), tenantId) || !Objects.equals(user.getUserId(), userId)
                || user.getUserName() == null || user.getUserName().isBlank())) throw ImFailure.orgLocal();
        LocalDateTime now = LocalDateTime.now();
        oauth.revokeAccess(tenantId, null, userId, null, "ORGANIZATION_SYNC", now);
        oauth.revokeRefresh(tenantId, null, userId, null, now);
        oauth.denyCodes(tenantId, null, userId, now);
        oauth.revokeApprovals(tenantId, null, userId, now);
        long cursor = 0;
        while (true) {
            ImSyncBudget.check();
            List<OAuthAccessToken> page = oauth.userAccessPage(tenantId, userId, cursor);
            if (page.isEmpty()) break;
            for (OAuthAccessToken access : page) {
                ImSyncBudget.check();
                oauthTokens.end(List.of(access.getTokenHash()));
            }
            long next = page.get(page.size() - 1).getAccessTokenId();
            if (next <= cursor) throw ImFailure.orgLocal();
            cursor = next;
        }
        SaSession session = StpUtil.getSessionByLoginId(userId, false);
        if (session != null && user != null) {
            StpUtil.logout(userId);
        } else if (session != null && session.get(TokenService.LOGIN_USER_SESSION_KEY) instanceof Map<?, ?> claims) {
            Object owner = claims.containsKey("ownerTenantId") ? claims.get("ownerTenantId") : claims.get("tenantId");
            if (Long.toString(tenantId).equals(String.valueOf(owner))
                    && Long.toString(userId).equals(String.valueOf(claims.get("userId")))) StpUtil.logout(userId);
        }
        return user;
    }

    void finish(long tenantId) {
        requireScope(tenantId);
        cache(tenantId, CacheConstants.USER_DETAILS).invalidate();
        calendars.invalidateAssignments();
    }

    private Cache cache(long tenantId, String name) {
        Cache cache = caches.getCache(name);
        if (cache == null || !cache.getName().equals(tenantId + ":" + name)) throw ImFailure.orgLocal();
        return cache;
    }

    private static void requireScope(long tenantId) {
        if (tenantId <= 0 || !Objects.equals(tenantId, TenantContext.getTenantId()) || TenantContext.getTenantSkip()
                || !TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) throw ImFailure.orgLocal();
    }
}
