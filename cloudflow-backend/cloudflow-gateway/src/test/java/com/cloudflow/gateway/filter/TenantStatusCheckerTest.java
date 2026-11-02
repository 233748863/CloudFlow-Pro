package com.cloudflow.gateway.filter;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TenantStatusCheckerTest {
    private TenantStatusChecker checker(ExchangeFunction exchange) {
        RuntimeSysConfigService config = mock(RuntimeSysConfigService.class);
        when(config.getLong(anyString(), anyLong())).thenAnswer(call -> call.getArgument(1));
        TenantStatusChecker checker = new TenantStatusChecker(WebClient.builder().exchangeFunction(exchange), config);
        checker.init();
        return checker;
    }

    private Mono<ClientResponse> response(String json) {
        return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", "application/json").body(json).build());
    }

    @Test
    void disabledTenantIsRejectedAndCached() {
        ExchangeFunction exchange = mock(ExchangeFunction.class);
        when(exchange.exchange(any())).thenReturn(response("{\"code\":200,\"data\":{\"available\":false,\"reason\":\"DISABLED\"}}"));
        TenantStatusChecker checker = checker(exchange);
        assertFalse(checker.isAvailable(42L).block());
        assertFalse(checker.isAvailable(42L).block());
        verify(exchange, times(1)).exchange(any());
    }

    @Test
    void remoteFailureIsAllowedWithoutCaching() {
        ExchangeFunction exchange = mock(ExchangeFunction.class);
        when(exchange.exchange(any())).thenReturn(Mono.error(new IllegalStateException("unavailable")),
                response("{\"data\":{\"available\":false}}"));
        TenantStatusChecker checker = checker(exchange);
        assertTrue(checker.isAvailable(42L).block());
        assertFalse(checker.isAvailable(42L).block());
        verify(exchange, times(2)).exchange(any());
    }

    @Test
    void malformedWrapperUsesFailurePolicyAndDoesNotCache() {
        ExchangeFunction exchange = mock(ExchangeFunction.class);
        when(exchange.exchange(any())).thenReturn(response("{\"available\":false}"),
                response("{\"data\":{\"available\":false}}"));
        TenantStatusChecker checker = checker(exchange);
        assertTrue(checker.isAvailable(42L).block());
        assertFalse(checker.isAvailable(42L).block());
        verify(exchange, times(2)).exchange(any());
    }
}
