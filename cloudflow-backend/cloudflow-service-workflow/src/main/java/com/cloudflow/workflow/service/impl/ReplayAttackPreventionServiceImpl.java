package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.IReplayAttackPreventionService;

import com.cloudflow.common.redis.core.RedisCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * S.4: 防重放攻击服务
 * 使用 Token + Redis 实现幂等性
 */
@Service
public class ReplayAttackPreventionServiceImpl implements IReplayAttackPreventionService {

    private static final Logger log = LoggerFactory.getLogger(ReplayAttackPreventionServiceImpl.class);
    private static final String NONCE_PREFIX = "sys:wf:nonce:";
    private static final int NONCE_EXPIRE_MINUTES = 5;

    @Autowired
    private RedisCache redisCache;

    /**
     * 检查并注册 nonce，防止重放攻击
     * @param nonce 唯一标识符
     * @return true 如果是首次使用，false 如果已被使用（重放攻击）
     */
    public boolean checkAndRegisterNonce(String nonce) {
        if (nonce == null || nonce.isEmpty()) {
            return true; // 没有提供 nonce，跳过检查
        }

        String key = NONCE_PREFIX + nonce;
        
        // 尝试设置 nonce，如果已存在则返回 false
        Boolean success = redisCache.setCacheObjectIfAbsent(key, "1", NONCE_EXPIRE_MINUTES, TimeUnit.MINUTES);
        
        if (success == null || !success) {
            log.warn("[checkAndRegisterNonce] 检测到重放攻击, nonce={}", nonce);
            return false;
        }
        
        log.debug("[checkAndRegisterNonce] Nonce注册成功, nonce={}", nonce);
        return true;
    }

    /**
     * 生成唯一的 nonce
     */
    public String generateNonce() {
        return java.util.UUID.randomUUID().toString();
    }
}
