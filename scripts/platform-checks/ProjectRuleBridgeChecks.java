import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.controller.BusinessRuleController;
import com.cloudflow.auth.controller.ProjectRuleInnerController;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.auth.service.ProjectRuleBridgeService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

public final class ProjectRuleBridgeChecks {
    private static int checks;
    private static final String DAILY_HOURS = "oa.timesheet.daily-hours";
    private static final String DEPENDENCY = "oa.project.dependency.unsatisfied";

    public static void main(String[] arguments) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "f3-project-rule"), BusinessRule.class);
        UserContext.setTenantId(100010L);
        try {
            selection();
            records();
            for (Method method : ProjectRuleInnerController.class.getDeclaredMethods()) {
                Inner inner = method.getAnnotation(Inner.class);
                equal(true, inner != null && inner.value());
                equal(List.of("cloudflow-service-oa"), List.of(inner.allowedServices()));
            }
            equal(true, ProjectRuleInnerController.class.getMethod("recordHit", BusinessRuleHitRecord.class)
                    .isAnnotationPresent(RepeatSubmit.Disabled.class));
            equal(List.of("system:rule:list"), List.of(BusinessRuleController.class.getMethod("getEffectiveRule", String.class)
                    .getAnnotation(SaCheckPermission.class).value()));
            equal(List.of("system:rule:edit"), List.of(BusinessRuleController.class.getMethod("recordHit", BusinessRuleHitRecord.class)
                    .getAnnotation(SaCheckPermission.class).value()));
            System.out.println("PASS: F3 project rule bridge checks=" + checks + "; offline validated service, in-memory rule storage");
        } finally {
            UserContext.clear();
        }
    }

    private static void selection() {
        BusinessRule local = rule(1L, 100010L);
        BusinessRule defaultRule = rule(2L, 100000L);
        BusinessRule global = rule(3L, 0L);
        BusinessRule foreign = rule(4L, 100020L);
        AtomicReference<List<BusinessRule>> rows = new AtomicReference<>(List.of(foreign, global, defaultRule, local));
        ProjectRuleBridgeService service = service(rows, new AtomicInteger(), true);
        equal(local, service.effective(DAILY_HOURS));
        equal(100010L, UserContext.getTenantId());
        local.setEnabled(0);
        equal(defaultRule, service.effective(DAILY_HOURS));
        defaultRule.setModule("crm");
        equal(global, service.effective(DAILY_HOURS));
        global.setRuleCode("oa.rfq.min-suppliers");
        equal(null, service.effective(DAILY_HOURS));
        BusinessRule earlier = rule(5L, 100010L);
        BusinessRule later = rule(6L, 100010L);
        earlier.setPriority(10);
        later.setPriority(1);
        rows.set(List.of(earlier, later));
        equal(later, service.effective(DAILY_HOURS));
        earlier.setPriority(1);
        equal(earlier, service.effective(DAILY_HOURS));
        earlier.setRuleCode(DEPENDENCY);
        equal(earlier, service.effective(DEPENDENCY));
        for (String code : List.of("crm.credit.limit", "oa.rfq.min-suppliers", "oa.timesheet.daily-hours.extra", "")) {
            rejects(() -> service.effective(code));
        }
        rejects(() -> service.effective(null));
        UserContext.setTenantId(null);
        rejects(() -> service.effective(DAILY_HOURS));
        UserContext.setTenantId(0L);
        rejects(() -> service.effective(DAILY_HOURS));
        UserContext.setTenantId(100010L);
    }

    private static void records() {
        AtomicInteger writes = new AtomicInteger();
        ProjectRuleBridgeService service = service(new AtomicReference<>(List.of()), writes, true);
        BusinessRuleHitRecord draft = hit(DAILY_HOURS);
        draft.setId(999L);
        draft.setCreatedTime(LocalDateTime.of(2000, 1, 1, 0, 0));
        draft.setBusinessId(null);
        service.record(draft);
        equal(null, draft.getId());
        equal(null, draft.getCreatedTime());
        equal(100010L, draft.getTenantId());
        service.record(hit(DAILY_HOURS));
        service.record(hit(DAILY_HOURS));
        service.record(hit(DEPENDENCY));
        service.record(hit(DEPENDENCY));
        for (String effect : List.of("BLOCK", "PASS")) {
            BusinessRuleHitRecord record = hit(DAILY_HOURS);
            record.setEffect(effect);
            record.setHitResult(effect);
            service.record(record);
        }
        equal(7, writes.get());
        List<Consumer<BusinessRuleHitRecord>> invalidChanges = List.of(
                record -> record.setTenantId(100020L), record -> record.setBusinessType("PROJECT_TASK"),
                record -> record.setBusinessId(0L), record -> record.setBusinessId(-1L),
                record -> record.setEffect("ALERT"), record -> record.setHitResult("BYPASSED"),
                record -> record.setActualValue(null), record -> record.setThresholdValue(null),
                record -> record.setActualValue(BigDecimal.ONE.negate()), record -> record.setThresholdValue(BigDecimal.ONE.negate()),
                record -> record.setRuleCode("oa.rfq.min-suppliers"), record -> record.setRuleCode(null));
        for (Consumer<BusinessRuleHitRecord> change : invalidChanges) {
            BusinessRuleHitRecord record = hit(DAILY_HOURS);
            change.accept(record);
            rejects(() -> service.record(record));
        }
        rejects(() -> service.record(null));
        BusinessRuleHitRecord missingTask = hit(DEPENDENCY);
        missingTask.setBusinessId(null);
        rejects(() -> service.record(missingTask));
        BusinessRuleHitRecord invalidTask = hit(DEPENDENCY);
        invalidTask.setThresholdValue(BigDecimal.ONE);
        rejects(() -> service.record(invalidTask));
        invalidTask.setThresholdValue(BigDecimal.ZERO);
        invalidTask.setActualValue(BigDecimal.ZERO);
        rejects(() -> service.record(invalidTask));
        equal(7, writes.get());
        try {
            service(new AtomicReference<>(List.of()), writes, false).record(hit(DAILY_HOURS));
            throw new AssertionError("Failed rule record was acknowledged");
        } catch (IllegalStateException expected) {
            equal("项目工时规则记录保存失败", expected.getMessage());
        }
        UserContext.setTenantId(null);
        rejects(() -> service.record(hit(DAILY_HOURS)));
        UserContext.setTenantId(100010L);
    }

    private static ProjectRuleBridgeService service(AtomicReference<List<BusinessRule>> rows, AtomicInteger writes, boolean saved) {
        IBusinessRuleService rules = (IBusinessRuleService) Proxy.newProxyInstance(ProjectRuleBridgeChecks.class.getClassLoader(),
                new Class<?>[]{IBusinessRuleService.class}, (proxy, method, values) -> {
                    if (method.getName().equals("list")) {
                        LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) values[0];
                        equal(true, query.getSqlSegment().contains("tenant_id") && query.getSqlSegment().contains("enabled"));
                        equal(true, query.getParamNameValuePairs().containsValue(100010L));
                        return rows.get();
                    }
                    if (method.getName().equals("recordHit")) {
                        writes.incrementAndGet();
                        return saved;
                    }
                    throw new AssertionError("Unexpected rule operation");
                });
        return new ProjectRuleBridgeService(rules);
    }

    private static BusinessRule rule(Long id, Long tenantId) {
        BusinessRule value = new BusinessRule();
        value.setId(id);
        value.setTenantId(tenantId);
        value.setRuleCode(DAILY_HOURS);
        value.setModule("oa");
        value.setEnabled(1);
        return value;
    }

    private static BusinessRuleHitRecord hit(String code) {
        BusinessRuleHitRecord value = new BusinessRuleHitRecord();
        value.setRuleCode(code);
        value.setBusinessType(DEPENDENCY.equals(code) ? "PROJECT_TASK" : "TIMESHEET");
        value.setBusinessId(100L);
        value.setThresholdValue(DEPENDENCY.equals(code) ? BigDecimal.ZERO : BigDecimal.valueOf(8));
        value.setActualValue(DEPENDENCY.equals(code) ? BigDecimal.ONE : BigDecimal.valueOf(24));
        value.setEffect("WARN");
        value.setHitResult("WARN");
        return value;
    }

    private static void equal(Object expected, Object actual) {
        checks++;
        if (!Objects.equals(expected, actual)) throw new AssertionError("F3 rule bridge check " + checks);
    }

    private static void rejects(Runnable action) {
        try {
            action.run();
            throw new AssertionError("Invalid project rule input accepted");
        } catch (IllegalArgumentException expected) {
            checks++;
        }
    }
}
