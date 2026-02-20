package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysConfig;
import com.cloudflow.auth.mapper.SysConfigMapper;
import com.cloudflow.auth.service.ISysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 系统参数配置 Service 实现
 *
 * @author CloudFlow
 */
@Service
@RequiredArgsConstructor
public class SysConfigServiceImpl extends ServiceImpl<SysConfigMapper, SysConfig> implements ISysConfigService {

    @Override
    public String selectConfigByKey(String configKey) {
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysConfig::getConfigKey, configKey);
        SysConfig config = this.getOne(wrapper);
        return config != null ? config.getConfigValue() : null;
    }

    @Override
    public boolean checkConfigKeyUnique(SysConfig config) {
        // 查询是否存在相同键名的参数（排除自身）
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysConfig::getConfigKey, config.getConfigKey());
        if (config.getConfigId() != null) {
            wrapper.ne(SysConfig::getConfigId, config.getConfigId());
        }
        return this.count(wrapper) == 0;
    }
}
