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
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class TokenService {
    
    @Autowired
    private SecurityProperties securityProperties;
    
    protected static final long MILLIS_SECOND = 1000;
    protected static final long MILLIS_MINUTE = 60 * MILLIS_SECOND;

    @Autowired
    private RedisCache redisCache;

    /**
     * 创建令牌
     *
     * @param loginUser 用户信息
     * @return 令牌
     */
    public String createToken(Map<String, Object> loginUser) {
        String token = UUID.randomUUID().toString();
        Object userId = loginUser.get("userId");
        
        loginUser.put("token", token);
        loginUser.put("login_time", System.currentTimeMillis());
        loginUser.put("expire_time", System.currentTimeMillis() + securityProperties.getToken().getExpiration() * MILLIS_MINUTE);

        String userKey = getTokenKey(token);
        redisCache.setCacheObject(userKey, loginUser, securityProperties.getToken().getExpiration(), TimeUnit.MINUTES);

        // 反向索引（用户 -> Tokens 集合）
        if (userId != null) {
            String userTokensKey = CacheConstants.USER_TOKENS_KEY + userId;
            // 使用封装的 RedisCache 方法确保租户隔离
            redisCache.setCacheSet(userTokensKey, token);
            redisCache.expire(userTokensKey, securityProperties.getToken().getExpiration(), TimeUnit.MINUTES);
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
        
        long refreshThreshold = securityProperties.getToken().getRefreshTime() * MILLIS_MINUTE;
        
        if (expireTime - currentTime <= refreshThreshold) {
            refreshToken(userKey, loginUser);
        }
    }

    /**
     * 刷新令牌有效期
     */
    public void refreshToken(String userKey, Map<String, Object> loginUser) {
        loginUser.put("login_time", System.currentTimeMillis());
        loginUser.put("expire_time", System.currentTimeMillis() + securityProperties.getToken().getExpiration() * MILLIS_MINUTE);
        redisCache.setCacheObject(userKey, loginUser, securityProperties.getToken().getExpiration(), TimeUnit.MINUTES);
        
        // 刷新反向索引有效期
        Object userId = loginUser.get("userId");
        if (userId != null) {
             String userTokensKey = CacheConstants.USER_TOKENS_KEY + userId;
             redisCache.expire(userTokensKey, securityProperties.getToken().getExpiration(), TimeUnit.MINUTES);
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
