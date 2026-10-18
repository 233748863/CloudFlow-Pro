package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

public final class CrmRecordSupport {
    private CrmRecordSupport() {
    }

    public static Long tenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) tenantId = UserContext.getTenantId();
        if (tenantId == null) throw new IllegalStateException("租户上下文缺失");
        return tenantId;
    }

    public static String userName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    public static void create(Object entity, String idField) {
        BeanWrapper bean = new BeanWrapperImpl(entity);
        bean.setPropertyValue(idField, null);
        bean.setPropertyValue("tenantId", tenantId());
        if (bean.isWritableProperty("deleted")) bean.setPropertyValue("deleted", 0);
        if (bean.isWritableProperty("version")) bean.setPropertyValue("version", 0);
        bean.setPropertyValue("createBy", userName());
        bean.setPropertyValue("createTime", LocalDateTime.now());
        touch(entity);
    }

    public static void update(Object entity, Object persisted) {
        require(persisted, "记录不存在或无权访问");
        BeanWrapper bean = new BeanWrapperImpl(entity);
        BeanWrapper original = new BeanWrapperImpl(persisted);
        if (bean.isReadableProperty("version") && !Objects.equals(bean.getPropertyValue("version"), original.getPropertyValue("version"))) {
            throw new CrmBusinessException("记录已被修改，请刷新后重试");
        }
        for (String field : Set.of("tenantId", "createBy", "createTime", "deleted")) {
            if (bean.isWritableProperty(field)) bean.setPropertyValue(field, original.getPropertyValue(field));
        }
        touch(entity);
    }

    public static void touch(Object entity) {
        BeanWrapper bean = new BeanWrapperImpl(entity);
        bean.setPropertyValue("updateBy", userName());
        bean.setPropertyValue("updateTime", LocalDateTime.now());
    }

    public static <T> T require(T value, String message) {
        if (value == null) throw new CrmBusinessException(message);
        return value;
    }

    public static void saved(int count) {
        if (count != 1) throw new CrmBusinessException("记录已被修改，请刷新后重试");
    }

    public static String text(String value, int maxLength, String label) {
        if (!StringUtils.hasText(value) || value.trim().length() > maxLength) {
            throw new CrmBusinessException(label + "不能为空且不能超过" + maxLength + "个字符");
        }
        return value.trim();
    }

    public static String code(String value, String defaultValue, Set<String> allowed, String label) {
        String result = StringUtils.hasText(value) ? value : defaultValue;
        if (result == null || !allowed.contains(result)) throw new CrmBusinessException(label + "取值无效");
        return result;
    }

    public static Integer flag(Integer value) {
        if (value == null) return 0;
        if (value != 0 && value != 1) throw new CrmBusinessException("开关只能为0或1");
        return value;
    }

    public static BigDecimal money(BigDecimal value, String label) {
        BigDecimal amount = value == null ? BigDecimal.ZERO : value;
        if (amount.signum() < 0 || amount.scale() > 2 || amount.compareTo(new BigDecimal("99999999999999.99")) > 0) {
            throw new CrmBusinessException(label + "须为非负金额，最多14位整数和2位小数");
        }
        return amount;
    }
}
