package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.fallback.AuthServiceFallback;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.HrLifecycleStatusChangePayload;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import com.cloudflow.hr.domain.entity.HrLifecycleTask;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleApplicationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.service.impl.HrEventPublisherImpl;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URL;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.UrlResource;

final class HrLifecycleHandoverChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private static int assertions;

    static void run() throws Exception {
        detailAndIdentity();
        draftAndCompletion();
        durablePublisher();
        accountAvailability();
        System.out.println("H3_HR_SUCCESSOR_RULE_CHECKS: assertions=" + assertions + "; failed=0; database=false; http=false; dependencies=explicit_test_doubles");
    }

    private static void detailAndIdentity() {
        Fixture fixture = new Fixture();
        HrLifecycleApplicationPayload payload = fixture.payload();
        payload.setDeptId(999L); payload.setName("伪造员工姓名");
        payload.setDetailJson(JSON.createObjectNode().put("status", "COMPLETED").put("employeeId", 999).put("reason", "保留原因"));
        Long id = fixture.service.createApplication(payload);
        HrLifecycleApplicationVO current = fixture.service.getApplication(id);
        equal("DRAFT", current.getStatus(), "old detail status cannot overwrite actual application status");
        equal(501L, current.getEmployeeId(), "detail cannot override actual departing identity");
        equal(100L, current.getDeptId(), "resignation stores employee department rather than client scope");
        equal("离职员工", current.getName(), "resignation stores verified employee name");
        equal(300L, current.getSuccessorUserId(), "typed user identifier reaches canonical detail");
        equal("可信接任人", current.getSuccessorName(), "successor name comes from real directory contract");
        HrLifecycleApplicationPayload patch = new HrLifecycleApplicationPayload();
        patch.setRemark("仅改备注");
        fixture.service.updateApplication(id, patch);
        equal(payload.getApplicationNo(), fixture.service.getApplication(id).getApplicationNo(), "partial patch retains original application number");
        equal(300L, fixture.service.getApplication(id).getSuccessorUserId(), "unrelated patch preserves successor");
        equal("保留原因", fixture.detail(id).get("reason"), "partial patch preserves existing detail fields");
        for (Consumer<HrEmployeeSummaryVO> invalidate : List.<Consumer<HrEmployeeSummaryVO>>of(
                employee -> employee.setActive(false), employee -> employee.setUserEnabled(false), employee -> employee.setDepartmentEnabled(false),
                employee -> employee.setTenantId(100001L), employee -> employee.setUserId(999L), employee -> employee.setEmployeeId(null),
                employee -> employee.setDeptId(null))) {
            Fixture invalid = new Fixture();
            invalidate.accept(invalid.successor);
            fails(() -> invalid.service.createApplication(invalid.payload()), "invalid successor identity rejected before creation");
            equal(0, invalid.rows(HrLifecycleApplication.class).size(), "invalid successor leaves no application");
        }
        for (Long identity : List.of(0L, -1L, 200L, 999L)) {
            Fixture invalid = new Fixture();
            HrLifecycleApplicationPayload request = invalid.payload(); request.setSuccessorUserId(identity);
            fails(() -> invalid.service.createApplication(request), "invalid, self or missing user rejected");
            equal(0, invalid.rows(HrLifecycleApplication.class).size(), "identity rejection is pre-write");
        }
        Fixture malformed = new Fixture();
        HrLifecycleApplicationPayload bad = malformed.payload();
        bad.setSuccessorUserId(null); bad.setDetailJson(JSON.createObjectNode().put("successorUserId", "not-a-user"));
        fails(() -> malformed.service.createApplication(bad), "malformed nested user ID cannot silently mean no successor");
        bad.setSuccessorUserId(300L); bad.setDetailJson(JSON.createObjectNode().put("successorUserId", 301L));
        fails(() -> malformed.service.createApplication(bad), "conflicting root and nested IDs rejected");
        bad.setDetailJson(JSON.createObjectNode().put("successorUserId", 300L));
        bad.setType("TRANSFER");
        fails(() -> malformed.service.createApplication(bad), "non-resignation cannot bind CRM successor");
        bad.setType("RESIGNATION"); bad.setEmployeeId(999L);
        fails(() -> malformed.service.createApplication(bad), "missing departing employee rejected");
        bad.setEmployeeId(501L); bad.setStatus("COMPLETED");
        fails(() -> malformed.service.createApplication(bad), "create cannot skip resignation approval");
    }

    private static void draftAndCompletion() {
        Fixture fixture = new Fixture();
        Long id = fixture.service.createApplication(fixture.payload());
        HrLifecycleApplicationPayload patch = new HrLifecycleApplicationPayload();
        patch.setDetailJson(JSON.createObjectNode().putNull("successorUserId"));
        fails(() -> fixture.service.updateApplication(id, patch), "successor changes require expected version");
        patch.setVersion(99);
        fails(() -> fixture.service.updateApplication(id, patch), "stale version cannot overwrite successor");
        patch.setVersion(fixture.service.getApplication(id).getVersion());
        fixture.service.updateApplication(id, patch);
        equal(null, fixture.service.getApplication(id).getSuccessorUserId(), "explicit nested null clears optional successor");
        equal(null, fixture.service.getApplication(id).getSuccessorName(), "cleared successor drops obsolete name");
        patch.setDetailJson(JSON.createObjectNode().put("successorUserId", 300L));
        patch.setVersion(fixture.service.getApplication(id).getVersion());
        fixture.service.updateApplication(id, patch);
        fails(() -> fixture.service.changeLifecycleStatus(id, "complete", null), "draft cannot directly complete resignation");
        Long taskId = fixture.rows(HrLifecycleTask.class).keySet().iterator().next();
        fails(() -> fixture.service.completeTask(taskId, null), "draft task cannot be attested before approval");
        fixture.service.changeLifecycleStatus(id, "submit", null);
        equal("APPROVING", fixture.service.getApplication(id).getStatus(), "saved draft detail does not hide actual submitted status");
        fixture.service.changeLifecycleStatus(id, "approve", null);
        equal("REGULAR", fixture.rows(HrEmployee.class).get(501L).get("employeeStatus"), "approval alone does not mark employee resigned");
        fails(() -> fixture.service.changeLifecycleStatus(id, "complete", fixture.statusPayload(id)), "outstanding handover task blocks final completion");
        fixture.service.completeTask(taskId, null);
        fails(() -> fixture.service.changeLifecycleStatus(id, "complete", null), "completion requires explicitly reviewed application version");
        HrLifecycleStatusChangePayload staleCompletion = fixture.statusPayload(id);
        patch.setVersion(fixture.service.getApplication(id).getVersion());
        fixture.service.updateApplication(id, patch);
        fails(() -> fixture.service.changeLifecycleStatus(id, "complete", staleCompletion), "concurrent successor edit rejects stale final completion");
        equal("APPROVED", fixture.service.getApplication(id).getStatus(), "stale completion leaves application approved");
        equal(0, fixture.authCalls, "missing or stale completion version cannot disable account");
        equal(0, fixture.successorEvents.size(), "stale completion cannot publish offboarding event");
        fixture.successor.setUserEnabled(false);
        fails(() -> fixture.service.changeLifecycleStatus(id, "complete", fixture.statusPayload(id)), "successor is revalidated before completion");
        equal("APPROVED", fixture.service.getApplication(id).getStatus(), "invalid successor retains approved state");
        equal(0, fixture.authCalls, "invalid successor cannot disable departing account");
        fixture.successor.setUserEnabled(true);
        fixture.service.changeLifecycleStatus(id, "complete", fixture.statusPayload(id));
        equal("COMPLETED", fixture.service.getApplication(id).getStatus(), "actual completion status exposed");
        equal("RESIGNED", fixture.rows(HrEmployee.class).get(501L).get("employeeStatus"), "completion updates actual employee status");
        equal(fixture.payload().getEffectiveDate(), fixture.rows(HrEmployee.class).get(501L).get("resignDate"), "employee resignation date follows approved application");
        Integer completedEmployeeVersion = ((Number) fixture.rows(HrEmployee.class).get(501L).get("version")).intValue();
        equal(1, fixture.authCalls, "account disabled once for final completion");
        equal(List.of(300L), fixture.successorEvents, "event carries trusted system user identifier");
        fixture.service.changeLifecycleStatus(id, "complete", null);
        fixture.service.changeLifecycleStatus(id, "effective", null);
        equal(1, fixture.authCalls, "completion replay never disables again");
        equal(1, fixture.successorEvents.size(), "completion replay never republishes offboarding");
        equal(completedEmployeeVersion, fixture.rows(HrEmployee.class).get(501L).get("version"), "completion replay never rewrites employee record");
        patch.setVersion(fixture.service.getApplication(id).getVersion());
        fails(() -> fixture.service.updateApplication(id, patch), "completed successor immutable");
        fails(() -> fixture.service.changeLifecycleStatus(id, "submit", null), "completed resignation cannot restart from draft");
        Long tenant = UserContext.getTenantId();
        try {
            UserContext.setTenantId(100001L);
            fails(() -> fixture.service.getApplication(id), "foreign tenant cannot query application");
            fails(() -> fixture.service.listDetails(id), "foreign tenant cannot query application details");
            fails(() -> fixture.service.listTasks(id), "foreign tenant cannot query application tasks");
        } finally { UserContext.setTenantId(tenant); }
    }

    private static void accountAvailability() throws Exception {
        int before = assertions;
        URL classes = AuthServiceClient.class.getProtectionDomain().getCodeSource().getLocation();
        List<PropertySource<?>> properties = new YamlPropertySourceLoader().load("hr-application", new UrlResource(new URL(classes, "application.yml")));
        String operation = feign.Feign.configKey(AuthServiceClient.class, AuthServiceClient.class.getMethod("disableUser", Long.class))
                .replaceAll("[^a-zA-Z0-9]", "");
        equal("AuthServiceClientdisableUserLong", operation, "account deadline uses actual Feign operation key");
        String property = "resilience4j.timelimiter.instances." + operation + ".timeout-duration";
        Object configured = properties.stream().map(source -> source.getProperty(property)).filter(Objects::nonNull).findFirst().orElseThrow();
        equal(Duration.ofSeconds(15), DurationStyle.detectAndParse(configured.toString()), "offboarding account operation has fifteen-second scoped deadline");
        R<Void> fallback = new AuthServiceFallback().disableUser(200L);
        equal(false, fallback.isSuccess(), "uncertain account response never reports success");
        equal(true, fallback.getMsg().contains("结果尚未确认") && fallback.getMsg().contains("当前申请"), "fallback preserves uncertainty and original application recovery");
        Method disable = HrLifecycleService.class.getDeclaredMethod("disableAuthUserIfPresent", Long.class);
        disable.setAccessible(true);
        for (boolean absent : List.of(false, true)) {
            Fixture fixture = new Fixture();
            fixture.authResponse = absent ? null : fallback;
            try {
                disable.invoke(fixture.service, 200L);
                throw new AssertionError("unconfirmed account operation must reject completion");
            } catch (InvocationTargetException failure) {
                equal(true, failure.getCause() instanceof HrBusinessException, "unconfirmed result is a handled business rejection");
                equal(true, failure.getCause().getMessage().contains("离职尚未完成") && failure.getCause().getMessage().contains("当前申请"), "business response offers reconciliation without claiming account state");
            }
            equal(0, fixture.successorEvents.size(), "unconfirmed account response does not publish completed offboarding");
        }
        System.out.println("H3_HR_ACCOUNT_AVAILABILITY_CHECKS: assertions=" + (assertions - before)
                + "; failed=0; configured_timeout_ms=15000; fallback_success=false; http=false");
    }

    private static void durablePublisher() {
        List<BusinessEventEnvelope> envelopes = new ArrayList<>();
        OutboxPublisher outbox = new OutboxPublisher(null, JSON) {
            @Override public void publish(BusinessEventEnvelope envelope) { envelopes.add(envelope); }
        };
        new HrEventPublisherImpl(outbox, JSON).publishEmployeeLeft(501L, 200L, "离职员工", 100L, "部门", 300L);
        equal(1, envelopes.size(), "publisher writes one real envelope contract");
        equal(true, envelopes.get(0).getPayload().contains("\"successorUserId\":300"), "serialized envelope preserves successor");
        OutboxPublisher unavailable = new OutboxPublisher(null, JSON) {
            @Override public void publish(BusinessEventEnvelope envelope) { throw new IllegalStateException("explicit outbox failure fixture"); }
        };
        try {
            new HrEventPublisherImpl(unavailable, JSON).publishEmployeeLeft(501L, 200L, "离职员工", 100L, "部门", 300L);
            throw new AssertionError("outbox failure must propagate to business transaction");
        } catch (IllegalStateException expected) { assertions++; }
    }

    private static final class Fixture {
        private final Map<Class<?>, Map<Long, Map<String, Object>>> data = new LinkedHashMap<>();
        private final HrEmployeeSummaryVO successor = new HrEmployeeSummaryVO();
        private final List<Long> successorEvents = new ArrayList<>();
        private final HrLifecycleService service;
        private long nextId = 1000L;
        private int authCalls;
        private R<Void> authResponse = R.ok();

        Fixture() {
            rows(HrEmployee.class).put(501L, new LinkedHashMap<>(Map.of("id", 501L, "userId", 200L, "tenantId", 100000L, "deptId", 100L, "name", "离职员工", "employeeStatus", "REGULAR", "version", 0)));
            successor.setTenantId(100000L); successor.setEmployeeId(601L); successor.setUserId(300L); successor.setEmployeeName("可信接任人");
            successor.setDeptId(100L); successor.setActive(true); successor.setUserEnabled(true); successor.setDepartmentEnabled(true);
            HrTypedCrudService crud = new HrTypedCrudService(null, JSON, null, null, null, null, null, null, null, null, null) {
                @Override public <Entity> Map<String, Object> get(Class<Entity> type, Long id) {
                    Map<String, Object> row = rows(type).get(id);
                    return row != null && Objects.equals(row.get("tenantId"), UserContext.getTenantId()) ? new LinkedHashMap<>(row) : Map.of();
                }
                @Override public <Entity> List<Map<String, Object>> list(Class<Entity> type, Map<String, ?> query) {
                    return rows(type).values().stream().filter(row -> Objects.equals(row.get("tenantId"), UserContext.getTenantId()))
                            .filter(row -> query.entrySet().stream().allMatch(entry -> Objects.equals(String.valueOf(row.get(entry.getKey())), String.valueOf(entry.getValue()))))
                            .map(row -> (Map<String, Object>) new LinkedHashMap<>(row)).toList();
                }
                @Override public <Entity> Long create(Class<Entity> type, Object payload) {
                    long id = nextId++;
                    Map<String, Object> row = new LinkedHashMap<>(toMap(payload));
                    if (type == HrLifecycleApplication.class) { row.remove("detailJson"); row.remove("successorUserId"); }
                    row.put("id", id); row.put("tenantId", 100000L); row.put("version", 0); row.put("deleted", 0);
                    rows(type).put(id, row); return id;
                }
                @Override public <Entity> void updateProperties(Class<Entity> type, Long id, Map<String, Object> patch) {
                    Map<String, Object> row = rows(type).get(id);
                    patch.forEach((key, value) -> { if (type != HrLifecycleApplication.class || !Set.of("detailJson", "successorUserId").contains(key)) row.put(key, value); });
                    row.put("version", ((Number) row.get("version")).intValue() + 1);
                }
                @Override public <Entity> void changeStatus(Class<Entity> type, Long id, String action) { updateProperties(type, id, Map.of("status", statusFromAction(action))); }
            };
            HrViewSupport view = new HrViewSupport(crud, null, JSON) {
                @Override public void putDeptName(Map<String, Object> row) { }
                @Override public void putPostName(Map<String, Object> row) { }
                @Override public void putPositionSnapshot(Map<String, Object> row) { }
            };
            IHrIntegrationQueryService directory = proxy(IHrIntegrationQueryService.class, (target, method, arguments) -> {
                equal("listEmployeesByUserIds", method.getName(), "directory lookup uses system user IDs");
                return ((List<?>) arguments[0]).contains(300L) ? List.of(successor) : List.of();
            });
            AuthServiceClient auth = proxy(AuthServiceClient.class, (target, method, arguments) -> {
                equal("disableUser", method.getName(), "completion uses existing account-disable endpoint");
                equal(200L, arguments[0], "disable uses employee account rather than employee ID");
                authCalls++; return authResponse;
            });
            HrLifecycleApplicationMapper mapper = proxy(HrLifecycleApplicationMapper.class, (target, method, arguments) -> {
                boolean employeeLock = "lockEmployee".equals(method.getName());
                equal(true, employeeLock || "lockForUpdate".equals(method.getName()), "lifecycle writes lock original application or employee");
                equal(UserContext.getTenantId(), arguments[0], "row lock includes current tenant");
                Map<String, Object> row = employeeLock ? crud.get(HrEmployee.class, (Long) arguments[1]) : crud.get(HrLifecycleApplication.class, (Long) arguments[1]);
                return row.isEmpty() ? null : employeeLock ? JSON.convertValue(row, HrEmployee.class) : JSON.convertValue(row, HrLifecycleApplication.class);
            });
            service = new HrLifecycleService(crud, view, (employeeId, userId, employeeName, deptId, deptName, successorId) -> successorEvents.add(successorId), auth, JSON, directory, mapper);
        }

        Map<Long, Map<String, Object>> rows(Class<?> type) { return data.computeIfAbsent(type, ignored -> new LinkedHashMap<>()); }
        HrLifecycleStatusChangePayload statusPayload(Long id) {
            HrLifecycleStatusChangePayload payload = new HrLifecycleStatusChangePayload();
            payload.setVersion(service.getApplication(id).getVersion());
            return payload;
        }
        Map<String, Object> detail(Long applicationId) {
            return JSON.convertValue(rows(HrLifecycleDetail.class).values().stream().filter(row -> Objects.equals(row.get("applicationId"), applicationId)).findFirst().orElseThrow().get("detailJson"), new TypeReference<LinkedHashMap<String, Object>>() { });
        }
        HrLifecycleApplicationPayload payload() {
            HrLifecycleApplicationPayload payload = new HrLifecycleApplicationPayload();
            payload.setApplicationNo("H3-LEAVE-" + nextId); payload.setType("RESIGNATION"); payload.setEmployeeId(501L);
            payload.setSuccessorUserId(300L); payload.setEffectiveDate(LocalDate.of(2026, 9, 18));
            return payload;
        }
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        assertions++;
    }
    private static void fails(Runnable operation, String label) {
        try { operation.run(); } catch (HrBusinessException expected) { assertions++; return; }
        throw new AssertionError(label);
    }
    private static <Contract> Contract proxy(Class<Contract> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }
}
