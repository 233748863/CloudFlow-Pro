import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.controller.BusinessRuleController;
import com.cloudflow.auth.controller.ConsumableRuleInnerController;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.mapper.BusinessRuleHitRecordMapper;
import com.cloudflow.auth.service.ConsumableRuleBridgeService;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.auth.service.impl.BusinessRuleServiceImpl;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.aspect.InnerAspect;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.util.regex.Matcher;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.expression.Expression;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;

public final class ConsumableRuleBridgeChecks {
    private static final Long TENANT = 100010L;
    private static final Long FOREIGN_TENANT = 200020L;
    private static final String CODE = "oa.consumable.request.limit";
    private static final String BUSINESS_TYPE = "OA_CONSUMABLE_REQUEST";
    private static final Set<String> HIT_COLUMNS = Set.of("tenant_id", "rule_code", "business_type", "business_id",
            "effect", "hit_result", "threshold_value", "actual_value");
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        for (Class<?> type : List.of(BusinessRule.class, BusinessRuleHitRecord.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(configuration, "consumable-bridge-checks"), type);
        }
        UserContext.setTenantId(TENANT);
        try {
            effectiveBoundaries();
            recordValidation();
            normalizationAndIdempotency();
            saveFailure();
            controllerAndInnerBoundary();
            externalPermissionsAndLockContract();
            System.out.println("PASS: ConsumableRuleBridgeChecks checks=" + checks
                    + "; OFFLINE real bridge/recordHit/InnerAspect, in-memory mapper; no HTTP, database, Redis lock or concurrent replay");
        } finally {
            UserContext.clear();
            RequestContextHolder.resetRequestAttributes();
        }
    }

    private static void effectiveBoundaries() {
        ConsumableRuleBridgeChecks.Fixture fixture = new Fixture();
        BusinessRule disabled = rule(30L, TENANT, 0, 1);
        BusinessRule foreign = rule(1L, FOREIGN_TENANT, 1, 0);
        BusinessRule unrelated = rule(2L, TENANT, 1, 0);
        unrelated.setRuleCode("oa.other.limit");
        BusinessRule otherModule = rule(3L, TENANT, 1, 0);
        otherModule.setModule("hr");
        fixture.rules.addAll(List.of(foreign, unrelated, otherModule, rule(20L, TENANT, 1, 99), disabled));
        equal(disabled, fixture.service.effective(CODE), "disabled current-tenant rule is retained without foreign fallback");
        disabled.setModule("OA");
        equal(disabled, fixture.service.effective(CODE), "published uppercase module retains the disabled tenant override");
        equal(0, fixture.service.effective(CODE).getEnabled(), "disabled state is visible to the OA caller");
        fixture.rules.remove(disabled);
        equal(20L, fixture.service.effective(CODE).getId(), "only current-tenant consumable module rules are candidates");
        fixture.rules.clear();
        fixture.rules.addAll(List.of(foreign, unrelated, otherModule));
        equal(null, fixture.service.effective(CODE), "absence in current tenant cannot fall through to another tenant");
        fixture.rules.clear();
        fixture.rules.addAll(List.of(rule(null, TENANT, 1, null), rule(5L, TENANT, 1, 3), rule(4L, TENANT, 0, 3)));
        equal(4L, fixture.service.effective(CODE).getId(), "priority then id ordering is deterministic");
        fixture.rules.clear();
        equal(null, fixture.service.effective(CODE), "empty tenant has no effective consumable rule");
        for (String code : Arrays.asList(null, "", " ", "hr.overtime.hours.limit", "crm.contract.amount.limit",
                "OA.CONSUMABLE.REQUEST.LIMIT", CODE + " ", CODE + "' OR 1=1")) {
            rejects(fixture, () -> fixture.service.effective(code), "non-allowlisted rule code");
        }
        UserContext.setTenantId(null);
        rejects(fixture, () -> fixture.service.effective(CODE), "effective rule requires tenant context");
        UserContext.setTenantId(TENANT);
    }

    private static void recordValidation() {
        ConsumableRuleBridgeChecks.Fixture fixture = new Fixture();
        rejects(fixture, () -> fixture.service.record(null), "null hit record");
        List<Mutation> invalid = List.of(
                new Mutation("missing rule code", value -> value.setRuleCode(null)),
                new Mutation("other rule code", value -> value.setRuleCode("oa.other.limit")),
                new Mutation("padded rule code", value -> value.setRuleCode(CODE + " ")),
                new Mutation("missing business type", value -> value.setBusinessType(null)),
                new Mutation("HR business type", value -> value.setBusinessType("HR_OVERTIME_DAY")),
                new Mutation("other OA business type", value -> value.setBusinessType("OA_ASSET_REQUEST")),
                new Mutation("lowercase business type", value -> value.setBusinessType("oa_consumable_request")),
                new Mutation("padded business type", value -> value.setBusinessType(BUSINESS_TYPE + " ")),
                new Mutation("missing business id", value -> value.setBusinessId(null)),
                new Mutation("zero business id", value -> value.setBusinessId(0L)),
                new Mutation("negative business id", value -> value.setBusinessId(-1L)),
                new Mutation("minimum business id", value -> value.setBusinessId(Long.MIN_VALUE)),
                new Mutation("forged tenant", value -> value.setTenantId(FOREIGN_TENANT)),
                new Mutation("zero forged tenant", value -> value.setTenantId(0L)),
                new Mutation("missing effect", value -> value.setEffect(null)),
                new Mutation("unknown effect", value -> value.setEffect("ALLOW")),
                new Mutation("lowercase effect", value -> { value.setEffect("block"); value.setHitResult("block"); }),
                new Mutation("padded effect", value -> { value.setEffect("BLOCK "); value.setHitResult("BLOCK "); }),
                new Mutation("missing hit result", value -> value.setHitResult(null)),
                new Mutation("mismatched hit result", value -> value.setHitResult("PASS")),
                new Mutation("missing threshold", value -> value.setThresholdValue(null)),
                new Mutation("negative threshold", value -> value.setThresholdValue(new BigDecimal("-0.01"))),
                new Mutation("negative actual value", value -> value.setActualValue(new BigDecimal("-0.01"))));
        for (Mutation mutation : invalid) {
            BusinessRuleHitRecord record = hit();
            mutation.apply().accept(record);
            rejects(fixture, () -> fixture.service.record(record), mutation.label());
        }
        UserContext.setTenantId(null);
        rejects(fixture, () -> fixture.service.record(hit()), "hit requires tenant context");
        UserContext.setTenantId(TENANT);
        for (String effect : List.of("BLOCK", "WARN", "ALERT", "PASS")) {
            BusinessRuleHitRecord record = hit();
            record.setEffect(effect);
            record.setHitResult(effect);
            record.setTenantId(TENANT);
            record.setThresholdValue(BigDecimal.ZERO);
            record.setActualValue(BigDecimal.ZERO);
            record.setBusinessId(Long.MAX_VALUE);
            fixture.service.record(record);
            equal(effect, fixture.saved.get(fixture.saved.size() - 1).getEffect(), "supported effect is preserved");
        }
        equal(4, fixture.saved.size(), "all four supported effects accept zero amounts and a positive business id");
    }

    private static void normalizationAndIdempotency() {
        ConsumableRuleBridgeChecks.Fixture fixture = new Fixture();
        BusinessRuleHitRecord first = hit();
        first.setActualValue(null);
        first.setId(987654321L);
        first.setCreatedTime(LocalDateTime.of(2000, 1, 1, 0, 0));
        fixture.service.record(first);
        equal(BigDecimal.ZERO, first.getActualValue(), "null actual amount is normalized before deduplication");
        equal(null, first.getId(), "caller-supplied record id is cleared");
        equal(TENANT, first.getTenantId(), "authenticated tenant replaces missing tenant");
        check(first.getCreatedTime() != null && first.getCreatedTime().getYear() != 2000, "existing recordHit creates the timestamp");
        equal(1, fixture.saved.size(), "first record is saved exactly once");
        BusinessRuleHitRecord replay = hit();
        replay.setActualValue(BigDecimal.ZERO);
        fixture.service.record(replay);
        fixture.service.record(first);
        BusinessRuleHitRecord scaleReplay = hit();
        scaleReplay.setThresholdValue(new BigDecimal("10.0000"));
        scaleReplay.setActualValue(new BigDecimal("0.00"));
        fixture.service.record(scaleReplay);
        equal(1, fixture.recordCalls, "null, zero, reused object and equivalent decimal scale replays share one persisted hit");
        equal(1, fixture.saved.size(), "replays cannot insert duplicates");
        List<Mutation> distinct = List.of(
                new Mutation("business id", value -> value.setBusinessId(101L)),
                new Mutation("effect and result", value -> { value.setEffect("WARN"); value.setHitResult("WARN"); }),
                new Mutation("threshold", value -> value.setThresholdValue(new BigDecimal("11"))),
                new Mutation("actual amount", value -> value.setActualValue(new BigDecimal("1"))));
        for (Mutation mutation : distinct) {
            BusinessRuleHitRecord record = hit();
            record.setActualValue(BigDecimal.ZERO);
            mutation.apply().accept(record);
            int before = fixture.saved.size();
            fixture.service.record(record);
            fixture.service.record(copy(record));
            equal(before + 1, fixture.saved.size(), "idempotency distinguishes " + mutation.label() + " and still rejects its replay");
        }
        UserContext.setTenantId(FOREIGN_TENANT);
        BusinessRuleHitRecord foreign = hit();
        foreign.setActualValue(null);
        fixture.service.record(foreign);
        equal(FOREIGN_TENANT, fixture.saved.get(fixture.saved.size() - 1).getTenantId(), "same business id in another tenant remains isolated");
        int total = fixture.saved.size();
        fixture.service.record(copy(foreign));
        equal(total, fixture.saved.size(), "foreign tenant replay deduplicates within its own tenant");
        UserContext.setTenantId(TENANT);
        fixture.service.record(first);
        equal(total, fixture.saved.size(), "returning to first tenant finds its original hit");
        ConsumableRuleBridgeChecks.Fixture existing = new Fixture();
        BusinessRuleHitRecord stored = hit();
        stored.setTenantId(TENANT);
        stored.setActualValue(BigDecimal.ZERO);
        existing.saved.add(copy(stored));
        BusinessRuleHitRecord missingActual = hit();
        missingActual.setActualValue(null);
        existing.service.record(missingActual);
        equal(0, existing.recordCalls, "null replay recognizes a pre-existing zero amount from recordHit");
        equal(1, existing.saved.size(), "pre-existing zero record remains singular");
    }

    private static void saveFailure() {
        ConsumableRuleBridgeChecks.Fixture fixture = new Fixture();
        fixture.insertSucceeds = false;
        try {
            fixture.service.record(hit());
            throw new AssertionError("Failed insert was reported as success");
        } catch (IllegalStateException expected) {
            equal("耗材规则命中记录保存失败", expected.getMessage(), "failed recordHit is propagated");
        }
        equal(0, fixture.saved.size(), "failed recordHit cannot create an idempotency marker");
        fixture.insertSucceeds = true;
        fixture.service.record(hit());
        fixture.service.record(hit());
        equal(1, fixture.saved.size(), "successful retry is saved once after a failed insert");
        equal(2, fixture.recordCalls, "only failed attempt and successful retry reach recordHit");
    }

    private static void controllerAndInnerBoundary() throws Exception {
        equal(List.of("/inner/auth/oa-consumable-rules"), List.of(ConsumableRuleInnerController.class.getAnnotation(RequestMapping.class).value()),
                "consumable bridge remains under its dedicated internal route");
        Method read = ConsumableRuleInnerController.class.getMethod("effective", String.class);
        Method write = ConsumableRuleInnerController.class.getMethod("recordHit", BusinessRuleHitRecord.class);
        equal(List.of("/effective/{ruleCode}"), List.of(read.getAnnotation(GetMapping.class).value()), "effective rule route is unchanged");
        equal(List.of("/hit-records"), List.of(write.getAnnotation(PostMapping.class).value()), "hit record route is unchanged");
        check(write.isAnnotationPresent(RepeatSubmit.Disabled.class), "internal retries reach service-level idempotency");
        equal(2, ConsumableRuleInnerController.class.getDeclaredMethods().length, "bridge exposes exactly the two required operations");
        for (Method method : ConsumableRuleInnerController.class.getDeclaredMethods()) {
            Inner inner = method.getAnnotation(Inner.class);
            check(inner != null && inner.value(), method.getName() + " requires an internal caller");
            equal(List.of("cloudflow-service-oa"), List.of(inner.allowedServices()), method.getName() + " permits OA only");
        }
        ConsumableRuleBridgeChecks.Fixture fixture = new Fixture();
        BusinessRule disabled = rule(1L, TENANT, 0, 1);
        fixture.rules.add(disabled);
        AspectJProxyFactory factory = new AspectJProxyFactory(new ConsumableRuleInnerController(fixture.service));
        factory.setProxyTargetClass(true);
        factory.addAspect(new InnerAspect(new StandardEnvironment()));
        ConsumableRuleInnerController controller = factory.getProxy();
        RequestContextHolder.resetRequestAttributes();
        innerDenied(fixture, () -> controller.effective(CODE), "missing HTTP request context");
        innerDenied(fixture, () -> controller.recordHit(hit()), "missing HTTP request context on write");
        for (Map<String, String> headers : List.of(Map.<String, String>of(),
                Map.of(SecurityConstants.INNER_CALL_HEADER, "TRUE", SecurityConstants.FROM_SERVICE_HEADER, "cloudflow-service-oa"),
                Map.of(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE))) {
            bind(headers);
            innerDenied(fixture, () -> controller.effective(CODE), "missing or invalid internal identity headers");
            innerDenied(fixture, () -> controller.recordHit(hit()), "missing or invalid internal identity headers on write");
        }
        for (String caller : List.of("cloudflow-auth", "cloudflow-service-hr", "cloudflow-service-crm", "cloudflow-service-workflow",
                "cloudflow-service-oa,cloudflow-service-hr", "CLOUDFLOW-SERVICE-OA")) {
            bind(internal(caller));
            innerDenied(fixture, () -> controller.effective(CODE), "non-OA caller " + caller);
            innerDenied(fixture, () -> controller.recordHit(hit()), "non-OA write caller " + caller);
        }
        bind(internal("cloudflow-service-oa"));
        equal(disabled, controller.effective(CODE).getData(), "OA reaches real service and sees its disabled rule");
        equal(200, controller.recordHit(hit()).getCode(), "OA reaches real validated hit writer");
        controller.recordHit(hit());
        equal(1, fixture.saved.size(), "controller retries preserve service idempotency");
        rejects(fixture, () -> controller.effective("oa.other.limit"), "OA cannot use bridge for another rule");
        BusinessRuleHitRecord forged = hit();
        forged.setTenantId(FOREIGN_TENANT);
        rejects(fixture, () -> controller.recordHit(forged), "OA cannot forge another tenant in the payload");
        UserContext.setTenantId(null);
        rejects(fixture, () -> controller.effective(CODE), "internal marker does not supply missing tenant context");
        rejects(fixture, () -> controller.recordHit(hit()), "internal marker does not supply missing write tenant context");
        UserContext.setTenantId(TENANT);
        RequestContextHolder.resetRequestAttributes();
    }

    private static void externalPermissionsAndLockContract() throws Exception {
        Map<String, String> expected = Map.ofEntries(
                Map.entry("list", "system:rule:list"), Map.entry("getInfo", "system:rule:list"),
                Map.entry("getEffectiveRule", "system:rule:list"), Map.entry("versions", "system:rule:list"),
                Map.entry("hitRecords", "system:rule:list"), Map.entry("add", "system:rule:edit"),
                Map.entry("edit", "system:rule:edit"), Map.entry("draft", "system:rule:edit"),
                Map.entry("recordHit", "system:rule:edit"), Map.entry("remove", "system:rule:edit"),
                Map.entry("publish", "system:rule:publish"), Map.entry("rollback", "system:rule:rollback"),
                Map.entry("setEnabled", "system:rule:enabled"));
        equal(List.of("/system/rules"), List.of(BusinessRuleController.class.getAnnotation(RequestMapping.class).value()), "external management route is unchanged");
        check(!BusinessRuleController.class.isAnnotationPresent(Inner.class), "external controller is not converted into an internal bypass");
        LinkedHashMap<String, String> actual = new LinkedHashMap<String, String>();
        for (Method method : BusinessRuleController.class.getDeclaredMethods()) {
            if (method.isSynthetic()) continue;
            SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
            check(permission != null, method.getName() + " retains an external management permission");
            equal(1, permission.value().length, method.getName() + " has no additional broad permission alternative");
            check(!method.isAnnotationPresent(Inner.class), method.getName() + " has no new internal opt-out");
            actual.put(method.getName(), permission.value()[0]);
        }
        equal(expected, actual, "all original external BusinessRuleController permissions are preserved");
        Method record = ConsumableRuleBridgeService.class.getMethod("record", BusinessRuleHitRecord.class);
        equal(List.of(Exception.class), List.of(record.getAnnotation(Transactional.class).rollbackFor()), "hit write keeps transaction rollback contract");
        DistributedLock lock = record.getAnnotation(DistributedLock.class);
        check(lock != null, "hit record has a distributed serialization lock declaration");
        StandardEvaluationContext evaluation = new StandardEvaluationContext();
        BusinessRuleHitRecord value = hit();
        evaluation.setVariable("record", value);
        Expression expression = new SpelExpressionParser().parseExpression(lock.key());
        equal("oa:consumable:rulehit:" + TENANT + ":100", expression.getValue(evaluation), "lock key includes current tenant and positive business id");
        value.setActualValue(null);
        equal("oa:consumable:rulehit:" + TENANT + ":100", expression.getValue(evaluation), "null and zero replays share the lock");
        UserContext.setTenantId(FOREIGN_TENANT);
        equal("oa:consumable:rulehit:" + FOREIGN_TENANT + ":100", expression.getValue(evaluation), "different tenants cannot share the lock key");
        UserContext.setTenantId(TENANT);
        value.setBusinessId(101L);
        equal("oa:consumable:rulehit:" + TENANT + ":101", expression.getValue(evaluation), "different business records have distinct lock keys");
    }

    private static final class Fixture {
        final List<BusinessRule> rules = new ArrayList<>();
        final List<BusinessRuleHitRecord> saved = new ArrayList<>();
        final ConsumableRuleBridgeService service;
        int ruleReads;
        int hitReads;
        int recordCalls;
        boolean insertSucceeds = true;

        Fixture() {
            BusinessRuleHitRecordMapper hitMapper = (BusinessRuleHitRecordMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{BusinessRuleHitRecordMapper.class}, (proxy, method, supplied) -> {
                        if (method.getName().equals("selectCount")) {
                            hitReads++;
                            Map<String, Object> values = equalities((LambdaQueryWrapper<?>) supplied[0]);
                            equal(HIT_COLUMNS, values.keySet(), "deduplication query binds all eight identity dimensions");
                            equal(UserContext.getTenantId(), values.get("tenant_id"), "deduplication is restricted to current tenant");
                            equal(CODE, values.get("rule_code"), "deduplication is restricted to consumable rule code");
                            equal(BUSINESS_TYPE, values.get("business_type"), "deduplication is restricted to consumable requests");
                            check(values.get("actual_value") != null, "deduplication sees normalized actual amount");
                            return saved.stream().filter(row -> matches(row, values)).count();
                        }
                        if (method.getName().equals("insert")) {
                            BusinessRuleHitRecord value = (BusinessRuleHitRecord) supplied[0];
                            check(value.getCreatedTime() != null, "real recordHit assigns creation time before insert");
                            if (!insertSucceeds) return 0;
                            saved.add(copy(value));
                            return 1;
                        }
                        throw new AssertionError("Unexpected hit mapper operation: " + method.getName());
                    });
            BusinessRuleServiceImpl realRules = new BusinessRuleServiceImpl(null, hitMapper, new ObjectMapper());
            IBusinessRuleService ruleService = (IBusinessRuleService) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{IBusinessRuleService.class}, (proxy, method, supplied) -> {
                        if (method.getName().equals("list")) {
                            ruleReads++;
                            Map<String, Object> values = equalities((LambdaQueryWrapper<?>) supplied[0]);
                            equal(Map.of("tenant_id", UserContext.getTenantId(), "rule_code", CODE, "module", "oa"), values,
                                    "effective query binds tenant/code/module and does not filter out disabled rules");
                            return new ArrayList<>(rules);
                        }
                        if (method.getName().equals("recordHit")) {
                            recordCalls++;
                            BusinessRuleHitRecord value = (BusinessRuleHitRecord) supplied[0];
                            equal(null, value.getId(), "bridge clears caller-controlled primary key before existing writer");
                            equal(null, value.getCreatedTime(), "bridge clears caller-controlled creation time before existing writer");
                            equal(UserContext.getTenantId(), value.getTenantId(), "existing writer receives authenticated tenant");
                            check(value.getActualValue() != null, "bridge normalizes actual amount before existing writer");
                            return realRules.recordHit(value);
                        }
                        throw new AssertionError("Unexpected rule operation: " + method.getName());
                    });
            service = new ConsumableRuleBridgeService(ruleService, hitMapper);
        }
    }

    private record Mutation(String label, Consumer<BusinessRuleHitRecord> apply) {
    }

    private static Map<String, Object> equalities(LambdaQueryWrapper<?> query) {
        String sql = query.getSqlSegment();
        Matcher matcher = Pattern.compile("([a-z_]+)\\s*=\\s*#\\{ew\\.paramNameValuePairs\\.([A-Za-z0-9]+)\\}").matcher(sql);
        LinkedHashMap<String, Object> values = new LinkedHashMap<String, Object>();
        while (matcher.find()) {
            check(!values.containsKey(matcher.group(1)), "query has no duplicate equality column");
            values.put(matcher.group(1), query.getParamNameValuePairs().get(matcher.group(2)));
        }
        String remainder = matcher.replaceAll("").replaceAll("\\bAND\\b", "").replaceAll("[\\s()]", "");
        check(remainder.isEmpty(), "query contains only the tested bound equality conjunctions");
        equal(values.size(), query.getParamNameValuePairs().size(), "every bound predicate is understood by the in-memory mapper");
        return values;
    }

    private static boolean matches(BusinessRuleHitRecord row, Map<String, Object> values) {
        return Objects.equals(row.getTenantId(), values.get("tenant_id")) && Objects.equals(row.getRuleCode(), values.get("rule_code"))
                && Objects.equals(row.getBusinessType(), values.get("business_type")) && Objects.equals(row.getBusinessId(), values.get("business_id"))
                && Objects.equals(row.getEffect(), values.get("effect")) && Objects.equals(row.getHitResult(), values.get("hit_result"))
                && row.getThresholdValue().compareTo((BigDecimal) values.get("threshold_value")) == 0
                && row.getActualValue().compareTo((BigDecimal) values.get("actual_value")) == 0;
    }

    private static BusinessRule rule(Long identifier, Long tenant, int enabled, Integer priority) {
        BusinessRule value = new BusinessRule();
        value.setId(identifier);
        value.setTenantId(tenant);
        value.setRuleCode(CODE);
        value.setModule("oa");
        value.setEnabled(enabled);
        value.setPriority(priority);
        return value;
    }

    private static BusinessRuleHitRecord hit() {
        BusinessRuleHitRecord value = new BusinessRuleHitRecord();
        value.setRuleCode(CODE);
        value.setBusinessType(BUSINESS_TYPE);
        value.setBusinessId(100L);
        value.setThresholdValue(new BigDecimal("10.00"));
        value.setActualValue(new BigDecimal("12.50"));
        value.setEffect("BLOCK");
        value.setHitResult("BLOCK");
        return value;
    }

    private static BusinessRuleHitRecord copy(BusinessRuleHitRecord value) {
        BusinessRuleHitRecord copy = new BusinessRuleHitRecord();
        copy.setId(value.getId());
        copy.setTenantId(value.getTenantId());
        copy.setRuleCode(value.getRuleCode());
        copy.setBusinessType(value.getBusinessType());
        copy.setBusinessId(value.getBusinessId());
        copy.setThresholdValue(value.getThresholdValue());
        copy.setActualValue(value.getActualValue());
        copy.setEffect(value.getEffect());
        copy.setHitResult(value.getHitResult());
        copy.setCreatedTime(value.getCreatedTime());
        return copy;
    }

    private static Map<String, String> internal(String caller) {
        return Map.of(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE, SecurityConstants.FROM_SERVICE_HEADER, caller);
    }

    private static void bind(Map<String, String> headers) {
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, (proxy, method, supplied) -> switch (method.getName()) {
                    case "getHeader" -> headers.get(supplied[0]);
                    case "getRemoteAddr" -> "127.0.0.1";
                    case "getRequestURI" -> "/inner/auth/oa-consumable-rules";
                    case "toString" -> "offline-consumable-request";
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == supplied[0];
                    default -> throw new AssertionError("Unexpected offline request operation: " + method.getName());
                });
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private static void innerDenied(Fixture fixture, Runnable action, String label) {
        int operations = fixture.ruleReads + fixture.hitReads + fixture.recordCalls;
        try {
            action.run();
            throw new AssertionError("Unauthorized caller accepted: " + label);
        } catch (ServiceException expected) {
            equal(403, expected.getCode(), label + " is denied by the real InnerAspect");
        }
        equal(operations, fixture.ruleReads + fixture.hitReads + fixture.recordCalls, label + " cannot reach rule storage");
    }

    private static void rejects(Fixture fixture, Runnable action, String label) {
        int operations = fixture.ruleReads + fixture.hitReads + fixture.recordCalls;
        try {
            action.run();
            throw new AssertionError("Invalid consumable bridge operation accepted: " + label);
        } catch (IllegalArgumentException expected) {
            checks++;
        }
        equal(operations, fixture.ruleReads + fixture.hitReads + fixture.recordCalls, label + " is rejected before storage access");
    }

    private static void equal(Object expected, Object actual, String message) {
        check(Objects.equals(expected, actual), message + "; expected=" + expected + "; actual=" + actual);
    }

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError("Consumable bridge check " + checks + ": " + message);
    }
}
