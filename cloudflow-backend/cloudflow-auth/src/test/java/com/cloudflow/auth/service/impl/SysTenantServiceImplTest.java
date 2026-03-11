package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.dto.TenantStatisticsDTO;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SysTenantServiceImplTest {

    @Test
    void isUserLimitReachedShouldReturnTrueWhenActiveUsersReachLimit() {
        SysTenantServiceImpl service = new SysTenantServiceImpl();

        SysTenant tenant = new SysTenant();
        tenant.setTenantId(200001L);
        tenant.setUserLimit(2);

        injectField(service, "baseMapper", proxy(SysTenantMapper.class, (methodName, args) -> {
            if ("selectById".equals(methodName)) {
                return tenant;
            }
            return null;
        }));
        injectField(service, "sysUserMapper", proxy(SysUserMapper.class, (methodName, args) -> {
            if ("selectMaps".equals(methodName)) {
                return List.of(Map.of("tenant_id", 200001L, "user_count", 2L));
            }
            return null;
        }));
        injectField(service, "sysFileMapper", proxy(SysFileMapper.class, (methodName, args) -> List.of()));

        assertTrue(service.isUserLimitReached(tenant.getTenantId()));
    }

    @Test
    void isUserLimitReachedShouldReturnFalseWhenLimitIsUnlimited() {
        SysTenantServiceImpl service = new SysTenantServiceImpl();

        SysTenant tenant = new SysTenant();
        tenant.setTenantId(200002L);
        tenant.setUserLimit(0);

        injectField(service, "baseMapper", proxy(SysTenantMapper.class, (methodName, args) -> {
            if ("selectById".equals(methodName)) {
                return tenant;
            }
            return null;
        }));
        injectField(service, "sysUserMapper", proxy(SysUserMapper.class, (methodName, args) -> List.of(Map.of("tenant_id", 200002L, "user_count", 99L))));
        injectField(service, "sysFileMapper", proxy(SysFileMapper.class, (methodName, args) -> List.of()));

        assertFalse(service.isUserLimitReached(tenant.getTenantId()));
    }

    @Test
    void getTenantStatisticsBatchShouldAggregateActiveUsers() {
        SysTenantServiceImpl service = new SysTenantServiceImpl();

        SysTenant firstTenant = new SysTenant();
        firstTenant.setTenantId(200011L);
        firstTenant.setStatus("0");
        firstTenant.setUserLimit(10);

        SysTenant secondTenant = new SysTenant();
        secondTenant.setTenantId(200012L);
        secondTenant.setStatus("1");
        secondTenant.setUserLimit(3);

        injectField(service, "baseMapper", proxy(SysTenantMapper.class, (methodName, args) -> {
            if ("selectBatchIds".equals(methodName)) {
                return List.of(firstTenant, secondTenant);
            }
            return null;
        }));
        injectField(service, "sysUserMapper", proxy(SysUserMapper.class, (methodName, args) -> {
            if ("selectMaps".equals(methodName)) {
                return List.of(
                    Map.of("tenant_id", 200011L, "user_count", 6L),
                    Map.of("tenant_id", 200012L, "user_count", 3L)
                );
            }
            return null;
        }));
        injectField(service, "sysFileMapper", proxy(SysFileMapper.class, (methodName, args) -> List.of()));

        List<TenantStatisticsDTO> result = service.getTenantStatisticsBatch(List.of(200011L, 200012L));

        assertEquals(2, result.size());
        assertEquals(200011L, result.get(0).getTenantId());
        assertEquals(6L, result.get(0).getUserCount());
        assertFalse(result.get(0).isUserLimitReached());
        assertTrue(result.get(1).isDisabled());
        assertTrue(result.get(1).isUserLimitReached());
    }

    @Test
    void hasAvailableStorageShouldUseActualBytesInsteadOfRoundedMegabytes() {
        SysTenantServiceImpl service = new SysTenantServiceImpl();

        SysTenant tenant = new SysTenant();
        tenant.setTenantId(200021L);
        tenant.setStorageLimit(10L);

        injectField(service, "baseMapper", proxy(SysTenantMapper.class, (methodName, args) -> {
            if ("selectById".equals(methodName)) {
                return tenant;
            }
            return null;
        }));
        injectField(service, "sysUserMapper", proxy(SysUserMapper.class, (methodName, args) -> List.of()));
        injectField(service, "sysFileMapper", proxy(SysFileMapper.class, (methodName, args) -> {
            if ("selectMaps".equals(methodName)) {
                return List.of(Map.of("tenant_id", 200021L, "total_bytes", 9L * 1024 * 1024 + 100L * 1024));
            }
            return null;
        }));

        assertTrue(service.hasAvailableStorage(200021L, 200L * 1024));
    }

    @Test
    void refreshTenantStorageSummaryShouldSyncActualUsage() {
        SysTenantServiceImpl service = new SysTenantServiceImpl();
        AtomicReference<SysTenant> updatedTenantRef = new AtomicReference<>();

        SysTenant tenant = new SysTenant();
        tenant.setTenantId(200022L);
        tenant.setStorageLimit(10240L);
        tenant.setStorageUsed(0L);

        injectField(service, "baseMapper", proxy(SysTenantMapper.class, (methodName, args) -> {
            if ("selectById".equals(methodName)) {
                return tenant;
            }
            if ("updateById".equals(methodName)) {
                updatedTenantRef.set((SysTenant) args[0]);
                return 1;
            }
            return null;
        }));
        injectField(service, "sysUserMapper", proxy(SysUserMapper.class, (methodName, args) -> List.of()));
        injectField(service, "sysFileMapper", proxy(SysFileMapper.class, (methodName, args) -> {
            if ("selectMaps".equals(methodName)) {
                return List.of(Map.of("tenant_id", 200022L, "total_bytes", 3L * 1024 * 1024 + 1L));
            }
            return null;
        }));

        TenantStorageSummaryDTO summary = service.refreshTenantStorageSummary(200022L);

        assertEquals(4L, summary.getStorageUsed());
        assertEquals(4L, updatedTenantRef.get().getStorageUsed());
    }

    private void injectField(Object target, String fieldName, Object value) {
        Class<?> current = target.getClass();
        while (current != null) {
            try {
                Field field = current.getDeclaredField(fieldName);
                field.setAccessible(true);
                field.set(target, value);
                return;
            } catch (NoSuchFieldException ignored) {
                current = current.getSuperclass();
            } catch (IllegalAccessException e) {
                throw new IllegalStateException("测试注入字段失败: " + fieldName, e);
            }
        }
        throw new IllegalStateException("未找到字段: " + fieldName);
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