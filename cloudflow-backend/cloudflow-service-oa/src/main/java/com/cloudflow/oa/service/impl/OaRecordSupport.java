package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

public final class OaRecordSupport {
    private OaRecordSupport() { }

    public static Long tenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) tenantId = UserContext.getTenantId();
        return require(tenantId, "租户上下文缺失");
    }

    public static String userName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    public static <T> T require(T value, String message) {
        if (value == null) throw new IllegalArgumentException(message);
        return value;
    }

    public static <T> T active(T value) {
        require(value, "记录不存在或无权访问");
        BeanWrapper bean = new BeanWrapperImpl(value);
        if (!Objects.equals(bean.getPropertyValue("tenantId"), tenantId())
                || bean.isReadableProperty("deleted") && !Integer.valueOf(0).equals(bean.getPropertyValue("deleted"))) {
            throw new IllegalArgumentException("记录不存在或无权访问");
        }
        return value;
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

    public static void update(Object entity, Object original) {
        active(original);
        BeanWrapper bean = new BeanWrapperImpl(entity), persisted = new BeanWrapperImpl(original);
        if (bean.isReadableProperty("version") && !Objects.equals(bean.getPropertyValue("version"), persisted.getPropertyValue("version"))) {
            throw new IllegalArgumentException("记录已修改，请刷新后重试");
        }
        for (String name : Set.of("tenantId", "createBy", "createTime", "deleted")) {
            if (bean.isWritableProperty(name)) bean.setPropertyValue(name, persisted.getPropertyValue(name));
        }
        touch(entity);
    }

    public static void touch(Object entity) {
        BeanWrapper bean = new BeanWrapperImpl(entity);
        if (bean.isWritableProperty("updateBy")) bean.setPropertyValue("updateBy", userName());
        if (bean.isWritableProperty("updateTime")) bean.setPropertyValue("updateTime", LocalDateTime.now());
    }

    public static void saved(int count) {
        if (count != 1) throw new IllegalStateException("记录已修改，请刷新后重试");
    }

    public static String text(String value, int limit, String label) {
        if (!StringUtils.hasText(value) || value.trim().length() > limit) throw new IllegalArgumentException(label + "不能为空且不能超过" + limit + "个字符");
        return value.trim();
    }

    public static String code(String value, String fallback, Set<String> allowed) {
        String result = StringUtils.hasText(value) ? value : fallback;
        if (result == null || !allowed.contains(result)) throw new IllegalArgumentException("状态或类型取值无效");
        return result;
    }

    public static BigDecimal decimal(BigDecimal value, int precision, int scale, boolean signed, String label) {
        BigDecimal result = require(value, label + "不能为空");
        if ((!signed && result.signum() < 0) || result.stripTrailingZeros().scale() > scale
                || result.abs().compareTo(BigDecimal.TEN.pow(precision - scale)) >= 0) throw new IllegalArgumentException(label + "超出精度或数值范围");
        return result.setScale(scale, RoundingMode.UNNECESSARY);
    }

    public static BigDecimal zero(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }

    public static Integer flag(Integer value) {
        if (value == null) return 0;
        if (value != 0 && value != 1) throw new IllegalArgumentException("开关只能为0或1");
        return value;
    }

    public static void same(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new IllegalArgumentException(message);
    }
}
