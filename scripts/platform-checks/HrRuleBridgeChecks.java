import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.controller.BusinessRuleController;
import com.cloudflow.auth.controller.HrRuleInnerController;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.mapper.BusinessRuleHitRecordMapper;
import com.cloudflow.auth.service.HrRuleBridgeService;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.security.annotation.Inner;
import cn.dev33.satoken.annotation.SaCheckPermission;
import java.lang.reflect.Method;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class HrRuleBridgeChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        for (Class<?> type : List.of(BusinessRule.class, BusinessRuleHitRecord.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "hr-rule-bridge"), type);
        }
        UserContext.setTenantId(100010L);
        try {
            selection();
            hitBoundaries();
            endpoints();
            System.out.println("PASS: H HR rule bridge checks=" + checks);
        } finally {
            UserContext.clear();
        }
    }

    private static void selection() {
        BusinessRule local = rule(1L, 100010L, 0);
        BusinessRule defaultRule = rule(2L, 100000L, 1);
        BusinessRule global = rule(3L, 0L, 1);
        BusinessRule foreign = rule(4L, 100020L, 1);
        AtomicReference<List<BusinessRule>> values = new AtomicReference<>(List.of(global, foreign, defaultRule, local));
        HrRuleBridgeService service = service(values, new AtomicInteger());
        equal(local, service.effective("hr.overtime.hours.limit"));
        local.setModule("HR");
        equal(local, service.effective("hr.overtime.hours.limit"));
        equal(0, service.effective("hr.overtime.hours.limit").getEnabled());
        equal(100010L, UserContext.getTenantId());
        values.set(List.of(global, foreign, defaultRule));
        equal(defaultRule, service.effective("hr.overtime.hours.limit"));
        values.set(List.of(foreign, global));
        equal(global, service.effective("hr.overtime.hours.limit"));
        values.set(List.of(foreign));
        equal(null, service.effective("hr.overtime.hours.limit"));
        values.set(List.of(local));
        local.setModule("crm");
        equal(null, service.effective("hr.overtime.hours.limit"));
        local.setModule("hr");
        local.setRuleCode("hr.leave.quota.limit");
        equal(null, service.effective("hr.overtime.hours.limit"));
        rejects(() -> service.effective("hr.leave.quota.limit"));
        UserContext.setTenantId(null);
        rejects(() -> service.effective("hr.overtime.hours.limit"));
        UserContext.setTenantId(100010L);
    }

    private static void hitBoundaries() {
        AtomicInteger writes = new AtomicInteger();
        HrRuleBridgeService service = service(new AtomicReference<>(List.of()), writes);
        BusinessRuleHitRecord value = hit();
        value.setId(999L);
        value.setCreatedTime(LocalDateTime.of(2000, 1, 1, 0, 0));
        service.record(value);
        equal(null, value.getId());
        equal(null, value.getCreatedTime());
        equal(100010L, value.getTenantId());
        equal(1, writes.get());
        service.record(hit());
        equal(1, writes.get());
        rejects(() -> service.record(null));
        value = hit(); value.setTenantId(100020L); BusinessRuleHitRecord tenant = value;
        rejects(() -> service.record(tenant));
        value = hit(); value.setRuleCode("crm.credit.limit"); BusinessRuleHitRecord code = value;
        rejects(() -> service.record(code));
        value = hit(); value.setBusinessType("HR_OVERTIME"); BusinessRuleHitRecord type = value;
        rejects(() -> service.record(type));
        value = hit(); value.setBusinessId(0L); BusinessRuleHitRecord identifier = value;
        rejects(() -> service.record(identifier));
        value = hit(); value.setEffect("PASS"); BusinessRuleHitRecord effect = value;
        rejects(() -> service.record(effect));
        value = hit(); value.setHitResult("BYPASSED"); BusinessRuleHitRecord result = value;
        rejects(() -> service.record(result));
        value = hit(); value.setThresholdValue(null); BusinessRuleHitRecord missing = value;
        rejects(() -> service.record(missing));
        value = hit(); value.setThresholdValue(BigDecimal.ZERO); BusinessRuleHitRecord zero = value;
        rejects(() -> service.record(zero));
        value = hit(); value.setActualValue(new BigDecimal("0.5")); BusinessRuleHitRecord below = value;
        rejects(() -> service.record(below));
        value = hit(); value.setEffect("WARN"); value.setHitResult("WARN");
        value.setBusinessType("HR_OVERTIME_MONTH"); value.setActualValue(new BigDecimal("1.00"));
        service(new AtomicReference<>(List.of()), new AtomicInteger()).record(value);
        equal("WARN", value.getEffect());
        UserContext.setTenantId(null);
        rejects(() -> service.record(hit()));
        UserContext.setTenantId(100010L);
    }

    private static void endpoints() throws Exception {
        for (Method method : HrRuleInnerController.class.getDeclaredMethods()) {
            Inner inner = method.getAnnotation(Inner.class);
            equal(true, inner != null && inner.value());
            equal(List.of("cloudflow-service-hr"), List.of(inner.allowedServices()));
        }
        equal(List.of("system:rule:list"), List.of(BusinessRuleController.class.getMethod("getEffectiveRule", String.class)
                .getAnnotation(SaCheckPermission.class).value()));
        equal(List.of("system:rule:edit"), List.of(BusinessRuleController.class.getMethod("recordHit", BusinessRuleHitRecord.class)
                .getAnnotation(SaCheckPermission.class).value()));
    }

    private static HrRuleBridgeService service(AtomicReference<List<BusinessRule>> values, AtomicInteger writes) {
        IBusinessRuleService rules = (IBusinessRuleService) Proxy.newProxyInstance(HrRuleBridgeChecks.class.getClassLoader(),
                new Class<?>[]{IBusinessRuleService.class}, (proxy, method, arguments) -> {
                    if (method.getName().equals("list")) {
                        LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) arguments[0];
                        equal(true, query.getSqlSegment().contains("tenant_id") && query.getSqlSegment().contains("module"));
                        equal(false, query.getSqlSegment().contains("enabled"));
                        return values.get();
                    }
                    if (method.getName().equals("recordHit")) { writes.incrementAndGet(); return true; }
                    throw new AssertionError("Unexpected rule operation");
                });
        BusinessRuleHitRecordMapper mapper = (BusinessRuleHitRecordMapper) Proxy.newProxyInstance(HrRuleBridgeChecks.class.getClassLoader(),
                new Class<?>[]{BusinessRuleHitRecordMapper.class}, (proxy, method, arguments) -> {
                    if (!method.getName().equals("selectCount")) throw new AssertionError("Unexpected hit operation");
                    LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) arguments[0];
                    equal(true, query.getSqlSegment().contains("tenant_id") && query.getSqlSegment().contains("actual_value"));
                    equal(true, query.getParamNameValuePairs().containsValue(100010L));
                    return writes.get() == 0 ? 0L : 1L;
                });
        return new HrRuleBridgeService(rules, mapper);
    }

    private static BusinessRule rule(Long id, Long tenantId, int enabled) {
        BusinessRule value = new BusinessRule(); value.setId(id); value.setTenantId(tenantId);
        value.setRuleCode("hr.overtime.hours.limit"); value.setModule("hr"); value.setEnabled(enabled);
        return value;
    }

    private static BusinessRuleHitRecord hit() {
        BusinessRuleHitRecord value = new BusinessRuleHitRecord(); value.setRuleCode("hr.overtime.hours.limit");
        value.setBusinessType("HR_OVERTIME_DAY"); value.setBusinessId(100L);
        value.setThresholdValue(BigDecimal.ONE); value.setActualValue(new BigDecimal("1.02"));
        value.setEffect("BLOCK"); value.setHitResult("BLOCK"); return value;
    }

    private static void equal(Object expected, Object actual) {
        checks++;
        if (!Objects.equals(expected, actual)) throw new AssertionError("HR rule bridge contract " + checks);
    }

    private static void rejects(Runnable action) {
        try { action.run(); throw new AssertionError("Invalid HR rule operation accepted"); }
        catch (IllegalArgumentException expected) { checks++; }
    }
}
