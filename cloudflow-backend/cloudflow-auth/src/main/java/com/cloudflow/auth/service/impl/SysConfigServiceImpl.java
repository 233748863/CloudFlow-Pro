package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysConfig;
import com.cloudflow.auth.mapper.SysConfigMapper;
import com.cloudflow.auth.service.ISysConfigService;
import com.cloudflow.common.core.utils.SysConfigHelper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 系统参数配置 Service 实现
 * <p>
 * 根据 configScope 字段区分全局配置和租户配置：
 * <ul>
 *   <li>scope=0（全局）：缓存到 sys:config:global:{key}，所有租户共享</li>
 *   <li>scope=1（租户）：缓存到 {tenantId}:sys:config:tenant:{key}，每租户独立</li>
 * </ul>
 *
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysConfigServiceImpl extends ServiceImpl<SysConfigMapper, SysConfig> implements ISysConfigService {

    private final SysConfigHelper sysConfigHelper;

    /** 全局配置作用域标识 */
    private static final String SCOPE_GLOBAL = "0";

    /**
     * 应用启动时，将所有配置项加载到 Redis 缓存
     */
    @PostConstruct
    public void init() {
        loadConfigToRedis();
    }

    /**
     * 加载所有配置到 Redis 缓存
     * <p>
     * 启动时没有租户上下文，需要根据 scope 区分处理：
     * - 全局配置：直接写入 sys:config:global:{key}
     * - 租户配置：使用 setTenantCache(tenantId, key, value) 绕过租户上下文
     */
    public void loadConfigToRedis() {
        List<SysConfig> configList = this.list();
        int globalCount = 0;
        int tenantCount = 0;
        for (SysConfig config : configList) {
            String scope = config.getConfigScope();
            if (SCOPE_GLOBAL.equals(scope)) {
                // 全局配置：直接写入全局前缀
                sysConfigHelper.setGlobalCache(config.getConfigKey(), config.getConfigValue());
                globalCount++;
            } else {
                // 租户配置：使用指定租户ID写入，绕过租户上下文
                sysConfigHelper.setTenantCache(
                        config.getTenantId(),
                        config.getConfigKey(),
                        config.getConfigValue()
                );
                tenantCount++;
            }
        }
        log.info("系统参数配置缓存预热完成，全局配置 {} 条，租户配置 {} 条", globalCount, tenantCount);
    }

    @Override
    public String selectConfigByKey(String configKey) {
        // 使用智能读取：先查租户配置 → 全局配置 → null
        String cachedValue = sysConfigHelper.getConfigValue(configKey);
        if (cachedValue != null) {
            return cachedValue;
        }
        // 缓存未命中，从数据库查询并回填缓存
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysConfig::getConfigKey, configKey);
        SysConfig config = this.getOne(wrapper);
        if (config != null) {
            // 根据 scope 写入对应缓存
            setCacheByScope(config);
            return config.getConfigValue();
        }
        return null;
    }

    @Override
    public boolean checkConfigKeyUnique(SysConfig config) {
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysConfig::getConfigKey, config.getConfigKey());
        if (config.getConfigId() != null) {
            wrapper.ne(SysConfig::getConfigId, config.getConfigId());
        }
        return this.count(wrapper) == 0;
    }

    /**
     * 新增配置后同步缓存
     */
    @Override
    public boolean save(SysConfig entity) {
        boolean result = super.save(entity);
        if (result) {
            setCacheByScope(entity);
            log.info("新增系统配置并同步缓存: {} = {} (scope={})",
                    entity.getConfigKey(), entity.getConfigValue(), entity.getConfigScope());
        }
        return result;
    }

    /**
     * 修改配置后同步缓存
     */
    @Override
    public boolean updateById(SysConfig entity) {
        // 如果 configKey 或 scope 被修改了，需要先删除旧的缓存
        if (entity.getConfigId() != null) {
            SysConfig oldConfig = this.getById(entity.getConfigId());
            if (oldConfig != null) {
                boolean keyChanged = !oldConfig.getConfigKey().equals(entity.getConfigKey());
                boolean scopeChanged = !String.valueOf(oldConfig.getConfigScope())
                        .equals(String.valueOf(entity.getConfigScope()));
                if (keyChanged || scopeChanged) {
                    // 删除旧缓存（使用旧的 key 和 scope）
                    removeCacheByScope(oldConfig);
                }
            }
        }
        boolean result = super.updateById(entity);
        if (result) {
            setCacheByScope(entity);
            log.info("更新系统配置并同步缓存: {} = {} (scope={})",
                    entity.getConfigKey(), entity.getConfigValue(), entity.getConfigScope());
        }
        return result;
    }

    /**
     * 删除配置后清除缓存
     */
    @Override
    public boolean removeById(java.io.Serializable id) {
        SysConfig config = this.getById(id);
        boolean result = super.removeById(id);
        if (result && config != null) {
            removeCacheByScope(config);
            log.info("删除系统配置并清除缓存: {} (scope={})", config.getConfigKey(), config.getConfigScope());
        }
        return result;
    }

    /**
     * 根据配置的 scope 写入对应的 Redis 缓存
     */
    private void setCacheByScope(SysConfig config) {
        String scope = config.getConfigScope() != null ? config.getConfigScope() : "1";
        sysConfigHelper.setConfigCache(config.getConfigKey(), config.getConfigValue(), scope);
    }

    /**
     * 根据配置的 scope 删除对应的 Redis 缓存
     */
    private void removeCacheByScope(SysConfig config) {
        String scope = config.getConfigScope() != null ? config.getConfigScope() : "1";
        sysConfigHelper.removeConfigCache(config.getConfigKey(), scope);
    }
}
