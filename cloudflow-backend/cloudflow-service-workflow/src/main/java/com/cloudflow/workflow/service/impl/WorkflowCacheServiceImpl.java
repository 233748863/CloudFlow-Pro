package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.vo.UserBriefVO;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.service.IWorkflowCacheService;
import com.cloudflow.workflow.service.remote.RemoteUserService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 工作流缓存服务实现
 * 使用Spring Cache + Redis实现缓存
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowCacheServiceImpl implements IWorkflowCacheService {

    private final WfProcessDefinitionMapper definitionMapper;
    private final WfFormDefinitionMapper formMapper;
    private final RedisTemplate<String, Object> redisTemplate;
    private final RemoteUserService remoteUserService;
    private final SysConfigHelper sysConfigHelper;

    // 缓存key前缀
    private static final String DEFINITION_CACHE = "workflow:definition";
    private static final String FORM_CACHE = "workflow:form";
    private static final String USER_CACHE = "workflow:user";

    // 兜底默认 TTL（秒），实际值从 sys.workflow.cache.* 读取
    private static final long DEFAULT_DEFINITION_TTL = 3600; // 1小时
    private static final long DEFAULT_FORM_TTL = 3600; // 1小时
    private static final long DEFAULT_USER_TTL = 1800; // 30分钟

    // P2-fix-4: TTL 随机抖动范围（秒），防止缓存雪崩
    private static final double TTL_JITTER_RATIO = 0.10D;

    private long definitionTtl() {
        return sysConfigHelper.getConfigLong("sys.workflow.cache.definition.ttl", DEFAULT_DEFINITION_TTL);
    }

    private long formTtl() {
        return sysConfigHelper.getConfigLong("sys.workflow.cache.form.ttl", DEFAULT_FORM_TTL);
    }

    private long userTtl() {
        return sysConfigHelper.getConfigLong("sys.workflow.cache.user.ttl", DEFAULT_USER_TTL);
    }

    // P2-fix-2: 缓存命中率统计（原子计数器）
    private final AtomicLong definitionHitCount = new AtomicLong(0);
    private final AtomicLong definitionMissCount = new AtomicLong(0);
    private final AtomicLong formHitCount = new AtomicLong(0);
    private final AtomicLong formMissCount = new AtomicLong(0);
    private final AtomicLong userHitCount = new AtomicLong(0);
    private final AtomicLong userMissCount = new AtomicLong(0);

    /**
     * 获取流程定义（带缓存）
     * 使用Spring Cache注解自动管理缓存
     */
    @Override
    @DistributedLock(key = "'cache:wf:definition:' + #definitionId", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = DEFINITION_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #definitionId", unless = "#result == null")
    public WfProcessDefinition getDefinition(String definitionId) {
        String nullKey = nullKey(DEFINITION_CACHE, definitionId);
        if (Boolean.TRUE.equals(redisTemplate.hasKey(nullKey))) {
            return null;
        }
        // P2-fix-2: 缓存未命中，计数+1
        definitionMissCount.incrementAndGet();
        log.debug("从数据库查询流程定义: {}", definitionId);
        WfProcessDefinition definition = definitionMapper.selectById(definitionId);
        if (definition == null) {
            redisTemplate.opsForValue().set(nullKey, "1", 30, TimeUnit.SECONDS);
        }
        
        if (definition != null) {
            // P2-fix-4: 手动设置带随机抖动的TTL，防止缓存雪崩
            Long currentTenantId = UserContext.getTenantId();
            String cacheKey = DEFINITION_CACHE + "::" + currentTenantId + ":" + definitionId;
            redisTemplate.expire(cacheKey, getJitteredTtl(definitionTtl()), TimeUnit.SECONDS);
        }
        
        return definition;
    }

    /**
     * 获取表单定义（带缓存）
     */
    @Override
    @DistributedLock(key = "'cache:wf:form:' + #formId", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = FORM_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #formId", unless = "#result == null")
    public WfFormDefinition getForm(String formId) {
        String nullKey = nullKey(FORM_CACHE, formId);
        if (Boolean.TRUE.equals(redisTemplate.hasKey(nullKey))) {
            return null;
        }
        // P2-fix-2: 缓存未命中，计数+1
        formMissCount.incrementAndGet();
        log.debug("从数据库查询表单定义: {}", formId);
        WfFormDefinition form = formMapper.selectById(formId);
        if (form == null) {
            redisTemplate.opsForValue().set(nullKey, "1", 30, TimeUnit.SECONDS);
        }
        
        if (form != null) {
            // P2-fix-4: 带随机抖动的TTL
            Long currentTenantId = UserContext.getTenantId();
            String cacheKey = FORM_CACHE + "::" + currentTenantId + ":" + formId;
            redisTemplate.expire(cacheKey, getJitteredTtl(formTtl()), TimeUnit.SECONDS);
        }
        
        return form;
    }

    /**
     * 获取用户信息（带缓存）
     */
    @Override
    @DistributedLock(key = "'cache:wf:user:' + #userId", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = USER_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #userId", unless = "#result == null")
    public UserBriefVO getUser(Long userId) {
        if (userId == null) {
            return null;
        }
        String nullKey = nullKey(USER_CACHE, String.valueOf(userId));
        if (Boolean.TRUE.equals(redisTemplate.hasKey(nullKey))) {
            return null;
        }
        
        log.debug("从用户服务查询用户信息: {}", userId);
        
        try {
            // P2-fix-2: 缓存未命中，计数+1
            userMissCount.incrementAndGet();
            // 调用cloudflow-auth模块的用户服务获取用户信息
            R<Map<String, Object>> result = remoteUserService.getUser(userId);
            
            if (result.getCode() == 200 && result.getData() != null) {
                UserBriefVO user = convertMapToUserBriefVO(result.getData());
                
                // P2-fix-4: 带随机抖动的TTL
                Long currentTenantId = UserContext.getTenantId();
                String cacheKey = USER_CACHE + "::" + currentTenantId + ":" + userId;
                redisTemplate.expire(cacheKey, getJitteredTtl(userTtl()), TimeUnit.SECONDS);
                
                return user;
            }
            
            log.warn("获取用户信息失败: userId={}, msg={}", userId, result.getMsg());
            redisTemplate.opsForValue().set(nullKey, "1", 30, TimeUnit.SECONDS);
            return null;
        } catch (Exception e) {
            log.error("获取用户信息异常: userId={}", userId, e);
            redisTemplate.opsForValue().set(nullKey, "1", 30, TimeUnit.SECONDS);
            return null;
        }
    }

    private String nullKey(String cacheName, String id) {
        Long tenantId = UserContext.getTenantId();
        return "cache:null:" + cacheName + ":" + (tenantId == null ? "global" : tenantId) + ":" + id;
    }

    /**
     * 失效流程定义缓存
     */
    @Override
    @CacheEvict(value = DEFINITION_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #definitionId")
    public void evictDefinition(String definitionId) {
        log.info("失效流程定义缓存: {}", definitionId);
    }

    /**
     * 失效表单定义缓存
     */
    @Override
    @CacheEvict(value = FORM_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #formId")
    public void evictForm(String formId) {
        log.info("失效表单定义缓存: {}", formId);
    }

    /**
     * 失效用户信息缓存
     */
    @Override
    @CacheEvict(value = USER_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #userId")
    public void evictUser(Long userId) {
        log.info("失效用户信息缓存: {}", userId);
    }

    /**
     * 清空所有缓存
     */
    @Override
    @CacheEvict(value = {DEFINITION_CACHE, FORM_CACHE, USER_CACHE}, allEntries = true)
    public void evictAll() {
        log.warn("清空所有工作流缓存");
    }

    /**
     * P2-fix-2: 获取缓存统计信息（基于实际计数器）
     */
    @Override
    public CacheStats getCacheStats() {
        CacheStats stats = new CacheStats();
        
        try {
            // 获取各缓存的大小
            stats.setDefinitionCacheSize(getCacheSize(DEFINITION_CACHE));
            stats.setFormCacheSize(getCacheSize(FORM_CACHE));
            stats.setUserCacheSize(getCacheSize(USER_CACHE));
            
            // P2-fix-2: 基于实际计数器计算命中率
            stats.setDefinitionHitRate(calculateHitRate(definitionHitCount.get(), definitionMissCount.get()));
            stats.setFormHitRate(calculateHitRate(formHitCount.get(), formMissCount.get()));
            stats.setUserHitRate(calculateHitRate(userHitCount.get(), userMissCount.get()));
            
            log.debug("缓存统计: 定义={}/命中率={}, 表单={}/命中率={}, 用户={}/命中率={}", 
                stats.getDefinitionCacheSize(), String.format("%.2f", stats.getDefinitionHitRate()),
                stats.getFormCacheSize(), String.format("%.2f", stats.getFormHitRate()),
                stats.getUserCacheSize(), String.format("%.2f", stats.getUserHitRate()));
        } catch (Exception e) {
            log.error("获取缓存统计信息失败", e);
        }
        
        return stats;
    }

    /**
     * P2-fix-2: 使用 SCAN 替代 KEYS 命令，避免阻塞 Redis
     */
    private long getCacheSize(String cacheName) {
        try {
            String pattern = cacheName + "::*";
            Long size = redisTemplate.execute((org.springframework.data.redis.core.RedisCallback<Long>) connection -> {
                long count = 0;
                try {
                    // 使用 SCAN 命令迭代，每次扫描100个key，不阻塞Redis
                    org.springframework.data.redis.core.ScanOptions options = 
                        org.springframework.data.redis.core.ScanOptions.scanOptions()
                            .match(pattern)
                            .count(100)
                            .build();
                    try (org.springframework.data.redis.core.Cursor<byte[]> cursor = 
                            connection.keyCommands().scan(options)) {
                        while (cursor.hasNext()) {
                            cursor.next();
                            count++;
                        }
                    }
                } catch (Exception e) {
                    log.warn("SCAN统计缓存key数量失败: {}", pattern, e);
                }
                return count;
            });
            return size != null ? size : 0;
        } catch (Exception e) {
            log.error("获取缓存大小失败: {}", cacheName, e);
            return 0;
        }
    }

    /**
     * P2-fix-2: 计算缓存命中率
     */
    private double calculateHitRate(long hitCount, long missCount) {
        long total = hitCount + missCount;
        if (total == 0) {
            return 0.0;
        }
        return (double) hitCount / total;
    }

    /**
     * P2-fix-4: 生成带随机抖动的TTL，防止大量缓存同时过期（缓存雪崩）
     * 在基础TTL上增加 ±TTL_JITTER_RANGE 的随机偏移
     */
    private long getJitteredTtl(long baseTtl) {
        long range = Math.max(1L, Math.round(baseTtl * TTL_JITTER_RATIO));
        long jitter = java.util.concurrent.ThreadLocalRandom.current().nextLong(-range, range + 1);
        return Math.max(60, baseTtl + jitter); // 最小60秒
    }

    /**
     * 将Map转换为UserBriefVO
     */
    private UserBriefVO convertMapToUserBriefVO(Map<String, Object> userMap) {
        UserBriefVO vo = new UserBriefVO();
        vo.setUserId(((Number) userMap.get("userId")).longValue());
        vo.setUsername((String) userMap.get("userName"));
        vo.setNickName((String) userMap.get("nickName"));
        
        Object deptId = userMap.get("deptId");
        if (deptId != null) {
            vo.setDeptId(((Number) deptId).longValue());
        }
        
        vo.setEmail((String) userMap.get("email"));
        vo.setPhonenumber((String) userMap.get("phonenumber"));
        return vo;
    }
}
