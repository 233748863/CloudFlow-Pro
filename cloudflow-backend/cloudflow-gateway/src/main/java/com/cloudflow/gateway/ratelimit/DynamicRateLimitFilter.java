package com.cloudflow.gateway.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.data.redis.connection.ReactiveSubscription;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.ReactiveRedisMessageListenerContainer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * GOV-P1-1 API 动态限流过滤器（网关侧）。
 *
 * <ul>
 *   <li>启动期从 Redis Hash {@code cloudflow:ratelimit:rules:active} 加载全量 ACTIVE 规则。</li>
 *   <li>订阅 Redis pubsub 通道 {@code cloudflow:ratelimit:rules}，收到 RELOAD 后即时刷新本地缓存。</li>
 *   <li>每个请求按 {@code priority} 升序匹配规则；命中后用 INCR + EXPIRE 做时间窗口计数。</li>
 *   <li>超额行为：REJECT 直接 429；LOG 仅记日志放行；QUEUE 当前按 LOG 处理（后续可扩展为延迟放行）。</li>
 * </ul>
 *
 * <p>顺序 -150：位于 {@link com.cloudflow.gateway.filter.InnerPathBlockFilter} (-200) 之后、
 * {@link com.cloudflow.gateway.filter.AuthFilter} (-100) 之前；
 * 这样 inner 路径已先被 403、限流命中后无需再走鉴权浪费 Redis token 查询。
 */
@Slf4j
@Component
public class DynamicRateLimitFilter implements GlobalFilter, Ordered {

    public static final String REDIS_HASH_KEY = "cloudflow:ratelimit:rules:active";
    public static final String REDIS_CHANNEL = "cloudflow:ratelimit:rules";
    public static final String RELOAD_MESSAGE = "RELOAD";

    private static final String COUNTER_KEY_PREFIX = "ratelimit:";

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    private final AtomicReference<List<SysApiRatelimitRuleSnapshot>> activeRulesRef = new AtomicReference<>(List.of());

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @Autowired
    private ReactiveStringRedisTemplate reactiveStringRedisTemplate;

    @Autowired
    private ReactiveRedisMessageListenerContainer reactiveRedisMessageListenerContainer;

    @Autowired
    private ObjectMapper objectMapper;

    @PostConstruct
    public void init() {
        reloadFromRedis();
        reactiveRedisMessageListenerContainer.receive(ChannelTopic.of(REDIS_CHANNEL))
                .map(ReactiveSubscription.Message::getMessage)
                .doOnNext(msg -> {
                    if (RELOAD_MESSAGE.equalsIgnoreCase(msg)) {
                        reloadFromRedis();
                    }
                })
                .onErrorContinue((err, val) -> log.warn("API 限流规则订阅异常: {}", err.getMessage()))
                .subscribe();
        log.info("DynamicRateLimitFilter 已订阅 Redis 通道 {}, 当前生效规则数={}", REDIS_CHANNEL, activeRulesRef.get().size());
    }

    private void reloadFromRedis() {
        try {
            Map<Object, Object> entries = stringRedisTemplate.opsForHash().entries(REDIS_HASH_KEY);
            List<SysApiRatelimitRuleSnapshot> snapshots = new ArrayList<>(entries.size());
            for (Map.Entry<Object, Object> entry : entries.entrySet()) {
                try {
                    SysApiRatelimitRuleSnapshot rule = objectMapper.readValue(
                            String.valueOf(entry.getValue()), SysApiRatelimitRuleSnapshot.class);
                    if (rule != null && rule.getId() != null && StringUtils.hasText(rule.getPathPattern())) {
                        snapshots.add(rule);
                    }
                } catch (Exception ex) {
                    log.warn("解析 API 限流规则失败 key={} err={}", entry.getKey(), ex.getMessage());
                }
            }
            snapshots.sort(Comparator.comparingInt(r -> r.getPriority() == null ? 100 : r.getPriority()));
            activeRulesRef.set(snapshots);
            log.info("API 限流规则缓存已刷新, 规则数={}", snapshots.size());
        } catch (Exception e) {
            log.error("加载 API 限流规则失败", e);
        }
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        List<SysApiRatelimitRuleSnapshot> rules = activeRulesRef.get();
        if (rules.isEmpty()) {
            return chain.filter(exchange);
        }

        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        String method = request.getMethod() == null ? "GET" : request.getMethod().name();

        SysApiRatelimitRuleSnapshot hit = matchRule(rules, path, method);
        if (hit == null) {
            return chain.filter(exchange);
        }

        String dimensionKey = resolveDimensionKey(exchange, hit.getDimension());
        String counterKey = COUNTER_KEY_PREFIX + hit.getId() + ":" + dimensionKey;
        int rps = hit.getRps() == null ? 0 : hit.getRps();
        int burst = hit.getBurst() == null ? rps : Math.max(rps, hit.getBurst());
        int windowSeconds = hit.getWindowSeconds() == null || hit.getWindowSeconds() <= 0 ? 1 : hit.getWindowSeconds();
        if (rps <= 0) {
            return chain.filter(exchange);
        }

        return reactiveStringRedisTemplate.opsForValue().increment(counterKey)
                .flatMap(count -> {
                    Mono<Boolean> ensureTtl = (count != null && count == 1L)
                            ? reactiveStringRedisTemplate.expire(counterKey, Duration.ofSeconds(windowSeconds)).onErrorReturn(true)
                            : Mono.just(true);
                    return ensureTtl.then(Mono.just(count == null ? 0L : count));
                })
                .flatMap(count -> {
                    if (count <= burst) {
                        return chain.filter(exchange);
                    }
                    return onExceeded(exchange, chain, hit, count);
                })
                .onErrorResume(err -> {
                    log.warn("API 限流计数异常 rule={} key={} err={}", hit.getRuleCode(), counterKey, err.getMessage());
                    return chain.filter(exchange);
                });
    }

    private SysApiRatelimitRuleSnapshot matchRule(List<SysApiRatelimitRuleSnapshot> rules, String path, String method) {
        for (SysApiRatelimitRuleSnapshot rule : rules) {
            if (!"ACTIVE".equalsIgnoreCase(rule.getStatus())) {
                continue;
            }
            String httpMethod = rule.getHttpMethod();
            if (StringUtils.hasText(httpMethod) && !"ALL".equalsIgnoreCase(httpMethod)
                    && !httpMethod.equalsIgnoreCase(method)) {
                continue;
            }
            String pattern = rule.getPathPattern();
            if (StringUtils.hasText(pattern) && pathMatcher.match(pattern, path)) {
                return rule;
            }
        }
        return null;
    }

    private String resolveDimensionKey(ServerWebExchange exchange, String dimension) {
        if (!StringUtils.hasText(dimension)) {
            dimension = "IP";
        }
        switch (dimension.toUpperCase()) {
            case "GLOBAL":
                return "GLOBAL";
            case "USER":
                return resolveUserKey(exchange);
            case "TENANT":
                String tenantId = exchange.getRequest().getHeaders().getFirst("X-Tenant-Id");
                return StringUtils.hasText(tenantId) ? tenantId : "anonymous";
            case "IP":
            default:
                return resolveClientIp(exchange);
        }
    }

    private String resolveUserKey(ServerWebExchange exchange) {
        String authorization = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (StringUtils.hasText(authorization) && authorization.startsWith("Bearer ")) {
            String token = authorization.substring(7);
            // 用 token 末 16 位作 user 标识，避免直接依赖 Sa-Token 解析造成同步阻塞
            return token.length() <= 16 ? token : token.substring(token.length() - 16);
        }
        return resolveClientIp(exchange);
    }

    private String resolveClientIp(ServerWebExchange exchange) {
        String forwarded = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (StringUtils.hasText(forwarded)) {
            return forwarded.split(",")[0].trim();
        }
        if (exchange.getRequest().getRemoteAddress() != null
                && exchange.getRequest().getRemoteAddress().getAddress() != null) {
            return exchange.getRequest().getRemoteAddress().getAddress().getHostAddress();
        }
        return "unknown";
    }

    private Mono<Void> onExceeded(ServerWebExchange exchange, GatewayFilterChain chain,
                                  SysApiRatelimitRuleSnapshot rule, long count) {
        String strategy = StringUtils.hasText(rule.getRejectStrategy()) ? rule.getRejectStrategy() : "REJECT";
        if ("LOG".equalsIgnoreCase(strategy) || "QUEUE".equalsIgnoreCase(strategy)) {
            log.warn("API 限流命中(放行) rule={} path={} dim={} rps={} burst={} count={}",
                    rule.getRuleCode(), exchange.getRequest().getURI().getPath(),
                    rule.getDimension(), rule.getRps(), rule.getBurst(), count);
            return chain.filter(exchange);
        }
        log.warn("API 限流命中(拒绝) rule={} path={} dim={} rps={} burst={} count={}",
                rule.getRuleCode(), exchange.getRequest().getURI().getPath(),
                rule.getDimension(), rule.getRps(), rule.getBurst(), count);
        return tooManyRequests(exchange, rule);
    }

    private Mono<Void> tooManyRequests(ServerWebExchange exchange, SysApiRatelimitRuleSnapshot rule) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        response.getHeaders().add("Retry-After", "1");
        response.getHeaders().add("X-RateLimit-Rule", rule.getRuleCode() == null ? "" : rule.getRuleCode());
        String body = "{\"code\":429,\"msg\":\"请求过于频繁，请稍后再试\",\"rule\":\""
                + (rule.getRuleCode() == null ? "" : rule.getRuleCode()) + "\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -150;
    }
}
