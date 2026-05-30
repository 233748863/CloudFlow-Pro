package com.cloudflow.auth.config;

import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 启动期将 {@code sys.sensitive.maxRecursionDepth} 配置注入 {@link SensitiveUtils} 的静态字段。
 * <p>cloudflow-common-sensitive 不依赖 redis，配置注入由依赖完整的 cloudflow-auth 模块完成。
 * 运行时改 sys_config 需重启服务才会生效（递归深度属安全防御参数，运行时频繁切换不必要）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SensitiveConfigBootstrap {

    private static final int DEFAULT_DEPTH = 8;

    private final SysConfigHelper sysConfigHelper;

    @PostConstruct
    public void init() {
        int depth = sysConfigHelper.getConfigInt("sys.sensitive.maxRecursionDepth", DEFAULT_DEPTH);
        SensitiveUtils.setMaxRecursionDepth(depth);
        log.info("SensitiveUtils.maxRecursionDepth 已根据 sys_config 设置为 {}", depth);
    }
}
