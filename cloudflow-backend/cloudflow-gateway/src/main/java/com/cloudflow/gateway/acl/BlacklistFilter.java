package com.cloudflow.gateway.acl;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.data.redis.connection.ReactiveSubscription;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.ReactiveRedisMessageListenerContainer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * GOV-P0-1 黑白名单过滤器(网关侧)。
 *
 * <ul>
 *   <li>启动期从 Redis Hash {@code cloudflow:acl:ip:active} 加载全量 ACTIVE IP 规则。</li>
 *   <li>订阅 Redis pubsub 通道 {@code cloudflow:acl:ip}, 收到 RELOAD 后即时刷新本地缓存。</li>
 *   <li>每个请求按 priority 升序匹配: 全局存在 WHITE 规则时未命中即 403; 命中 BLACK 即 403。</li>
 *   <li>用户黑名单复用 auth 模块写的 Redis KEY {@code acl:user:black:{userId}}, 命中即 403。</li>
 * </ul>
 *
 * <p>顺序 -175: 位于 {@link com.cloudflow.gateway.filter.InnerPathBlockFilter} (-200) 之后、
 * {@link com.cloudflow.gateway.ratelimit.DynamicRateLimitFilter} (-150) 之前;
 * 这样 inner 路径已先被 403, 黑名单命中后无需再走限流计数浪费 Redis。
 */
@Slf4j
@Component
public class BlacklistFilter implements GlobalFilter, Ordered {

    public static final String REDIS_HASH_KEY = "cloudflow:acl:ip:active";
    public static final String REDIS_CHANNEL = "cloudflow:acl:ip";
    public static final String RELOAD_MESSAGE = "RELOAD";
    public static final String USER_BLACK_PREFIX = "acl:user:black:";

    private final AtomicReference<List<IpAclSnapshot>> activeRulesRef = new AtomicReference<>(List.of());

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

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
                .onErrorContinue((err, val) -> log.warn("IP 黑白名单订阅异常: {}", err.getMessage()))
                .subscribe();
        log.info("BlacklistFilter 已订阅 Redis 通道 {}, 当前生效规则数={}", REDIS_CHANNEL, activeRulesRef.get().size());
    }

    private void reloadFromRedis() {
        try {
            Map<Object, Object> entries = stringRedisTemplate.opsForHash().entries(REDIS_HASH_KEY);
            List<IpAclSnapshot> snapshots = new ArrayList<>(entries.size());
            LocalDateTime now = LocalDateTime.now();
            for (Map.Entry<Object, Object> entry : entries.entrySet()) {
                try {
                    IpAclSnapshot rule = objectMapper.readValue(
                            String.valueOf(entry.getValue()), IpAclSnapshot.class);
                    if (rule == null || !StringUtils.hasText(rule.getIpPattern())) {
                        continue;
                    }
                    if (rule.getExpireAt() != null && rule.getExpireAt().isBefore(now)) {
                        continue;
                    }
                    snapshots.add(rule);
                } catch (Exception ex) {
                    log.warn("解析 IP 黑白名单规则失败 key={} err={}", entry.getKey(), ex.getMessage());
                }
            }
            snapshots.sort(Comparator.comparingInt(r -> r.getPriority() == null ? 100 : r.getPriority()));
            activeRulesRef.set(snapshots);
            log.info("IP 黑白名单缓存已刷新, 规则数={}", snapshots.size());
        } catch (Exception e) {
            log.error("加载 IP 黑白名单失败", e);
        }
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String ip = resolveClientIp(exchange);

        List<IpAclSnapshot> rules = activeRulesRef.get();
        if (!rules.isEmpty()) {
            IpAclSnapshot hitBlack = null;
            boolean hasWhiteRule = false;
            boolean whiteMatched = false;
            for (IpAclSnapshot rule : rules) {
                if (!"ACTIVE".equalsIgnoreCase(rule.getStatus())) {
                    continue;
                }
                boolean matched = ipMatches(ip, rule);
                if ("WHITE".equalsIgnoreCase(rule.getMode())) {
                    hasWhiteRule = true;
                    if (matched) {
                        whiteMatched = true;
                    }
                } else if ("BLACK".equalsIgnoreCase(rule.getMode()) && matched && hitBlack == null) {
                    hitBlack = rule;
                }
            }
            if (whiteMatched) {
                return chain.filter(exchange);
            }
            if (hasWhiteRule) {
                log.warn("IP {} 不在白名单, 拒绝访问 path={}", ip, request.getURI().getPath());
                return forbidden(exchange, "IP_NOT_WHITELISTED", "IP 不在访问白名单内");
            }
            if (hitBlack != null) {
                log.warn("IP {} 命中黑名单 rule={} path={}", ip, hitBlack.getRuleCode(), request.getURI().getPath());
                return forbidden(exchange, hitBlack.getRuleCode(), "IP 被黑名单禁止访问");
            }
        }

        String userId = request.getHeaders().getFirst("X-User-Id");
        if (StringUtils.hasText(userId)) {
            try {
                Boolean banned = stringRedisTemplate.hasKey(USER_BLACK_PREFIX + userId);
                if (Boolean.TRUE.equals(banned)) {
                    log.warn("用户 {} 命中黑名单, path={}", userId, request.getURI().getPath());
                    return forbidden(exchange, "USER_BANNED", "用户已被禁止访问");
                }
            } catch (Exception e) {
                log.warn("查询用户黑名单异常 userId={} err={}", userId, e.getMessage());
            }
        }

        return chain.filter(exchange);
    }

    boolean ipMatches(String ip, IpAclSnapshot rule) {
        if (!StringUtils.hasText(ip) || !StringUtils.hasText(rule.getIpPattern())) {
            return false;
        }
        String type = StringUtils.hasText(rule.getRuleType()) ? rule.getRuleType().toUpperCase() : "EXACT";
        try {
            switch (type) {
                case "CIDR":
                    return cidrMatches(ip, rule.getIpPattern());
                case "RANGE":
                    return rangeMatches(ip, rule.getIpPattern());
                case "EXACT":
                default:
                    return rule.getIpPattern().equals(ip);
            }
        } catch (Exception e) {
            log.warn("IP 匹配异常 ip={} rule={} err={}", ip, rule.getIpPattern(), e.getMessage());
            return false;
        }
    }

    private boolean cidrMatches(String ip, String cidr) throws Exception {
        int slash = cidr.indexOf('/');
        if (slash < 0) {
            return cidr.equals(ip);
        }
        String base = cidr.substring(0, slash);
        int prefix = Integer.parseInt(cidr.substring(slash + 1));
        byte[] ipBytes = InetAddress.getByName(ip).getAddress();
        byte[] baseBytes = InetAddress.getByName(base).getAddress();
        if (ipBytes.length != baseBytes.length) {
            return false;
        }
        int fullBytes = prefix / 8;
        int rem = prefix % 8;
        for (int i = 0; i < fullBytes; i++) {
            if (ipBytes[i] != baseBytes[i]) {
                return false;
            }
        }
        if (rem == 0) {
            return true;
        }
        int mask = 0xFF << (8 - rem);
        return (ipBytes[fullBytes] & mask) == (baseBytes[fullBytes] & mask);
    }

    private boolean rangeMatches(String ip, String range) throws Exception {
        int dash = range.indexOf('-');
        if (dash < 0) {
            return range.equals(ip);
        }
        long ipLong = ipToLong(ip);
        long lo = ipToLong(range.substring(0, dash).trim());
        long hi = ipToLong(range.substring(dash + 1).trim());
        return ipLong >= Math.min(lo, hi) && ipLong <= Math.max(lo, hi);
    }

    private long ipToLong(String ip) throws Exception {
        byte[] bytes = InetAddress.getByName(ip).getAddress();
        long v = 0L;
        for (byte b : bytes) {
            v = (v << 8) | (b & 0xFF);
        }
        return v;
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

    private Mono<Void> forbidden(ServerWebExchange exchange, String code, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        response.getHeaders().add("X-Acl-Rule", code == null ? "" : code);
        String body = "{\"code\":403,\"msg\":\"" + message + "\",\"rule\":\"" + (code == null ? "" : code) + "\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -175;
    }
}
