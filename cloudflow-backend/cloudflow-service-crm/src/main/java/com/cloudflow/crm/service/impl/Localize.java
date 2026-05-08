package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmCustomer;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

final class Localize {

    private Localize() {
    }

    static void fillCommonAudit(Object entity, Long tenantId, String userName, LocalDateTime now) {
        invoke(entity, "setTenantId", Long.class, tenantId);
        invoke(entity, "setDelFlag", String.class, "0");
        invoke(entity, "setCreateBy", String.class, userName);
        invoke(entity, "setCreateTime", LocalDateTime.class, now);
        invoke(entity, "setUpdateBy", String.class, userName);
        invoke(entity, "setUpdateTime", LocalDateTime.class, now);
    }

    static void fillCustomerDefaults(CrmCustomer customer, Long tenantId, String userName, LocalDateTime now) {
        fillCommonAudit(customer, tenantId, userName, now);
    }

    static String nextNo(String prefix) {
        return prefix + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + ThreadLocalRandom.current().nextInt(100, 999);
    }

    private static void invoke(Object target, String methodName, Class<?> paramType, Object value) {
        try {
            target.getClass().getMethod(methodName, paramType).invoke(target, value);
        } catch (Exception e) {
            throw new IllegalStateException("设置字段失败: " + methodName, e);
        }
    }
}
