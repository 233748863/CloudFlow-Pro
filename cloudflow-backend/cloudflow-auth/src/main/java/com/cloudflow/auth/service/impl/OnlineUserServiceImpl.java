package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.domain.dto.OnlineUserDTO;
import com.cloudflow.auth.domain.dto.OnlineUserQuery;
import com.cloudflow.auth.service.IOnlineUserService;
import com.cloudflow.auth.service.UserDataScopeService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.security.core.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 在线用户服务实现。
 * <p>
 * 设计说明：
 * 1. 基于 Sa-Token 的 Token 检索能力扫描在线会话；
 * 2. 统一经过 TokenService，减少业务层直接依赖 Sa-Token 细节；
 * 3. 对非管理员自动收敛到当前租户，避免跨租户查看或强退。
 * </p>
 */
@Service
@RequiredArgsConstructor
public class OnlineUserServiceImpl implements IOnlineUserService {

    private static final long MILLIS_SECOND = 1000L;

    private final TokenService tokenService;
    private final UserDataScopeService userDataScopeService;

    @Override
    public PageResult<OnlineUserDTO> selectOnlineUserPage(OnlineUserQuery query, PageQuery pageQuery) {
        PageQuery actualPageQuery = pageQuery != null ? pageQuery : new PageQuery();
        String currentToken = tokenService.getCurrentTokenValue();
        boolean isAdmin = SecurityUtils.isAdmin();
        Long currentTenantId = SecurityUtils.getTenantId();

        LinkedHashSet<String> tokenValues = new LinkedHashSet<>();
        List<String> searchedTokens = tokenService.searchTokenValue("", 0, -1, false);
        if (!CollectionUtils.isEmpty(searchedTokens)) {
            tokenValues.addAll(searchedTokens);
        }
        if (StringUtils.hasText(currentToken)) {
            tokenValues.add(currentToken);
        }

        if (CollectionUtils.isEmpty(tokenValues)) {
            return new PageResult<>(List.of(), 0, normalizePageNum(actualPageQuery.getPageNum()), normalizePageSize(actualPageQuery.getPageSize()));
        }
        List<OnlineUserDTO> filteredUsers = tokenValues.stream()
            .map(token -> buildOnlineUser(token, currentToken))
            .filter(Objects::nonNull)
            .filter(user -> canAccess(user, isAdmin, currentTenantId))
            .filter(user -> matchQuery(user, query))
            .sorted(Comparator.comparing(OnlineUserDTO::getLoginTime,
                Comparator.nullsLast(Comparator.reverseOrder())))
            .collect(Collectors.toList());

        long total = filteredUsers.size();
        int pageNum = normalizePageNum(actualPageQuery.getPageNum());
        int pageSize = normalizePageSize(actualPageQuery.getPageSize());
        int fromIndex = Math.min((pageNum - 1) * pageSize, filteredUsers.size());
        int toIndex = Math.min(fromIndex + pageSize, filteredUsers.size());

        return new PageResult<>(new ArrayList<>(filteredUsers.subList(fromIndex, toIndex)), total, pageNum, pageSize);
    }

    @Override
    public int forceLogout(List<String> tokens) {
        if (CollectionUtils.isEmpty(tokens)) {
            return 0;
        }

        String currentToken = tokenService.getCurrentTokenValue();
        boolean isAdmin = SecurityUtils.isAdmin();
        Long currentTenantId = SecurityUtils.getTenantId();

        Set<String> distinctTokens = tokens.stream()
            .map(tokenService::normalizeToken)
            .filter(StringUtils::hasText)
            .collect(Collectors.toCollection(LinkedHashSet::new));

        int successCount = 0;
        for (String token : distinctTokens) {
            if (Objects.equals(token, currentToken)) {
                continue;
            }

            OnlineUserDTO onlineUser = buildOnlineUser(token, currentToken);
            if (onlineUser == null || !canAccess(onlineUser, isAdmin, currentTenantId)) {
                continue;
            }

            clearDataScopeSnapshot(onlineUser);
            tokenService.deleteToken(token);
            successCount++;
        }
        return successCount;
    }

    private void clearDataScopeSnapshot(OnlineUserDTO onlineUser) {
        if (onlineUser == null || onlineUser.getTenantId() == null || onlineUser.getUserId() == null) {
            return;
        }
        userDataScopeService.clear(onlineUser.getTenantId(), onlineUser.getUserId());
    }

    /**
     * 将会话 Map 转换为前端可直接消费的在线用户对象。
     */
    private OnlineUserDTO buildOnlineUser(String token, String currentToken) {
        String rawToken = tokenService.normalizeToken(token);
        if (!StringUtils.hasText(rawToken)) {
            return null;
        }

        Map<String, Object> loginUser = tokenService.getLoginUserByToken(rawToken);
        if (loginUser == null) {
            return null;
        }

        long remainingSeconds = tokenService.getTokenTimeout(rawToken);
        if (remainingSeconds == -2L) {
            return null;
        }

        OnlineUserDTO onlineUser = new OnlineUserDTO();
        onlineUser.setToken(rawToken);
        onlineUser.setUserId(toLong(loginUser.get("userId")));
        onlineUser.setUsername(toStringValue(loginUser.get("username")));
        onlineUser.setNickName(toStringValue(loginUser.get("nickName")));
        onlineUser.setDeptId(toLong(loginUser.get("deptId")));
        onlineUser.setDeptName(toStringValue(loginUser.get("deptName")));
        onlineUser.setTenantId(toLong(loginUser.get("tenantId")));
        onlineUser.setAvatar(toStringValue(loginUser.get("avatar")));
        onlineUser.setRoles(resolveStringSet(loginUser.get("roles")));
        onlineUser.setLoginTime(toLong(loginUser.get("login_time")));
        onlineUser.setExpireTime(resolveExpireTime(loginUser.get("expire_time"), remainingSeconds));
        onlineUser.setRemainingSeconds(remainingSeconds >= 0 ? remainingSeconds : null);
        onlineUser.setCurrentLogin(Objects.equals(rawToken, currentToken));
        return onlineUser;
    }

    private boolean canAccess(OnlineUserDTO onlineUser, boolean isAdmin, Long currentTenantId) {
        if (onlineUser == null) {
            return false;
        }
        if (isAdmin) {
            return true;
        }
        return currentTenantId == null || Objects.equals(currentTenantId, onlineUser.getTenantId());
    }

    private boolean matchQuery(OnlineUserDTO onlineUser, OnlineUserQuery query) {
        if (onlineUser == null || query == null) {
            return true;
        }
        if (StringUtils.hasText(query.getUsername()) && !containsIgnoreCase(onlineUser.getUsername(), query.getUsername())) {
            return false;
        }
        if (StringUtils.hasText(query.getNickName()) && !containsIgnoreCase(onlineUser.getNickName(), query.getNickName())) {
            return false;
        }
        if (StringUtils.hasText(query.getDeptName()) && !containsIgnoreCase(onlineUser.getDeptName(), query.getDeptName())) {
            return false;
        }
        return query.getTenantId() == null || Objects.equals(query.getTenantId(), onlineUser.getTenantId());
    }

    private boolean containsIgnoreCase(String source, String keyword) {
        return StringUtils.hasText(source)
            && StringUtils.hasText(keyword)
            && source.toLowerCase().contains(keyword.trim().toLowerCase());
    }

    private Long resolveExpireTime(Object expireTime, long remainingSeconds) {
        if (remainingSeconds >= 0) {
            return System.currentTimeMillis() + remainingSeconds * MILLIS_SECOND;
        }
        return toLong(expireTime);
    }

    private Set<String> resolveStringSet(Object value) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (value instanceof Collection<?> collection) {
            for (Object item : collection) {
                String text = toStringValue(item);
                if (StringUtils.hasText(text)) {
                    result.add(text);
                }
            }
        } else if (value instanceof Object[] array) {
            for (Object item : array) {
                String text = toStringValue(item);
                if (StringUtils.hasText(text)) {
                    result.add(text);
                }
            }
        } else {
            String text = toStringValue(value);
            if (StringUtils.hasText(text)) {
                result.add(text);
            }
        }
        return result;
    }

    private String toStringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long toLong(Object value) {
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number numberValue) {
            return numberValue.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private int normalizePageNum(Integer pageNum) {
        return pageNum == null || pageNum < 1 ? 1 : pageNum;
    }

    private int normalizePageSize(Integer pageSize) {
        return pageSize == null || pageSize < 1 ? 10 : pageSize;
    }
}
