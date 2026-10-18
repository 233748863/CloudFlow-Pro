import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.controller.HrLeaveRuleInnerController;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.service.HrLeaveRuleBridgeService;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.security.annotation.Inner;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class HrLeaveRuleBridgeChecks {
    private static int checks;
    private static final String QUOTA = "hr.leave.quota.limit";

    public static void main(String[] arguments) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "d1-leave-rule"), BusinessRule.class);
        UserContext.setTenantId(100010L);
        try {
            selection();
            records();
            for (Method method : HrLeaveRuleInnerController.class.getDeclaredMethods()) {
                Inner inner = method.getAnnotation(Inner.class);
                equal(true, inner != null && inner.value());
                equal(List.of("cloudflow-service-hr"), List.of(inner.allowedServices()));
            }
            System.out.println("PASS: D1 leave rule bridge checks=" + checks);
        } finally { UserContext.clear(); }
    }

    private static void selection() {
        BusinessRule local = rule(1L, 100010L), defaultRule = rule(2L, 100000L), global = rule(3L, 0L), foreign = rule(4L, 100020L);
        AtomicReference<List<BusinessRule>> rows = new AtomicReference<>(List.of(foreign, global, defaultRule, local));
        HrLeaveRuleBridgeService service = service(rows, new AtomicInteger(), true);
        equal(local, service.effective(QUOTA));
        equal(100010L, UserContext.getTenantId());
        local.setEnabled(0); equal(defaultRule, service.effective(QUOTA));
        defaultRule.setModule("crm"); equal(global, service.effective(QUOTA));
        global.setRuleCode("hr.overtime.hours.limit"); equal(null, service.effective(QUOTA));
        rejects(() -> service.effective("crm.credit.limit"));
        rejects(() -> service.effective("hr.overtime.hours.limit"));
        rejects(() -> service.effective(null));
        UserContext.setTenantId(null); rejects(() -> service.effective(QUOTA));
        UserContext.setTenantId(100010L);
    }

    private static void records() {
        AtomicInteger writes = new AtomicInteger();
        HrLeaveRuleBridgeService service = service(new AtomicReference<>(List.of()), writes, true);
        BusinessRuleHitRecord record = hit(QUOTA, "0", "1");
        record.setId(999L); record.setCreatedTime(LocalDateTime.of(2000, 1, 1, 0, 0));
        service.record(record);
        equal(null, record.getId()); equal(null, record.getCreatedTime()); equal(100010L, record.getTenantId());
        service.record(hit(QUOTA, "0", "1")); equal(2, writes.get());
        for (String code : List.of("hr.leave.continuous.limit", "hr.leave.annual.limit")) service.record(hit(code, "1", "2"));
        service.record(hit("hr.leave.probation.limit", "1000", "280"));
        service.record(hit("hr.leave.attachment.required", "1", "0"));
        service.record(hit("hr.leave.policy.required", "1", "0"));
        service.record(hit(QUOTA, "-1", "0.5"));
        for (String effect : List.of("WARN", "PASS")) {
            BusinessRuleHitRecord allowed = hit(QUOTA, "0", "1"); allowed.setEffect(effect); allowed.setHitResult(effect); service.record(allowed);
        }
        equal(10, writes.get());
        rejects(() -> service.record(null));
        BusinessRuleHitRecord foreign = hit(QUOTA, "0", "1"); foreign.setTenantId(100020L); rejects(() -> service.record(foreign));
        BusinessRuleHitRecord type = hit(QUOTA, "0", "1"); type.setBusinessType("HR_OVERTIME_DAY"); rejects(() -> service.record(type));
        BusinessRuleHitRecord identity = hit(QUOTA, "0", "1"); identity.setBusinessId(0L); rejects(() -> service.record(identity));
        BusinessRuleHitRecord effect = hit(QUOTA, "0", "1"); effect.setEffect("ALERT"); rejects(() -> service.record(effect));
        BusinessRuleHitRecord result = hit(QUOTA, "0", "1"); result.setHitResult("WARN"); rejects(() -> service.record(result));
        BusinessRuleHitRecord missing = hit(QUOTA, "0", "1"); missing.setActualValue(null); rejects(() -> service.record(missing));
        rejects(() -> service.record(hit("crm.credit.limit", "0", "1")));
        rejects(() -> service.record(hit(QUOTA, "1", "1")));
        rejects(() -> service.record(hit("hr.leave.probation.limit", "10", "10")));
        rejects(() -> service.record(hit("hr.leave.continuous.limit", "-1", "1")));
        rejects(() -> service.record(hit("hr.leave.attachment.required", "1", "1")));
        rejects(() -> service.record(hit("hr.leave.policy.required", "2", "0")));
        equal(10, writes.get());
        try { service(new AtomicReference<>(List.of()), writes, false).record(hit(QUOTA, "0", "1")); throw new AssertionError("Failed insert accepted"); }
        catch (IllegalStateException expected) { checks++; }
        UserContext.setTenantId(null); rejects(() -> service.record(hit(QUOTA, "0", "1"))); UserContext.setTenantId(100010L);
    }

    private static HrLeaveRuleBridgeService service(AtomicReference<List<BusinessRule>> rows, AtomicInteger writes, boolean saved) {
        IBusinessRuleService rules = (IBusinessRuleService) Proxy.newProxyInstance(HrLeaveRuleBridgeChecks.class.getClassLoader(),
                new Class<?>[]{IBusinessRuleService.class}, (proxy, method, values) -> {
                    if (method.getName().equals("list")) {
                        LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) values[0];
                        equal(true, query.getSqlSegment().contains("tenant_id") && query.getSqlSegment().contains("enabled"));
                        equal(true, query.getParamNameValuePairs().containsValue(100010L));
                        return rows.get();
                    }
                    if (method.getName().equals("recordHit")) { writes.incrementAndGet(); return saved; }
                    throw new AssertionError("Unexpected rule operation");
                });
        return new HrLeaveRuleBridgeService(rules);
    }

    private static BusinessRule rule(Long id, Long tenant) {
        BusinessRule value = new BusinessRule(); value.setId(id); value.setTenantId(tenant);
        value.setRuleCode(QUOTA); value.setModule("hr"); value.setEnabled(1); return value;
    }
    private static BusinessRuleHitRecord hit(String code, String threshold, String actual) {
        BusinessRuleHitRecord value = new BusinessRuleHitRecord(); value.setRuleCode(code); value.setBusinessType("HR_LEAVE");
        value.setBusinessId(100L); value.setThresholdValue(new BigDecimal(threshold)); value.setActualValue(new BigDecimal(actual));
        value.setEffect("BLOCK"); value.setHitResult("BLOCK"); return value;
    }
    private static void equal(Object expected, Object actual) { checks++; if (!Objects.equals(expected, actual)) throw new AssertionError("D1 rule bridge check " + checks); }
    private static void rejects(Runnable action) { try { action.run(); throw new AssertionError("Invalid rule accepted"); } catch (IllegalArgumentException expected) { checks++; } }
}
