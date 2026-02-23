package com.cloudflow.common.core.utils;

import com.cloudflow.common.config.properties.SecurityProperties;
import com.cloudflow.common.core.constant.CacheConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class TokenService {
    
    @Autowired
    private SecurityProperties securityProperties;

    @Autowired(required = false)
    private SysConfigHelper sysConfigHelper;
    
    protected static final long MILLIS_SECOND = 1000;
    protected static final long MILLIS_MINUTE = 60 * MILLIS_SECOND;

    @Autowired
    private RedisCache redisCache;

    /**
     * 获取 Token 过期时间（分钟），优先从 sys_config 读取（全局配置）
     */
    private int getExpiration() {
        if (sysConfigHelper != null) {
            return sysConfigHelper.getGlobalInt("sys.security.token.expiration",
                    securityProperties.getToken().getExpiration());
        }
        return securityProperties.getToken().getExpiration();
    }

    /**
     * 获取 Token 刷新时间（分钟），优先从 sys_config 读取（全局配置）
     */
    private int getRefreshTime() {
        if (sysConfigHelper != null) {
            return sysConfigHelper.getGlobalInt("sys.security.token.refreshTime",
                    securityProperties.getToken().getRefreshTime());
        }
        return securityProperties.getToken().getRefreshTime();
    }

    /**
     * 创建令牌
     *
     * @param loginUser 用户信息
     * @return 令牌
     */
    public String createToken(Map<String, Object> loginUser) {
        String token = UUID.randomUUID().toString();
        Object userId = loginUser.get("userId");
        
        // 在创建新 token 之前，先删除该用户的所有旧 token（实现单点登录）
        if (userId != null) {
            deleteUserTokens(userId);
        }
        
        loginUser.put("token", token);
        loginUser.put("login_time", System.currentTimeMillis());
        loginUser.put("expire_time", System.currentTimeMillis() + getExpiration() * MILLIS_MINUTE);

        String userKey = getTokenKey(token);
        redisCache.setCacheObject(userKey, loginUser, getExpiration(), TimeUnit.MINUTES);

        // 反向索引（用户 -> Tokens 集合）
        if (userId != null) {
            String userTokensKey = CacheConstants.USER_TOKENS_KEY + userId;
            // 使用封装的 RedisCache 方法确保租户隔离
            redisCache.setCacheSet(userTokensKey, token);
            redisCache.expire(userTokensKey, getExpiration(), TimeUnit.MINUTES);
        }

        // 生成 JWT，载荷放入 UUID
        Map<String, Object> claims = new HashMap<>();
        claims.put("token", token);
        return createJwtToken(claims);
    }

    /**
     * 验证令牌有效期，相差不足刷新时间阈值，自动刷新缓存
     *
     * @param token 令牌
     * @return 用户信息 Map (若无效则返回 null)
     */
    public Map<String, Object> verifyToken(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        try {
            // 解析 JWT 获取 UUID Token
            Claims claims = parseToken(token);
            String uuid = (String) claims.get("token");
            String userKey = getTokenKey(uuid);
            
            // 查 Redis
            Map<String, Object> userMap = redisCache.getCacheObject(userKey);
            if (userMap != null) {
                verifyToken(userKey, userMap);
                return userMap;
            }
        } catch (Exception e) {
            // Token 解析失败或过期，忽略异常
        }
        return null;
    }

    /**
     * 刷新令牌有效期
     */
    public void verifyToken(String userKey, Map<String, Object> loginUser) {
        long expireTime = ((Number) loginUser.get("expire_time")).longValue();
        long currentTime = System.currentTimeMillis();
        
        long refreshThreshold = getRefreshTime() * MILLIS_MINUTE;
        
        if (expireTime - currentTime <= refreshThreshold) {
            refreshToken(userKey, loginUser);
        }
    }

    /**
     * 刷新令牌有效期
     */
    public void refreshToken(String userKey, Map<String, Object> loginUser) {
        loginUser.put("login_time", System.currentTimeMillis());
        loginUser.put("expire_time", System.currentTimeMillis() + getExpiration() * MILLIS_MINUTE);
        redisCache.setCacheObject(userKey, loginUser, getExpiration(), TimeUnit.MINUTES);
        
        // 刷新反向索引有效期
        Object userId = loginUser.get("userId");
        if (userId != null) {
             String userTokensKey = CacheConstants.USER_TOKENS_KEY + userId;
             redisCache.expire(userTokensKey, getExpiration(), TimeUnit.MINUTES);
        }
    }

    /**
     * 删除令牌 (登出/踢人)
     */
    public void deleteToken(String token) {
        String userKey = getTokenKey(token);
        Map<String, Object> userMap = redisCache.getCacheObject(userKey);
        if (userMap != null) {
            Object userId = userMap.get("userId");
            if (userId != null) {
                String userTokensKey = CacheConstants.USER_TOKENS_KEY + userId;
                redisCache.removeCacheSet(userTokensKey, token);
            }
            redisCache.deleteObject(userKey);
        }
    }
    
    /**
     * 删除用户的所有 token（用于单点登录：新登录时踢掉旧会话）
     * 
     * @param userId 用户ID
     */
    private void deleteUserTokens(Object userId) {
        if (userId == null) {
            return;
        }
        
        String userTokensKey = CacheConstants.USER_TOKENS_KEY + userId;
        
        // 获取该用户的所有 token
        Set<Object> tokens = redisCache.getCacheSet(userTokensKey);
        
        if (tokens != null && !tokens.isEmpty()) {
            // 删除每个 token 对应的登录信息
            for (Object token : tokens) {
                String tokenKey = getTokenKey(token.toString());
                redisCache.deleteObject(tokenKey);
            }
        }
        
        // 删除用户 token 集合
        redisCache.deleteObject(userTokensKey);
    }

    /**
     * 从数据声明生成令牌
     *
     * @param claims 数据声明
     * @return 令牌
     */
    private String createJwtToken(Map<String, Object> claims) {
        return Jwts.builder()
                .setClaims(claims)
                .signWith(SignatureAlgorithm.HS512, securityProperties.getJwt().getSecret())
                .compact();
    }

    /**
     * 从令牌中获取数据声明
     *
     * @param token 令牌
     * @return 数据声明
     */
    private Claims parseToken(String token) {
        return Jwts.parser()
                .setSigningKey(securityProperties.getJwt().getSecret())
                .parseClaimsJws(token)
                .getBody();
    }

    private String getTokenKey(String uuid) {
        return CacheConstants.LOGIN_TOKEN_KEY + uuid;
    }
}
