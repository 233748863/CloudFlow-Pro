package com.cloudflow.common.redis.config;

import com.cloudflow.common.redis.core.SysConfigHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

/**
 * Typed runtime access to sys_config values.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RuntimeSysConfigService {

    private final SysConfigHelper sysConfigHelper;

    public String getString(String key, String defaultValue) {
        return sysConfigHelper.getConfigValue(key, defaultValue);
    }

    public int getInt(String key, int defaultValue) {
        return sysConfigHelper.getConfigInt(key, defaultValue);
    }

    public long getLong(String key, long defaultValue) {
        return sysConfigHelper.getConfigLong(key, defaultValue);
    }

    public boolean getBoolean(String key, boolean defaultValue) {
        return sysConfigHelper.getConfigBoolean(key, defaultValue);
    }

    public BigDecimal getDecimal(String key, BigDecimal defaultValue) {
        String value = sysConfigHelper.getConfigValue(key);
        if (StringUtils.hasText(value)) {
            try {
                return new BigDecimal(value.trim());
            } catch (NumberFormatException e) {
                log.warn("配置项 {} 的值 '{}' 不是有效小数，使用默认值 {}", key, value, defaultValue);
            }
        }
        return defaultValue;
    }

    public List<String> getCsv(String key, List<String> defaultValue) {
        String value = sysConfigHelper.getConfigValue(key);
        if (!StringUtils.hasText(value)) {
            return defaultValue;
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();
    }
}
