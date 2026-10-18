package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeOnboardingResultVO;
import com.cloudflow.hr.event.consumer.HrEmployeeOnboardingSubmittedEventConsumer;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrLifecycleDetailMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ResultMapping;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

public final class HrEmployeeOnboardingChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        for (Class<?> entity : List.of(HrEmployee.class, HrLifecycleApplication.class, HrLifecycleDetail.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "hr-onboarding"), entity);
        }
        UserContext.setTenantId(100000L);
        UserContext.setUserId(7L);
        UserContext.setUserName("onboarding-check");
        try {
            checkSuccessAndCallback();
            checkAtomicPreparation();
            checkFailureRecovery();
            checkInstanceBindingRecovery();
            checkSuspendedCallerTransaction();
            checkEventGuards();
            checkDuplicateGuards();
            checkDetailMapper();
            HrLifecycleHandoverChecks.run();
        } finally {
            UserContext.clear();
        }
        equal(false, TransactionSynchronizationManager.isActualTransactionActive(), "transaction context cleaned");
        equal(false, WorkflowFallbackRetryContext.isRetrying(), "retry context cleaned");
        System.out.println("PASS: " + checks + " HR onboarding checks");
    }

    private static void checkSuccessAndCallback() throws Exception {
        Fixture fixture = new Fixture();
        HrEmployeeOnboardingResultVO response = fixture.service.submit(employee());
        equal(101L, response.getApplicationId(), "application identifier preserved");
        equal("HRLC-CHECK", response.getApplicationNo(), "application number preserved");
        equal("instance-101", response.getProcessInstanceId(), "synchronous workflow response preserved");
        equal(1, fixture.transactions.committed.applications.size(), "one application committed");
        equal(1, fixture.transactions.committed.details.size(), "one detail committed");
        equal(2, fixture.transactions.committed.tasks, "both lifecycle tasks committed");
        equal(0, fixture.transactions.committed.employees.size(), "employee waits for approval");
        equal(1, fixture.transactions.committed.events.size(), "one durable startup event");
        ProcessStartDTO request = fixture.savedRequest();
        equal(7L, request.getStartUserId(), "original initiator persisted");
        equal("onboarding_approval", request.getProcessDefinitionKey(), "definition key persisted");
        equal("ONBOARDING", request.getBusinessType(), "business type preserved");
        equal("CF-001", request.getVariables().get("employeeNo"), "normalized employee number preserved");
        fixture.consume();
        equal(1, fixture.workflowCalls, "successful duplicate event skips remote call");
        fixture.transactions.committed.applications.get(101L).setStatus("APPROVED");
        Long employeeId = new TransactionTemplate(fixture.transactions).execute(status ->
                fixture.service.createEmployeeFromApprovedApplication(101L));
        equal(501L, employeeId, "approved application creates employee");
        equal(1, fixture.transactions.committed.employees.size(), "one employee created");
        equal(501L, fixture.service.createEmployeeFromApprovedApplication(101L), "approval replay reuses employee");
    }

    private static void checkAtomicPreparation() throws Exception {
        for (boolean failOutbox : List.of(false, true)) {
            Fixture fixture = new Fixture();
            fixture.failPreparation = !failOutbox;
            fixture.failOutbox = failOutbox;
            expect(IllegalStateException.class, () -> fixture.service.submit(employee()), "local preparation failure propagates");
            equal(0, fixture.transactions.committed.applications.size(), "failed preparation leaves no application");
            equal(0, fixture.transactions.committed.details.size(), "failed preparation leaves no detail");
            equal(0, fixture.transactions.committed.tasks, "failed preparation leaves no tasks");
            equal(0, fixture.transactions.committed.events.size(), "failed preparation leaves no event");
            equal(0, fixture.workflowCalls, "failed preparation never calls workflow");
        }
        Fixture fixture = new Fixture();
        HrEmployeePayload invalid = employee();
        invalid.setEmployeeNo(" ");
        business("INVALID_PARAMETER", () -> fixture.service.submit(invalid));
        equal(0, fixture.transactions.committed.events.size(), "invalid input has no startup intent");
    }

    private static void checkFailureRecovery() throws Exception {
        for (int failureMode = 0; failureMode < 4; failureMode++) {
            Fixture fixture = new Fixture();
            int mode = failureMode;
            fixture.workflowResult = request -> switch (mode) {
                case 0 -> null;
                case 1 -> R.fail("workflow unavailable");
                case 2 -> R.ok("");
                default -> throw new IllegalStateException("response lost");
            };
            HrBusinessException failure = business("WORKFLOW_START_FAILED", () -> fixture.service.submit(employee()));
            equal(true, failure.getMessage().contains("HRLC-CHECK") && failure.getMessage().contains("已保存"), "failure explains durable application");
            equal(1, fixture.transactions.committed.applications.size(), "workflow failure retains application");
            equal(1, fixture.transactions.committed.events.size(), "workflow failure retains retry event");
            equal("APPROVING", fixture.transactions.committed.applications.get(101L).getStatus(), "failure does not reject application");
            equal(null, fixture.transactions.committed.applications.get(101L).getProcessInstanceId(), "failed call does not fabricate instance");
            equal(false, WorkflowFallbackRetryContext.isRetrying(), "failed attempt restores retry context");
            fixture.workflowResult = fixture::success;
            fixture.consume();
            equal("instance-101", fixture.transactions.committed.applications.get(101L).getProcessInstanceId(), "event retries and binds original application");
            fixture.consume();
            equal(2, fixture.workflowCalls, "replayed successful event is idempotent");
            equal(1, fixture.instances.size(), "one workflow business identity");
        }
    }

    private static void checkInstanceBindingRecovery() throws Exception {
        Fixture fixture = new Fixture();
        fixture.bindingFailures = 1;
        business("WORKFLOW_START_FAILED", () -> fixture.service.submit(employee()));
        equal(1, fixture.instances.size(), "workflow exists when binding fails");
        equal(null, fixture.transactions.committed.applications.get(101L).getProcessInstanceId(), "failed binding rolls back locally");
        fixture.consume();
        equal(1, fixture.instances.size(), "binding recovery reuses same business key");
        equal("instance-101", fixture.transactions.committed.applications.get(101L).getProcessInstanceId(), "binding recovers");

        Fixture concurrent = new Fixture();
        concurrent.workflowResult = request -> {
            R<String> response = concurrent.success(request);
            HrLifecycleApplication application = concurrent.transactions.committed.applications.get(request.getBusinessId());
            application.setProcessInstanceId(response.getData());
            application.setStatus("APPROVED");
            return response;
        };
        concurrent.service.submit(employee());
        equal("APPROVED", concurrent.transactions.committed.applications.get(101L).getStatus(), "late startup response preserves callback status");
    }

    private static void checkSuspendedCallerTransaction() {
        Fixture fixture = new Fixture();
        new TransactionTemplate(fixture.transactions).executeWithoutResult(status -> {
            active(true, "caller transaction active");
            fixture.service.submit(employee());
            active(true, "caller transaction restored after remote call");
            status.setRollbackOnly();
        });
        equal("instance-101", fixture.transactions.committed.applications.get(101L).getProcessInstanceId(), "startup only uses independently committed data");
        equal(1, fixture.transactions.committed.events.size(), "caller rollback cannot orphan started workflow");
    }

    private static void checkEventGuards() throws Exception {
        Fixture fixture = pendingFixture();
        BusinessEventEnvelope valid = fixture.transactions.committed.events.get(0);
        for (int mismatch = 0; mismatch < 3; mismatch++) {
            BusinessEventEnvelope invalid = JSON.convertValue(valid, BusinessEventEnvelope.class);
            if (mismatch == 0) invalid.setTenantId(200000L);
            if (mismatch == 1) invalid.setSourceId(999L);
            if (mismatch == 2) invalid.setSourceModule("cloudflow-oa");
            expect(IllegalArgumentException.class, () -> fixture.consumer.consume(invalid), "event identity mismatch rejected");
        }
        UserContext.setTenantId(200000L);
        try { business("ONBOARDING_REQUEST_INVALID", fixture::consume); }
        finally { UserContext.setTenantId(100000L); }
        equal(1, fixture.workflowCalls, "invalid event never calls workflow");
        fixture.transactions.committed.applications.get(101L).setTenantId(200000L);
        business("ONBOARDING_REQUEST_MISMATCH", fixture::consume);
        fixture.transactions.committed.applications.get(101L).setTenantId(100000L);
        fixture.transactions.committed.applications.get(101L).setStatus("CANCELLED");
        fixture.consume();
        equal(1, fixture.workflowCalls, "cancelled application does not start workflow");
        fixture.transactions.committed.applications.get(101L).setStatus("APPROVING");
        fixture.transactions.committed.applications.get(101L).setDeleted(1);
        fixture.consume();
        equal(1, fixture.workflowCalls, "deleted application does not start workflow");
    }

    private static void checkDuplicateGuards() throws Exception {
        Fixture existing = new Fixture();
        HrEmployee employee = new HrEmployee();
        employee.setEmployeeNo("CF-001"); employee.setTenantId(100000L); employee.setDeleted(0);
        existing.transactions.committed.employees.put(501L, employee);
        business("DUPLICATE_EMPLOYEE_NO", () -> existing.service.submit(employee()));
        equal(0, existing.workflowCalls, "existing employee blocks startup");
        Fixture pending = pendingFixture();
        business("DUPLICATE_ONBOARDING_EMPLOYEE_NO", () -> pending.service.submit(employee()));
        equal(1, pending.transactions.committed.applications.size(), "duplicate submission does not add application");
        equal(1, pending.transactions.committed.events.size(), "duplicate submission does not add event");
    }

    private static void checkDetailMapper() throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        String resource = "mapper/HrLifecycleDetailMapper.xml";
        try (InputStream input = HrEmployeeOnboardingChecks.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) throw new AssertionError("missing detail mapper resource");
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        MappedStatement statement = configuration.getMappedStatement(HrLifecycleDetailMapper.class.getName() + ".selectOnboardingDetail");
        BoundSql bound = statement.getBoundSql(Map.of("tenantId", 100000L, "applicationId", 101L));
        String sql = bound.getSql().replaceAll("\\s+", " ");
        equal(true, sql.contains("tenant_id = ?") && sql.contains("application_id = ?"), "detail query scopes tenant and application");
        equal(true, sql.contains("detail_type = 'ONBOARDING'") && sql.contains("ORDER BY id ASC LIMIT 1"), "detail query returns deterministic first onboarding record");
        equal(List.of("tenantId", "applicationId"), bound.getParameterMappings().stream().map(parameter -> parameter.getProperty()).toList(), "query uses bound parameters");
        ResultMapping jsonMapping = statement.getResultMaps().get(0).getResultMappings().stream()
                .filter(mapping -> "detailJson".equals(mapping.getProperty())).findFirst().orElseThrow();
        ResultSet result = proxy(ResultSet.class, (target, method, arguments) -> {
            if ("getString".equals(method.getName())) return "{\"employeeNo\":\"CF-001\"}";
            if ("wasNull".equals(method.getName())) return false;
            throw new UnsupportedOperationException(method.getName());
        });
        Object decoded = jsonMapping.getTypeHandler().getResult(result, "detail_json");
        equal(true, decoded instanceof JsonNode, "detail JSON retains JsonNode type");
        equal("CF-001", ((JsonNode) decoded).path("employeeNo").asText(), "detail JSON payload preserved");
    }

    private static Fixture pendingFixture() throws Exception {
        Fixture fixture = new Fixture();
        fixture.workflowResult = request -> R.fail("temporarily unavailable");
        business("WORKFLOW_START_FAILED", () -> fixture.service.submit(employee()));
        fixture.workflowResult = fixture::success;
        return fixture;
    }

    private static HrEmployeePayload employee() {
        HrEmployeePayload payload = new HrEmployeePayload();
        payload.setEmployeeNo(" CF-001 "); payload.setName(" 待入职员工 ");
        payload.setEmployeeStatus("PENDING"); payload.setDeptId(10L);
        payload.setHireDate(LocalDate.of(2026, 9, 6));
        return payload;
    }

    private static final class Fixture {
        final MemoryTransactions transactions = new MemoryTransactions();
        final Map<Long, String> instances = new LinkedHashMap<>();
        final HrEmployeeOnboardingService service;
        final HrEmployeeOnboardingSubmittedEventConsumer consumer;
        Function<ProcessStartDTO, R<String>> workflowResult = this::success;
        int workflowCalls;
        int bindingFailures;
        boolean failPreparation;
        boolean failOutbox;
        long nextApplicationId = 101L;

        Fixture() {
            HrEmployeeMapper employees = proxy(HrEmployeeMapper.class, (target, method, arguments) -> {
                if (!"selectCount".equals(method.getName())) throw new UnsupportedOperationException(method.getName());
                AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> query = (AbstractWrapper<?, ?, ?>) arguments[0];
                equal(true, query.getSqlSegment().contains("tenant_id") && query.getSqlSegment().contains("deleted"), "employee uniqueness query is tenant scoped");
                return transactions.state().employees.values().stream().filter(employee ->
                        Objects.equals(employee.getTenantId(), UserContext.getTenantId()) && Integer.valueOf(0).equals(employee.getDeleted())
                                && query.getParamNameValuePairs().containsValue(employee.getEmployeeNo())).count();
            });
            HrLifecycleApplicationMapper applications = proxy(HrLifecycleApplicationMapper.class, (target, method, arguments) -> {
                if ("selectById".equals(method.getName())) {
                    HrLifecycleApplication application = transactions.state().applications.get(arguments[0]);
                    return application == null ? null : JSON.convertValue(application, HrLifecycleApplication.class);
                }
                if (!"selectList".equals(method.getName())) throw new UnsupportedOperationException(method.getName());
                AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> query = (AbstractWrapper<?, ?, ?>) arguments[0];
                equal(true, query.getSqlSegment().contains("tenant_id") && query.getSqlSegment().contains("status IN"), "active application query retains filters");
                return transactions.state().applications.values().stream().filter(application ->
                        Objects.equals(application.getTenantId(), UserContext.getTenantId()) && Integer.valueOf(0).equals(application.getDeleted())
                                && Set.of("DRAFT", "APPROVING", "APPROVED").contains(application.getStatus())).toList();
            });
            HrLifecycleDetailMapper details = proxy(HrLifecycleDetailMapper.class, (target, method, arguments) -> {
                equal("selectOnboardingDetail", method.getName(), "onboarding queries use XML mapper");
                equal(UserContext.getTenantId(), arguments[0], "detail query passes current tenant");
                HrLifecycleDetail detail = transactions.state().details.get(arguments[1]);
                return detail == null || !Objects.equals(detail.getTenantId(), arguments[0]) ? null : JSON.convertValue(detail, HrLifecycleDetail.class);
            });
            HrTypedCrudService crud = new HrTypedCrudService(null, JSON, employees, null, null, null, null, null, null, null, null) {
                @Override public Map<String, Object> toMap(Object payload) { return JSON.convertValue(payload, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {}); }
                @Override public <Entity> void updateProperties(Class<Entity> entityClass, Long identifier, Map<String, Object> payload) {
                    active(true, "binding and employee association use local transaction");
                    if (payload.containsKey("processInstanceId") && bindingFailures-- > 0) throw new IllegalStateException("binding unavailable");
                    HrLifecycleApplication application = transactions.writable().applications.get(identifier);
                    if (payload.containsKey("processInstanceId")) application.setProcessInstanceId((String) payload.get("processInstanceId"));
                    if (payload.containsKey("employeeId")) application.setEmployeeId((Long) payload.get("employeeId"));
                }
                @Override public <Entity> Long create(Class<Entity> entityClass, Object payload) {
                    equal(HrEmployee.class, entityClass, "approval creates employee entity");
                    active(true, "employee creation remains transactional");
                    HrEmployee employee = JSON.convertValue(payload, HrEmployee.class);
                    employee.setId(501L); employee.setTenantId(UserContext.getTenantId()); employee.setDeleted(0);
                    transactions.writable().employees.put(501L, employee);
                    return 501L;
                }
            };
            HrViewSupport view = new HrViewSupport(crud, null, JSON) {
                @Override public void putDeptName(Map<String, Object> payload) { payload.put("deptName", "研发部"); }
                @Override public void putPostName(Map<String, Object> payload) {}
                @Override public void putPositionSnapshot(Map<String, Object> payload) {}
            };
            HrLifecycleService lifecycle = new HrLifecycleService(crud, view, null, null, JSON, null, null) {
                @Override String nextApplicationNo() { return "HRLC-CHECK"; }
                @Override Long createApplication(HrLifecycleApplicationPayload payload, Map<String, Object> employeeDetail) {
                    active(true, "application aggregate saved atomically");
                    long identifier = nextApplicationId++;
                    HrLifecycleApplication application = JSON.convertValue(payload, HrLifecycleApplication.class);
                    application.setId(identifier); application.setTenantId(UserContext.getTenantId()); application.setDeleted(0);
                    transactions.writable().applications.put(identifier, application);
                    HrLifecycleDetail detail = new HrLifecycleDetail();
                    detail.setId(identifier); detail.setApplicationId(identifier); detail.setTenantId(UserContext.getTenantId());
                    detail.setDetailType("ONBOARDING"); detail.setDetailJson(JSON.valueToTree(employeeDetail));
                    transactions.writable().details.put(identifier, detail); transactions.writable().tasks += 2;
                    if (failPreparation) throw new IllegalStateException("preparation failed");
                    return identifier;
                }
            };
            RuntimeSysConfigService configuration = new RuntimeSysConfigService(null) {
                @Override public String getString(String key, String defaultValue) { return defaultValue; }
            };
            OutboxPublisher publisher = new OutboxPublisher(null, JSON) {
                @Override public void publish(BusinessEventEnvelope envelope) {
                    active(true, "startup intent participates in application transaction");
                    if (failOutbox) throw new IllegalStateException("outbox unavailable");
                    transactions.writable().events.add(JSON.convertValue(envelope, BusinessEventEnvelope.class));
                }
            };
            WorkflowServiceClient workflow = proxy(WorkflowServiceClient.class, (target, method, arguments) -> {
                equal("startProcess", method.getName(), "existing workflow client retained");
                active(false, "workflow call has no database transaction");
                equal(true, WorkflowFallbackRetryContext.isRetrying(), "durable intent prevents duplicate fallback outbox");
                ProcessStartDTO request = (ProcessStartDTO) arguments[0];
                equal(true, transactions.committed.applications.containsKey(request.getBusinessId()), "workflow sees committed application");
                equal(1, transactions.committed.events.size(), "workflow sees committed retry intent");
                workflowCalls++;
                return workflowResult.apply(request);
            });
            service = new HrEmployeeOnboardingService(lifecycle, view, crud, workflow, configuration,
                    employees, applications, details, JSON, transactions, publisher);
            consumer = new HrEmployeeOnboardingSubmittedEventConsumer(JSON, service);
        }

        R<String> success(ProcessStartDTO request) { return R.ok(instances.computeIfAbsent(request.getBusinessId(), identifier -> "instance-" + identifier)); }
        ProcessStartDTO savedRequest() throws Exception { return JSON.readValue(transactions.committed.events.get(0).getPayload(), ProcessStartDTO.class); }
        void consume() throws Exception { consumer.consume(transactions.committed.events.get(0)); }
    }

    private static final class DatabaseState {
        final Map<Long, HrLifecycleApplication> applications = new LinkedHashMap<>();
        final Map<Long, HrLifecycleDetail> details = new LinkedHashMap<>();
        final Map<Long, HrEmployee> employees = new LinkedHashMap<>();
        final List<BusinessEventEnvelope> events = new ArrayList<>();
        int tasks;

        DatabaseState copy() {
            DatabaseState copied = new DatabaseState();
            applications.forEach((identifier, value) -> copied.applications.put(identifier, JSON.convertValue(value, HrLifecycleApplication.class)));
            details.forEach((identifier, value) -> copied.details.put(identifier, JSON.convertValue(value, HrLifecycleDetail.class)));
            employees.forEach((identifier, value) -> copied.employees.put(identifier, JSON.convertValue(value, HrEmployee.class)));
            events.forEach(value -> copied.events.add(JSON.convertValue(value, BusinessEventEnvelope.class)));
            copied.tasks = tasks;
            return copied;
        }
    }

    private static final class MemoryTransactions extends AbstractPlatformTransactionManager {
        private final ThreadLocal<MemoryTransaction> current = new ThreadLocal<>();
        DatabaseState committed = new DatabaseState();

        DatabaseState state() { return current.get() == null ? committed : current.get().data; }
        DatabaseState writable() {
            if (current.get() == null) throw new AssertionError("database write outside transaction");
            current.get().dirty = true;
            return current.get().data;
        }
        @Override protected Object doGetTransaction() { return new TransactionHandle(current.get()); }
        @Override protected boolean isExistingTransaction(Object transaction) { return ((TransactionHandle) transaction).transaction != null; }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) {
            MemoryTransaction started = new MemoryTransaction(committed.copy());
            ((TransactionHandle) transaction).transaction = started;
            current.set(started);
        }
        @Override protected Object doSuspend(Object transaction) {
            MemoryTransaction suspended = ((TransactionHandle) transaction).transaction;
            ((TransactionHandle) transaction).transaction = null;
            current.remove();
            return suspended;
        }
        @Override protected void doResume(Object transaction, Object suspended) {
            if (transaction != null) ((TransactionHandle) transaction).transaction = (MemoryTransaction) suspended;
            current.set((MemoryTransaction) suspended);
        }
        @Override protected void doCommit(DefaultTransactionStatus status) {
            MemoryTransaction transaction = ((TransactionHandle) status.getTransaction()).transaction;
            if (transaction.dirty) committed = transaction.data;
        }
        @Override protected void doRollback(DefaultTransactionStatus status) {}
        @Override protected void doCleanupAfterCompletion(Object transaction) { current.remove(); }
    }

    private static final class MemoryTransaction {
        final DatabaseState data;
        boolean dirty;
        MemoryTransaction(DatabaseState data) { this.data = data; }
    }

    private static final class TransactionHandle {
        MemoryTransaction transaction;
        TransactionHandle(MemoryTransaction transaction) { this.transaction = transaction; }
    }

    private static void active(boolean expected, String label) { equal(expected, TransactionSynchronizationManager.isActualTransactionActive(), label); }
    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
    private static HrBusinessException business(String code, CheckedRunnable operation) throws Exception {
        HrBusinessException failure = expect(HrBusinessException.class, operation, "business exception expected");
        equal(code, failure.getCode(), "business failure code");
        return failure;
    }
    private static <Failure extends Throwable> Failure expect(Class<Failure> type, CheckedRunnable operation, String label) throws Exception {
        try { operation.run(); }
        catch (Throwable failure) {
            if (!type.isInstance(failure)) throw new AssertionError(label, failure);
            checks++;
            return type.cast(failure);
        }
        throw new AssertionError(label + ": expected " + type.getSimpleName());
    }
    private static <Interface> Interface proxy(Class<Interface> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }
    @FunctionalInterface private interface CheckedRunnable { void run() throws Exception; }
}
