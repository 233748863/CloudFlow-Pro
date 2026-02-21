package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.vo.UserBriefVO;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.service.IWorkflowCacheService;
import com.cloudflow.workflow.service.remote.RemoteUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

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

    // 缓存key前缀
    private static final String DEFINITION_CACHE = "workflow:definition";
    private static final String FORM_CACHE = "workflow:form";
    private static final String USER_CACHE = "workflow:user";

    // 缓存TTL（秒）
    private static final long DEFINITION_TTL = 3600; // 1小时
    private static final long FORM_TTL = 3600; // 1小时
    private static final long USER_TTL = 1800; // 30分钟

    /**
     * 获取流程定义（带缓存）
     * 使用Spring Cache注解自动管理缓存
     */
    @Override
    @Cacheable(value = DEFINITION_CACHE, key = "#definitionId", unless = "#result == null")
    public WfProcessDefinition getDefinition(String definitionId) {
        log.debug("从数据库查询流程定义: {}", definitionId);
        WfProcessDefinition definition = definitionMapper.selectById(definitionId);
        
        if (definition != null) {
            // 手动设置TTL（Spring Cache默认不支持TTL）
            String cacheKey = DEFINITION_CACHE + "::" + definitionId;
            redisTemplate.expire(cacheKey, DEFINITION_TTL, TimeUnit.SECONDS);
        }
        
        return definition;
    }

    /**
     * 获取表单定义（带缓存）
     */
    @Override
    @Cacheable(value = FORM_CACHE, key = "#formId", unless = "#result == null")
    public WfFormDefinition getForm(String formId) {
        log.debug("从数据库查询表单定义: {}", formId);
        WfFormDefinition form = formMapper.selectById(formId);
        
        if (form != null) {
            String cacheKey = FORM_CACHE + "::" + formId;
            redisTemplate.expire(cacheKey, FORM_TTL, TimeUnit.SECONDS);
        }
        
        return form;
    }

    /**
     * 获取用户信息（带缓存）
     */
    @Override
    @Cacheable(value = USER_CACHE, key = "#userId", unless = "#result == null")
    public UserBriefVO getUser(Long userId) {
        if (userId == null) {
            return null;
        }
        
        log.debug("从用户服务查询用户信息: {}", userId);
        
        try {
            // 调用cloudflow-auth模块的用户服务获取用户信息
            R<Map<String, Object>> result = remoteUserService.getUser(userId);
            
            if (result.getCode() == 200 && result.getData() != null) {
                UserBriefVO user = convertMapToUserBriefVO(result.getData());
                
                // 设置缓存TTL
                String cacheKey = USER_CACHE + "::" + userId;
                redisTemplate.expire(cacheKey, USER_TTL, TimeUnit.SECONDS);
                
                return user;
            }
            
            log.warn("获取用户信息失败: userId={}, msg={}", userId, result.getMsg());
            return null;
        } catch (Exception e) {
            log.error("获取用户信息异常: userId={}", userId, e);
            return null;
        }
    }

    /**
     * 失效流程定义缓存
     */
    @Override
    @CacheEvict(value = DEFINITION_CACHE, key = "#definitionId")
    public void evictDefinition(String definitionId) {
        log.info("失效流程定义缓存: {}", definitionId);
    }

    /**
     * 失效表单定义缓存
     */
    @Override
    @CacheEvict(value = FORM_CACHE, key = "#formId")
    public void evictForm(String formId) {
        log.info("失效表单定义缓存: {}", formId);
    }

    /**
     * 失效用户信息缓存
     */
    @Override
    @CacheEvict(value = USER_CACHE, key = "#userId")
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
     * 获取缓存统计信息
     */
    @Override
    public CacheStats getCacheStats() {
        CacheStats stats = new CacheStats();
        
        try {
            // 获取各缓存的大小
            stats.setDefinitionCacheSize(getCacheSize(DEFINITION_CACHE));
            stats.setFormCacheSize(getCacheSize(FORM_CACHE));
            stats.setUserCacheSize(getCacheSize(USER_CACHE));
            
            // 计算命中率（简化实现，实际应该统计命中次数和总请求次数）
            stats.setDefinitionHitRate(0.85); // 示例值
            stats.setFormHitRate(0.80); // 示例值
            stats.setUserHitRate(0.75); // 示例值
            
            log.debug("缓存统计: 定义={}, 表单={}, 用户={}", 
                stats.getDefinitionCacheSize(), 
                stats.getFormCacheSize(), 
                stats.getUserCacheSize());
        } catch (Exception e) {
            log.error("获取缓存统计信息失败", e);
        }
        
        return stats;
    }

    /**
     * 获取指定缓存的大小
     */
    private long getCacheSize(String cacheName) {
        try {
            // 使用Redis KEYS命令统计key数量（简化实现）
            // 注意：生产环境建议使用SCAN命令避免阻塞
            String pattern = cacheName + "::*";
            Long size = redisTemplate.execute((org.springframework.data.redis.core.RedisCallback<Long>) connection -> {
                try {
                    Set<byte[]> keys = connection.keyCommands().keys(pattern.getBytes());
                    return keys != null ? (long) keys.size() : 0L;
                } catch (Exception e) {
                    log.warn("统计缓存key数量失败: {}", pattern, e);
                    return 0L;
                }
            });
            return size != null ? size : 0;
        } catch (Exception e) {
            log.error("获取缓存大小失败: {}", cacheName, e);
            return 0;
        }
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
