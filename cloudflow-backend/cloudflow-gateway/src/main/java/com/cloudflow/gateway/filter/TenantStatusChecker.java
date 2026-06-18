package com.cloudflow.gateway.filter;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Cache;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigChangeEvent;
import com.cloudflow.common.redis.config.SysConfigChangeListener;
import com.cloudflow.common.redis.config.SysConfigKeys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

/**
 * 租户运营状态网关侧拦截器（P2.4）。
 *
 * 业务背景：
 * - 运营在 sys_tenant 把某租户 status='1' 停用、或 expire_time 设为过去
 * - 该租户已签发的 token 仍有效（最长 24h），下游 Sa-Token 不会主动失活
 * - 因此必须在网关每次请求都校验"租户运营状态"，否则停用形同虚设
 *
 * 设计：
 * - Caffeine 本地缓存 60s（默认）；缓存命中直接返回，避免对 auth 服务的高并发轰炸
 * - 缓存未命中通过 WebClient 调 auth 服务 `/inner/auth/tenant/status/{id}`，
 *   走 spring-cloud-loadbalancer + @LoadBalanced 服务发现
 * - 调用失败回退为"允许通过"（fail-open）防止 auth 服务波动连带网关熔断；
 *   真正的拦截兜底由业务侧的 Sa-Token 验证 + DataPermission 解决
 */
@Slf4j
@Component
public class TenantStatusChecker implements SysConfigChangeListener {

    /** auth 服务在 Nacos 注册的服务名 */
    private static final String AUTH_SERVICE_NAME = "cloudflow-auth";

    private final WebClient webClient;
    private final RuntimeSysConfigService runtimeSysConfigService;

    private Cache<Long, Boolean> cache;

    public TenantStatusChecker(WebClient.Builder tenantStatusWebClientBuilder,
                               RuntimeSysConfigService runtimeSysConfigService) {
        this.webClient = tenantStatusWebClientBuilder.build();
        this.runtimeSysConfigService = runtimeSysConfigService;
    }

    @PostConstruct
    public void init() {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(runtimeSysConfigService.getLong(
                        SysConfigKeys.GATEWAY_TENANT_STATUS_CACHE_SECONDS,
                        60L)))
                .maximumSize(runtimeSysConfigService.getLong(
                        SysConfigKeys.GATEWAY_TENANT_STATUS_CACHE_MAX_SIZE,
                        1024L))
                .build();
    }

    /**
     * @return Mono.just(true) 可通过；Mono.just(false) 拒绝
     */
    public Mono<Boolean> isAvailable(Long tenantId) {
        if (tenantId == null) {
            // 未识别到租户，不在此处拦截，留给业务侧/网关其他过滤器处理
            return Mono.just(true);
        }
        Boolean cached = cache.getIfPresent(tenantId);
        if (cached != null) {
            return Mono.just(cached);
        }
        return webClient.get()
                .uri("http://" + AUTH_SERVICE_NAME + "/inner/auth/tenant/status/{id}", tenantId)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(runtimeSysConfigService.getLong(
                        SysConfigKeys.GATEWAY_TENANT_STATUS_TIMEOUT_SECONDS,
                        3L)))
                .map(this::parseAvailable)
                .doOnNext(ok -> cache.put(tenantId, ok))
                .onErrorResume(ex -> {
                    log.warn("查询租户状态失败，fail-open 放行: tenantId={}, err={}", tenantId, ex.getMessage());
                    // fail-open，但不写缓存避免下次还是被失败放行
                    return Mono.just(true);
                });
    }

    @SuppressWarnings("rawtypes")
    private boolean parseAvailable(Map body) {
        if (body == null) {
            return true;
        }
        Object data = body.get("data");
        if (data instanceof Map<?, ?> map) {
            Object available = map.get("available");
            return !Boolean.FALSE.equals(available);
        }
        // 兼容直接返回 {available, reason} 不包 R 的情况
        Object available = body.get("available");
        return !Boolean.FALSE.equals(available);
    }

    @Override
    public void onSysConfigChanged(SysConfigChangeEvent event) {
        String key = event.configKey();
        if (SysConfigKeys.GATEWAY_TENANT_STATUS_CACHE_SECONDS.equals(key)
                || SysConfigKeys.GATEWAY_TENANT_STATUS_CACHE_MAX_SIZE.equals(key)) {
            init();
            log.info("网关租户状态缓存配置已刷新: key={}", key);
        }
    }
}
