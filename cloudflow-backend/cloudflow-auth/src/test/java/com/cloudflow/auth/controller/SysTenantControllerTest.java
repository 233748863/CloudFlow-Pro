package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.dto.TenantStatisticsDTO;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.service.SysTenantService;
import com.cloudflow.common.core.domain.R;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SysTenantControllerTest {

    @Test
    void removeShouldRejectWhenTenantStillHasActiveUsers() {
        AtomicBoolean removeCalled = new AtomicBoolean(false);

        SysTenantService tenantService = proxy(SysTenantService.class, (methodName, args) -> {
            if ("getById".equals(methodName)) {
                SysTenant tenant = new SysTenant();
                tenant.setTenantId(200003L);
                return tenant;
            }
            if ("countActiveUsers".equals(methodName)) {
                return 3L;
            }
            if ("removeById".equals(methodName)) {
                removeCalled.set(true);
                return true;
            }
            return null;
        });

        SysTenantController controller = new SysTenantController(tenantService);
        R<Void> result = controller.remove(200003L);

        assertEquals(R.FAIL, result.getCode());
        assertTrue(result.getMsg().contains("3 个有效用户"));
        assertTrue(!removeCalled.get());
    }

    @Test
    void statisticsBatchShouldReturnSnapshotList() {
        SysTenantService tenantService = proxy(SysTenantService.class, (methodName, args) -> {
            if ("getTenantStatisticsBatch".equals(methodName)) {
                return Arrays.asList(
                    new TenantStatisticsDTO(200001L, false, false, false, 8L),
                    new TenantStatisticsDTO(200002L, true, true, true, 20L)
                );
            }
            return null;
        });

        SysTenantController controller = new SysTenantController(tenantService);
        R<List<TenantStatisticsDTO>> result = controller.getTenantStatisticsBatch(Arrays.asList(200001L, 200002L));

        assertEquals(R.SUCCESS, result.getCode());
        assertNotNull(result.getData());
        assertEquals(2, result.getData().size());
        assertEquals(200001L, result.getData().get(0).getTenantId());
        assertEquals(8L, result.getData().get(0).getUserCount());
    }

    @Test
    void refreshStorageShouldReturnSummary() {
        SysTenantService tenantService = proxy(SysTenantService.class, (methodName, args) -> {
            if ("getById".equals(methodName)) {
                SysTenant tenant = new SysTenant();
                tenant.setTenantId(200010L);
                return tenant;
            }
            if ("refreshTenantStorageSummary".equals(methodName)) {
                return new TenantStorageSummaryDTO(200010L, 10240L, 256L, 9984L, 2.5D);
            }
            return null;
        });

        SysTenantController controller = new SysTenantController(tenantService);
        R<TenantStorageSummaryDTO> result = controller.refreshTenantStorage(200010L);

        assertEquals(R.SUCCESS, result.getCode());
        assertNotNull(result.getData());
        assertEquals(256L, result.getData().getStorageUsed());
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, Handler handler) {
        return (T) Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[]{type},
                (proxy, method, args) -> {
                    if ("toString".equals(method.getName())) {
                        return type.getSimpleName() + "Proxy";
                    }
                    if ("hashCode".equals(method.getName())) {
                        return System.identityHashCode(proxy);
                    }
                    if ("equals".equals(method.getName())) {
                        return proxy == args[0];
                    }
                    return handler.invoke(method.getName(), args);
                }
        );
    }

    @FunctionalInterface
    private interface Handler {
        Object invoke(String methodName, Object[] args);
    }
}