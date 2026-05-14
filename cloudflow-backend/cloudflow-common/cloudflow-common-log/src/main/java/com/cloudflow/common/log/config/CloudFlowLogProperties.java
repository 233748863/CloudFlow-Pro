package com.cloudflow.common.log.config;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.List;

/**
 * 操作日志配置属性
 * <p>
 * 优先从 sys_config 表读取配置（通过 SysConfigHelper），
 * 读取失败或未配置时使用 application.yml 中的默认值。
 * <p>
 * 对应配置键：
 * - sys.log.enabled（ID 32）：是否开启操作日志
 * - sys.log.requestEnabled（ID 33）：是否记录请求报文体
 * - sys.log.maxLength（ID 31）：请求参数最大记录长度
 *
 * @author CloudFlow
 */
@Slf4j
@Data
@ConfigurationProperties(prefix = "cloudflow.log")
public class CloudFlowLogProperties {

    /** 是否开启操作日志记录，默认开启 */
    private boolean enabled = true;

    /** 是否记录请求报文体，默认开启 */
    private boolean requestEnabled = true;

    /** 请求参数最大记录长度，超出截断 */
    private int maxLength = 2000;

    /**
     * 扩展敏感字段名，日志记录时会一并走统一脱敏。
     */
    private List<String> excludeFields = Arrays.asList(
            "password", "secret", "token", "accessToken", "refreshToken",
            "mobile", "idcard", "creditCard"
    );

    /**
     * SysConfigHelper 为可选依赖，当 common-redis 模块存在时自动注入。
     * 不存在时为 null，使用 yml 默认值。
     */
    @Autowired(required = false)
    private com.cloudflow.common.redis.core.SysConfigHelper sysConfigHelper;

    /**
     * 应用启动后从 sys_config 表加载日志配置，覆盖 yml 默认值
     */
    @PostConstruct
    public void loadFromSysConfig() {
        if (sysConfigHelper == null) {
            log.debug("SysConfigHelper 未注入，日志模块使用 yml 默认配置");
            return;
        }
        try {
            // 日志配置为全局配置（scope=0），使用 getGlobalXxx 方法
            this.enabled = sysConfigHelper.getGlobalBoolean("sys.log.enabled", this.enabled);
            this.requestEnabled = sysConfigHelper.getGlobalBoolean("sys.log.requestEnabled", this.requestEnabled);
            this.maxLength = sysConfigHelper.getGlobalInt("sys.log.maxLength", this.maxLength);
            log.info("日志配置已从 sys_config 加载: enabled={}, requestEnabled={}, maxLength={}",
                    this.enabled, this.requestEnabled, this.maxLength);
        } catch (Exception e) {
            log.warn("从 sys_config 加载日志配置失败，使用默认值: {}", e.getMessage());
        }
    }
}
