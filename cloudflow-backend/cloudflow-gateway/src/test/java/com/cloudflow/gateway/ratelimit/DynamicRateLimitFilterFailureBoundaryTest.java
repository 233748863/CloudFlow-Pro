package com.cloudflow.gateway.ratelimit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.lang.reflect.Field;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DynamicRateLimitFilterFailureBoundaryTest {

    private static final String COUNTER_KEY = "ratelimit:6:GLOBAL";

    @Mock private ReactiveStringRedisTemplate redis;
    @Mock private ReactiveValueOperations<String, String> values;
    @InjectMocks private DynamicRateLimitFilter filter;

    private AutoCloseable mocks;
    private ServerWebExchange exchange;
    private ServerHttpResponse response;
    private GatewayFilterChain chain;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        mocks = MockitoAnnotations.openMocks(this);
        SysApiRatelimitRuleSnapshot rule = new SysApiRatelimitRuleSnapshot();
        rule.setId(6L);
        rule.setRuleCode("auth.logout.guard");
        rule.setPathPattern("/auth/logout");
        rule.setHttpMethod("POST");
        rule.setDimension("GLOBAL");
        rule.setRps(30);
        rule.setBurst(30);
        rule.setWindowSeconds(60);
        rule.setStatus("ACTIVE");
        rule.setRejectStrategy("REJECT");
        Field rulesField = DynamicRateLimitFilter.class.getDeclaredField("activeRulesRef");
        rulesField.setAccessible(true);
        ((AtomicReference<List<SysApiRatelimitRuleSnapshot>>) rulesField.get(filter)).set(List.of(rule));

        exchange = mock(ServerWebExchange.class);
        ServerHttpRequest request = mock(ServerHttpRequest.class);
        response = mock(ServerHttpResponse.class);
        chain = mock(GatewayFilterChain.class);
        when(exchange.getRequest()).thenReturn(request);
        when(exchange.getResponse()).thenReturn(response);
        when(request.getURI()).thenReturn(URI.create("http://localhost/auth/logout"));
        when(request.getMethod()).thenReturn(HttpMethod.POST);
        when(response.getHeaders()).thenReturn(new HttpHeaders());
        when(response.bufferFactory()).thenReturn(DefaultDataBufferFactory.sharedInstance);
        when(response.writeWith(any())).thenReturn(Mono.empty());
        when(redis.opsForValue()).thenReturn(values);
        when(redis.getExpire(COUNTER_KEY)).thenReturn(Mono.just(Duration.ofSeconds(60)));
        when(redis.expire(anyString(), any(Duration.class))).thenReturn(Mono.just(true));
    }

    @AfterEach
    void close() throws Exception {
        mocks.close();
    }

    @Test
    void downstreamFailureIsPropagatedWithoutRepeatingRequest() {
        IllegalStateException failure = new IllegalStateException("business failed after write");
        when(values.increment(COUNTER_KEY)).thenReturn(Mono.just(1L));
        when(chain.filter(exchange)).thenReturn(Mono.error(failure));

        IllegalStateException actual = assertThrows(IllegalStateException.class,
                () -> filter.filter(exchange, chain).block(Duration.ofSeconds(5)));

        assertSame(failure, actual);
        verify(chain).filter(exchange);
        verify(values).increment(COUNTER_KEY);
    }

    @Test
    void counterFailureKeepsExistingAllowPolicyAndForwardsOnce() {
        when(values.increment(COUNTER_KEY)).thenReturn(Mono.error(new IllegalStateException("redis unavailable")));
        when(chain.filter(exchange)).thenReturn(Mono.empty());

        filter.filter(exchange, chain).block(Duration.ofSeconds(5));

        verify(chain).filter(exchange);
        verify(values).increment(COUNTER_KEY);
    }

    @Test
    void downstreamFailureAfterCounterFailureIsStillNotRepeated() {
        IllegalStateException failure = new IllegalStateException("business failed");
        when(values.increment(COUNTER_KEY)).thenReturn(Mono.error(new IllegalStateException("redis unavailable")));
        when(chain.filter(exchange)).thenReturn(Mono.error(failure));

        IllegalStateException actual = assertThrows(IllegalStateException.class,
                () -> filter.filter(exchange, chain).block(Duration.ofSeconds(5)));

        assertSame(failure, actual);
        verify(chain).filter(exchange);
    }

    @Test
    void exceededLimitStillReturns429WithoutForwarding() {
        when(values.increment(COUNTER_KEY)).thenReturn(Mono.just(31L));

        filter.filter(exchange, chain).block(Duration.ofSeconds(5));

        verify(response).setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        assertEquals("auth.logout.guard", response.getHeaders().getFirst("X-RateLimit-Rule"));
        verifyNoInteractions(chain);
    }
}
