package com.cloudflow.common.oss.factory;

import com.cloudflow.common.oss.core.OssClient;
import com.cloudflow.common.oss.exception.OssException;
import com.cloudflow.common.oss.properties.OssProperties;
import lombok.extern.slf4j.Slf4j;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OSS 客户端工厂
 * 管理多个 OssClient 实例，支持动态切换存储服务商
 *
 * 使用示例：
 * // 注册客户端
 * OssFactory.register("minio", ossProperties);
 * // 获取客户端
 * OssClient client = OssFactory.instance("minio");
 * // 获取默认客户端
 * OssClient defaultClient = OssFactory.instance();
 *
 * @author CloudFlow
 */
@Slf4j
public class OssFactory {

    /**
     * OssClient 实例缓存池
     * key: configKey（如 minio、aliyun）
     * value: OssClient 实例
     */
    private static final Map<String, OssClient> CLIENT_CACHE = new ConcurrentHashMap<>();

    /**
     * 默认配置键
     */
    private static volatile String defaultConfigKey;

    private OssFactory() {
    }

    /**
     * 注册 OSS 客户端
     * 如果配置未变化，不会重新创建客户端
     *
     * @param configKey  配置键
     * @param properties OSS 配置属性
     */
    public static synchronized void register(String configKey, OssProperties properties) {
        // 检查是否已存在相同配置的客户端
        OssClient existingClient = CLIENT_CACHE.get(configKey);
        if (existingClient != null && existingClient.checkPropertiesSame(properties)) {
            log.debug("OSS 客户端 [{}] 配置未变化，跳过注册", configKey);
            return;
        }
        // 创建新的客户端实例
        OssClient client = new OssClient(configKey, properties);
        CLIENT_CACHE.put(configKey, client);
        // 如果是第一个注册的客户端，设为默认
        if (defaultConfigKey == null) {
            defaultConfigKey = configKey;
        }
        log.info("OSS 客户端 [{}] 注册成功", configKey);
    }

    /**
     * 获取默认的 OSS 客户端
     *
     * @return OssClient 实例
     * @throws OssException 如果没有注册任何客户端
     */
    public static OssClient instance() {
        if (defaultConfigKey == null) {
            throw new OssException("未配置默认的 OSS 客户端，请先调用 register 方法注册");
        }
        return instance(defaultConfigKey);
    }

    /**
     * 获取指定配置键的 OSS 客户端
     *
     * @param configKey 配置键
     * @return OssClient 实例
     * @throws OssException 如果指定的客户端不存在
     */
    public static OssClient instance(String configKey) {
        OssClient client = CLIENT_CACHE.get(configKey);
        if (client == null) {
            throw new OssException("未找到 OSS 客户端 [" + configKey + "]，请先注册");
        }
        return client;
    }

    /**
     * 设置默认配置键
     *
     * @param configKey 配置键
     */
    public static void setDefaultConfigKey(String configKey) {
        defaultConfigKey = configKey;
    }

    /**
     * 移除指定的 OSS 客户端
     *
     * @param configKey 配置键
     */
    public static void remove(String configKey) {
        CLIENT_CACHE.remove(configKey);
        if (configKey.equals(defaultConfigKey)) {
            defaultConfigKey = CLIENT_CACHE.isEmpty() ? null : CLIENT_CACHE.keySet().iterator().next();
        }
    }

    /**
     * 获取所有已注册的配置键
     */
    public static java.util.Set<String> getConfigKeys() {
        return CLIENT_CACHE.keySet();
    }
}
