package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.gateway.config.GatewayAuthProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuthFilterThreadBoundaryTest {

    @Mock private TokenService tokenService;
    @Mock private GatewayAuthProperties authProperties;
    @Mock private TenantStatusChecker tenantStatusChecker;
    @InjectMocks private AuthFilter filter;

    private AutoCloseable mocks;
    private ServerWebExchange exchange;
    private ServerHttpRequest request;
    private ServerHttpResponse response;
    private GatewayFilterChain chain;
    private HttpHeaders requestHeaders;
    private final AtomicReference<Thread> callerThread = new AtomicReference<>();

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        exchange = mock(ServerWebExchange.class);
        request = mock(ServerHttpRequest.class);
        response = mock(ServerHttpResponse.class);
        chain = mock(GatewayFilterChain.class);
        requestHeaders = new HttpHeaders();
        requestHeaders.setBearerAuth("valid-token");
        requestHeaders.set(SecurityConstants.TENANT_ID_HEADER, "100002");
        requestHeaders.set("X-User-Id", "forged-user");
        requestHeaders.set(SecurityConstants.INNER_CALL_HEADER, "forged-inner");
        LinkedMultiValueMap<String, HttpCookie> cookies = new LinkedMultiValueMap<>();
        cookies.add(AuthCookieSupport.AUTH_COOKIE_NAME,
                new HttpCookie(AuthCookieSupport.AUTH_COOKIE_NAME, "valid-token"));
        cookies.add(AuthCookieSupport.CSRF_COOKIE_NAME,
                new HttpCookie(AuthCookieSupport.CSRF_COOKIE_NAME, "csrf-value"));
        when(exchange.getRequest()).thenReturn(request);
        when(exchange.getResponse()).thenReturn(response);
        when(request.getURI()).thenReturn(URI.create("http://localhost/auth/logout"));
        when(request.getHeaders()).thenReturn(requestHeaders);
        when(request.getCookies()).thenReturn(cookies);
        when(response.getHeaders()).thenReturn(new HttpHeaders());
        when(response.bufferFactory()).thenReturn(DefaultDataBufferFactory.sharedInstance);
        when(response.writeWith(any())).thenReturn(Mono.empty());
        when(authProperties.effectiveWhitelist()).thenReturn(List.of());
    }

    @AfterEach
    void close() throws Exception {
        mocks.close();
    }

    @Test
    void validRequestVerifiesAndRefreshesCookiesOffCallbackThreadThenForwardsOnce() {
        AtomicReference<Thread> verifyThread = new AtomicReference<>();
        when(tokenService.verifyToken("valid-token")).thenAnswer(call -> {
            assertBlockingWorkThread();
            verifyThread.set(Thread.currentThread());
            return Map.of("tenantId", 100001L);
        });
        when(tokenService.getExpirationSeconds()).thenAnswer(call -> {
            assertBlockingWorkThread();
            assertEquals(verifyThread.get(), Thread.currentThread());
            return 1800L;
        });
        when(tenantStatusChecker.isAvailable(100001L)).thenReturn(Mono.just(true));

        HttpHeaders forwardedHeaders = new HttpHeaders();
        forwardedHeaders.putAll(requestHeaders);
        ServerHttpRequest.Builder requestBuilder = mock(ServerHttpRequest.Builder.class);
        ServerHttpRequest forwardedRequest = mock(ServerHttpRequest.class);
        when(request.mutate()).thenReturn(requestBuilder);
        when(requestBuilder.headers(any())).thenAnswer(call -> {
            Consumer<HttpHeaders> updater = call.getArgument(0);
            updater.accept(forwardedHeaders);
            return requestBuilder;
        });
        when(requestBuilder.build()).thenReturn(forwardedRequest);
        ServerWebExchange.Builder exchangeBuilder = mock(ServerWebExchange.Builder.class);
        ServerWebExchange forwardedExchange = mock(ServerWebExchange.class);
        when(exchange.mutate()).thenReturn(exchangeBuilder);
        when(exchangeBuilder.request(forwardedRequest)).thenReturn(exchangeBuilder);
        when(exchangeBuilder.build()).thenReturn(forwardedExchange);
        when(chain.filter(forwardedExchange)).thenReturn(Mono.empty());

        invokeFromRedisCallbackThread();

        verify(chain).filter(forwardedExchange);
        verify(tokenService).verifyToken("valid-token");
        verify(tokenService).getExpirationSeconds();
        verify(response, never()).setStatusCode(any());
        assertEquals("Bearer valid-token", forwardedHeaders.getFirst("Authorization"));
        assertEquals("100001", forwardedHeaders.getFirst(SecurityConstants.TENANT_ID_HEADER));
        assertNull(forwardedHeaders.getFirst("X-User-Id"));
        assertNull(forwardedHeaders.getFirst(SecurityConstants.INNER_CALL_HEADER));
    }

    @Test
    void invalidTokenStillReturnsUnauthorizedWithoutForwarding() {
        when(tokenService.verifyToken("valid-token")).thenAnswer(call -> {
            assertBlockingWorkThread();
            return null;
        });

        invokeFromRedisCallbackThread();

        verify(response).setStatusCode(HttpStatus.UNAUTHORIZED);
        verify(response).addCookie(ResponseCookie.from(AuthCookieSupport.AUTH_COOKIE_NAME, "")
                .httpOnly(true).secure(false).path("/").sameSite(AuthCookieSupport.SAME_SITE)
                .maxAge(Duration.ZERO).build());
        verifyNoInteractions(chain, tenantStatusChecker);
        verify(tokenService, never()).getExpirationSeconds();
    }

    @Test
    void disabledTenantStillReturnsForbiddenWithoutForwarding() {
        when(tokenService.verifyToken("valid-token")).thenAnswer(call -> {
            assertBlockingWorkThread();
            return Map.of("tenantId", 100001L);
        });
        when(tokenService.getExpirationSeconds()).thenReturn(1800L);
        when(tenantStatusChecker.isAvailable(100001L)).thenReturn(Mono.just(false));

        invokeFromRedisCallbackThread();

        verify(response).setStatusCode(HttpStatus.FORBIDDEN);
        verifyNoInteractions(chain);
    }

    private void invokeFromRedisCallbackThread() {
        Scheduler callbackScheduler = Schedulers.newSingle("redisson-netty-auth-test");
        try {
            Mono.defer(() -> {
                callerThread.set(Thread.currentThread());
                assertTrue(Schedulers.isInNonBlockingThread());
                return filter.filter(exchange, chain);
            }).subscribeOn(callbackScheduler).block(Duration.ofSeconds(5));
        } finally {
            callbackScheduler.dispose();
        }
    }

    private void assertBlockingWorkThread() {
        assertNotSame(callerThread.get(), Thread.currentThread());
        assertFalse(Schedulers.isInNonBlockingThread());
        assertFalse(Thread.currentThread().getName().startsWith("redisson-netty"));
    }
}
