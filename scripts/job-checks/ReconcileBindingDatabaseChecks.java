package com.cloudflow.workflow.job;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.config.WorkflowBusinessTypeContributor;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import com.cloudflow.workflow.mapper.WfReconcileAlertMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Savepoint;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;

/** Real compiled registry, real mapper and original 374-table isolated database; all sample rows roll back. */
public final class ReconcileBindingDatabaseChecks {
    private record Binding(String code, String module, String table, String id, String process, String status,
                           String pending, List<String> finished) { }
    private record Column(String name, String type, int size, boolean required, boolean automatic) { }
    private static final String CATALOGUE = """
            HR_RECRUITMENT|hr|hr_recruitment_requisition|id|process_instance_id|status|PENDING|RECRUITING
            HR_LIFECYCLE|hr|hr_lifecycle_application|id|process_instance_id|status|PENDING|APPROVED
            HR_TIME_REQUEST|hr|hr_time_request|id|process_instance_id|status|PENDING|APPROVED
            OFFER|hr|hr_offer|id|process_instance_id|status|PENDING|APPROVED,SENT,ACCEPTED,EXPIRED
            HR_COMP_CHANGE|hr|hr_comp_change|id|process_instance_id|status|PENDING|APPROVED
            HR_PERFORMANCE_PLAN|hr|hr_performance_objective|id|plan_process_instance_id|status|PLAN_APPROVING|PLAN_APPROVED,RESULT_APPROVING,RESULT_APPROVED,COMPLETED,REJECTED,CANCELLED
            HR_PERFORMANCE_RESULT|hr|hr_performance_objective|id|result_process_instance_id|status|RESULT_APPROVING|RESULT_APPROVED,COMPLETED,REJECTED,CANCELLED
            HR_CERTIFICATE_REQUEST|hr|hr_certificate_request|id|process_instance_id|status|PENDING|APPROVED,ISSUED
            HR_CONTRACT_SIGN|hr|hr_contract_signature|id|process_instance_id|sign_status|SIGNING|SIGNED,REJECTED,EXPIRED,CANCELLED
            HR_TRAINING_ENROLLMENT|hr|hr_training_enrollment|id|process_instance_id|status|PENDING|APPROVED,ATTENDED,PASSED,WITHDRAWN
            HR_TALENT_REVIEW|hr|hr_talent_review|id|process_instance_id|status|PENDING|PUBLISHED,ARCHIVED
            HR_TALENT_SUCCESSION|hr|hr_talent_succession_plan|id|process_instance_id|status|PENDING|PUBLISHED,ARCHIVED
            HR_BENEFIT_REQUEST|hr|hr_benefit_request|id|process_instance_id|status|PENDING|APPROVED,PAID
            HR_MALL_ORDER|hr|hr_mall_order|id|process_instance_id|status|PENDING|APPROVED,SHIPPED
            HR_WORK_INJURY|hr|hr_work_injury|id|process_instance_id|status|PENDING|DETERMINED,COMPENSATING,REHABILITATING,CLOSED
            HR_LABOR_DISPUTE|hr|hr_labor_dispute|id|process_instance_id|status|PENDING|AWARDED,EXECUTED,CLOSED
            HR_ATTENDANCE_APPEAL|hr|hr_attendance_appeal|id|instance_id|status|PENDING|APPROVED
            HR_PAYROLL_CORRECTION|hr|hr_payroll_correction|correction_id|instance_id|status|PENDING|APPROVED,APPLIED
            HR_OVERTIME|hr|hr_overtime_request|request_id|instance_id|status|SUBMITTED|APPROVED
            HR_SHIFT_REQUEST|hr|hr_shift_request|request_id|instance_id|status|PENDING|APPROVED
            HR_REFERRAL|hr|hr_employee_referral|referral_id|instance_id|bonus_status|PENDING|APPROVED,PAID
            HR_ADVANCE|hr|hr_employee_advance|advance_id|instance_id|approval_status|SUBMITTED|APPROVED
            HR_SETTLEMENT|hr|hr_final_settlement|settlement_id|instance_id|approval_status|SUBMITTED|APPROVED
            OA_EXPENSE_CLAIM|oa|biz_expense_claim|id|instance_id|status|PENDING|APPROVED,PAID
            OA_PURCHASE_REQUEST|oa|biz_purchase_request|id|instance_id|status|PENDING|APPROVED,PARTIAL_RECEIVED,RECEIVED
            OA_CONSUMABLE_REQUEST|oa|oa_consumable_request|request_id|instance_id|status|PENDING|APPROVED,ISSUED
            OA_MEETING_BOOKING|oa|oa_schedule_event|event_id|instance_id|approval_status|PENDING|APPROVED
            OA_PAYMENT_REQUEST|oa|biz_payment_request|id|instance_id|status|PENDING|APPROVED,PAID
            OA_CONTRACT|oa|oa_contract|contract_id|instance_id|status|PENDING|APPROVED,SEALING,SEALED,ACTIVE,EXPIRED,TERMINATED
            OA_BUSINESS_TRIP|oa|biz_business_trip|id|instance_id|status|PENDING|APPROVED
            OA_BUDGET_PLAN|oa|oa_budget_plan|budget_id|instance_id|status|PENDING|APPROVED
            OA_BUDGET_ADJUSTMENT|oa|oa_budget_adjustment|adjustment_id|instance_id|status|PENDING|APPROVED
            OA_PROJECT|oa|oa_project|project_id|instance_id|status|PENDING|APPROVED,IN_PROGRESS,COMPLETED,ARCHIVED
            OA_KNOWLEDGE|oa|oa_knowledge_document|document_id|instance_id|status|PENDING|APPROVED,PUBLISHED
            OA_SEAL_APPLICATION|oa|oa_seal_application|id|instance_id|status|PENDING|APPROVED,BORROWED,RETURNED,OVERDUE
            OA_LICENSE_BORROW|oa|oa_license_borrow|id|instance_id|status|PENDING|APPROVED,BORROWED,RETURNED,OVERDUE
            OA_VEHICLE_USAGE|oa|oa_vehicle_usage|usage_id|process_instance_id|status|0|1,2,3,4,5
            CRM_APPROVAL|crm|crm_approval|approval_id|instance_id|status|PENDING|APPROVED,REJECTED
            CRM_QUOTE|crm|crm_quote|quote_id|instance_id|status|PENDING|APPROVED,SENT,ACCEPTED,EXPIRED
            CRM_RENEWAL|crm|crm_renewal|renewal_id|instance_id|status|PENDING|WON,LOST,CLOSED
            CRM_CUSTOMER_CREDIT|crm|crm_approval|approval_id|instance_id|status|PENDING|APPROVED,REJECTED
            CRM_OPPORTUNITY_DOWNGRADE|crm|crm_approval|approval_id|instance_id|status|PENDING|APPROVED,REJECTED
            AUTH_DICT_CHANGE|auth|sys_dict_change_approval|approval_id|instance_id|status|PENDING|APPROVED,REJECTED
            """;
    private final SqlSession session;
    private final Connection connection;
    private final WfReconcileAlertMapper mapper;
    private final List<BusinessTypeDef> types;
    private final Map<String, List<Column>> columns = new HashMap<>();
    private final String marker = "A3B" + UUID.randomUUID().toString().replace("-", "").substring(0, 18);
    private static int checks;
    private int scenarios;
    private int fixtures;

    private ReconcileBindingDatabaseChecks(SqlSession session, List<BusinessTypeDef> types) {
        this.session = session; this.connection = session.getConnection();
        this.mapper = session.getMapper(WfReconcileAlertMapper.class); this.types = types;
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.*")) {
            throw new IllegalArgumentException("Owned integration database required");
        }
        BusinessTypeRegistry registry = new BusinessTypeRegistry();
        new WorkflowBusinessTypeContributor().contribute(registry);
        List<Binding> catalogue = CATALOGUE.lines().filter((String line) -> !line.isBlank()).map((String line) -> {
            String[] fields = line.trim().split("\\|");
            return new Binding(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6], Arrays.asList(fields[7].split(",")));
        }).toList();
        equal(43, registry.size(), "compiled registry count"); equal(43, catalogue.size(), "independent fixture catalogue count");
        equal(catalogue.stream().map(Binding::code).collect(Collectors.toSet()), registry.all().stream().map(BusinessTypeDef::getCode).collect(Collectors.toSet()), "registry codes");
        try (HikariDataSource data = new HikariDataSource()) {
            data.setJdbcUrl(arguments[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(1);
            MybatisConfiguration config = new MybatisConfiguration(); config.setMapUnderscoreToCamelCase(true);
            config.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            config.setEnvironment(new Environment("owned-reconcile", new JdbcTransactionFactory(), data));
            config.addMapper(WfReconcileAlertMapper.class);
            for (String file : List.of("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfReconcileAlertMapper.xml", "scripts/job-checks/ReconcileBindingFixtures.xml")) {
                try (InputStream input = Files.newInputStream(Path.of(file))) { new XMLMapperBuilder(input, config, file, config.getSqlFragments()).parse(); }
            }
            SqlSessionFactory factory = new SqlSessionFactoryBuilder().build(config);
            try (SqlSession session = factory.openSession(false)) {
                ReconcileBindingDatabaseChecks suite = new ReconcileBindingDatabaseChecks(session, List.copyOf(registry.all()));
                try (PreparedStatement statement = suite.connection.prepareStatement("SELECT @@datadir"); ResultSet result = statement.executeQuery()) {
                    require(result.next(), "database directory returned"); equal(Path.of(arguments[1]).toRealPath(), Path.of(result.getString(1)).toRealPath(), "owned database directory");
                }
                equal(374L, suite.scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'"), "original complete schema");
                suite.connection.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
                Throwable failure = null;
                try {
                    for (Binding binding : catalogue) suite.verify(binding, Objects.requireNonNull(registry.get(binding.code())));
                    suite.verifyPerformance(catalogue.stream().filter((Binding binding) -> binding.code().equals("HR_PERFORMANCE_PLAN")).findFirst().orElseThrow());
                } catch (Exception | AssertionError caught) {
                    failure = caught;
                } finally { session.rollback(true); }
                session.clearCache();
                for (Binding binding : catalogue) equal(0L, session.selectOne("reconcileFixtures.countMarker", Map.of("table", binding.table(), "processField", binding.process(), "marker", suite.marker + "%")), "business samples rolled back " + binding.code());
                equal(0L, session.selectOne("reconcileFixtures.countMarker", Map.of("table", "wf_process_instance", "processField", "instance_id", "marker", suite.marker + "%")), "process samples rolled back");
                System.out.println("RECONCILE_BINDINGS_ROLLBACK: marker=" + suite.marker + "; business_samples=0; process_samples=0; committed_samples=0");
                if (failure != null) throw new IllegalStateException("Binding verification failed; samples rolled back", failure);
                System.out.println("RECONCILE_BINDINGS_DATABASE: checks=" + checks + "; scenarios=" + suite.scenarios + "; bindings=43; tables=40; fixtures=" + suite.fixtures
                        + "; failed=0; real_registry=true; real_mapper=true; schema=374; transaction_rolled_back=true; committed_samples=0; auto_increment_gaps_possible=true");
            }
        }
    }

    private void verify(Binding binding, BusinessTypeDef definition) throws Exception {
        for (String identifier : List.of(binding.table(), binding.id(), binding.process(), binding.status())) require(identifier.matches("[a-z_]+"), "safe fixture identifier");
        equal(binding.module(), definition.getModule(), binding.code() + " module"); equal(binding.table(), definition.getBusinessTable(), binding.code() + " table");
        equal(binding.id(), definition.getIdField(), binding.code() + " key"); equal(binding.process(), definition.getProcessInstanceIdField(), binding.code() + " process field");
        equal(binding.status(), definition.getStatusField(), binding.code() + " status field");
        Set<String> actualColumns = metadata(binding.table()).stream().map(Column::name).collect(Collectors.toSet());
        require(actualColumns.containsAll(Set.of(binding.id(), binding.process(), binding.status(), "tenant_id")), binding.code() + " real schema columns");
        Savepoint savepoint = connection.setSavepoint();
        String instance = marker + "-" + binding.code();
        long tenant = binding.module().equals("crm") ? 100001L : 100000L;
        try {
            process(instance, tenant, "RUNNING");
            long id = business(binding, instance, tenant, binding.pending());
            scenario(binding, id, instance, tenant, binding.pending(), "RUNNING", false);
            for (String terminal : List.of("PASSED", "AUTO_PASSED", "REJECTED", "CANCELLED", "INVALIDATED", "TERMINATED")) scenario(binding, id, instance, tenant, binding.pending(), terminal, true);
            for (String finished : binding.finished()) {
                scenario(binding, id, instance, tenant, finished, "RUNNING", true);
                scenario(binding, id, instance, tenant, finished, "PASSED", false);
            }
            scenario(binding, id, instance, tenant, binding.pending(), "PASSED", true);
            update("wf_process_instance", "instance_id", instance, tenant, Map.of("tenant_id", tenant == 100000L ? 100001L : 100000L));
            expect(binding, id, instance, tenant, binding.pending(), "PASSED", false, "foreign tenant never joined");
            update("wf_process_instance", "instance_id", instance, tenant == 100000L ? 100001L : 100000L, Map.of("tenant_id", tenant, "start_time", Timestamp.valueOf(LocalDateTime.now().minusDays(8)), "create_time", Timestamp.valueOf(LocalDateTime.now().minusDays(8))));
            expect(binding, id, instance, tenant, binding.pending(), "PASSED", false, "eight day old excluded");
            update("wf_process_instance", "instance_id", instance, tenant, Map.of("end_time", Timestamp.valueOf(LocalDateTime.now())));
            expect(binding, id, instance, tenant, binding.pending(), "PASSED", true, "recent end of old process included");
            Map<String, Object> missing = new LinkedHashMap<>(); missing.put(binding.process(), null);
            update(binding.table(), binding.id(), id, tenant, missing);
            expect(binding, id, instance, tenant, binding.pending(), "PASSED", false, "missing process excluded");
            update(binding.table(), binding.id(), id, tenant, Map.of(binding.process(), ""));
            expect(binding, id, instance, tenant, binding.pending(), "PASSED", false, "empty process excluded");
            System.out.println("RECONCILE_BINDING_PASS: code=" + binding.code() + "; pending=" + binding.pending() + "; subsequent_states=" + binding.finished().size() + "; real_schema=true");
        } finally { connection.rollback(savepoint); connection.releaseSavepoint(savepoint); session.clearCache(); }
    }

    private void verifyPerformance(Binding plan) throws Exception {
        Savepoint savepoint = connection.setSavepoint();
        String first = marker + "-plan"; String second = marker + "-result";
        try {
            process(first, 100000L, "PASSED"); process(second, 100000L, "RUNNING");
            long id = business(plan, first, 100000L, "RESULT_APPROVING");
            update(plan.table(), plan.id(), id, 100000L, Map.of("result_process_instance_id", second));
            equal(List.of(), own(), "completed plan with active result is consistent"); scenarios++;
            update("wf_process_instance", "instance_id", second, 100000L, Map.of("status", "PASSED"));
            equal(List.of(second), own().stream().map(WfReconcileAlert::getWfInstanceId).toList(), "only pending result drifts after its workflow completes"); scenarios++;
            update(plan.table(), plan.id(), id, 100000L, Map.of("status", "COMPLETED"));
            equal(List.of(), own(), "both stages completed without false alert"); scenarios++;
            update("wf_process_instance", "instance_id", first, 100000L, Map.of("status", "RUNNING"));
            equal(List.of(first), own().stream().map(WfReconcileAlert::getWfInstanceId).toList(), "plan reverse drift uses original plan workflow"); scenarios++;
            update("wf_process_instance", "instance_id", second, 100000L, Map.of("status", "RUNNING"));
            equal(Set.of(first, second), own().stream().map(WfReconcileAlert::getWfInstanceId).collect(Collectors.toSet()), "two different stage drifts remain distinct"); scenarios++;
        } finally { connection.rollback(savepoint); connection.releaseSavepoint(savepoint); session.clearCache(); }
    }

    private void scenario(Binding binding, long id, String instance, long tenant, String businessStatus, String processStatus, boolean drift) {
        update(binding.table(), binding.id(), id, tenant, Map.of(binding.status(), businessStatus));
        Map<String, Object> values = new LinkedHashMap<>(); values.put("status", processStatus); values.put("end_time", null);
        update("wf_process_instance", "instance_id", instance, tenant, values);
        expect(binding, id, instance, tenant, businessStatus, processStatus, drift, businessStatus + "/" + processStatus);
    }

    private void expect(Binding binding, long id, String instance, long tenant, String businessStatus, String processStatus, boolean drift, String label) {
        List<WfReconcileAlert> actual = own(); equal(drift ? 1 : 0, actual.size(), binding.code() + " " + label); scenarios++;
        if (drift) {
            WfReconcileAlert alert = actual.get(0);
            equal(tenant, alert.getTenantId(), "actual tenant"); equal(binding.module(), alert.getBizModule(), "actual module"); equal(id, alert.getBizId(), "actual business id");
            equal(instance, alert.getWfInstanceId(), "actual process"); equal(businessStatus, alert.getBizStatus(), "actual business status"); equal(processStatus, alert.getWfStatus(), "actual workflow status");
        }
    }

    private List<WfReconcileAlert> own() {
        session.clearCache();
        return mapper.selectInconsistentRecords(7, types).stream().filter((WfReconcileAlert alert) -> alert.getWfInstanceId().startsWith(marker)).toList();
    }

    private long business(Binding binding, String instance, long tenant, String status) throws Exception {
        Map<String, Object> values = new LinkedHashMap<>();
        for (Column column : metadata(binding.table())) if (column.required() && !column.automatic()) values.put(column.name(), sampleValue(column));
        if (binding.code().equals("HR_OVERTIME")) {
            values.put("settle_mode", "PAY"); values.put("requested_minutes", 60);
            values.put("end_time", Timestamp.valueOf("2026-10-03 10:00:00"));
        }
        if (binding.code().equals("HR_SHIFT_REQUEST")) values.put("to_shift_id", 998765433L);
        if (binding.code().equals("HR_REFERRAL")) values.put("email", marker + "@example.invalid");
        values.put("tenant_id", tenant); values.put(binding.process(), instance); values.put(binding.status(), status);
        insert(binding.table(), values); fixtures++;
        return scalar("SELECT LAST_INSERT_ID()");
    }

    private Object sampleValue(Column column) {
        return switch (column.type()) {
            case "tinyint", "smallint", "mediumint", "year", "bit" -> 1L;
            case "int", "bigint" -> 998765432L;
            case "decimal", "double", "float" -> BigDecimal.ONE;
            case "date" -> java.sql.Date.valueOf("2026-10-03");
            case "datetime", "timestamp" -> Timestamp.valueOf("2026-10-03 09:00:00");
            case "time" -> java.sql.Time.valueOf("09:00:00");
            case "json" -> "{}";
            case "char", "varchar", "text", "mediumtext", "longtext", "tinytext" -> marker.substring(0, Math.min(marker.length(), column.size() == 0 ? marker.length() : column.size()));
            default -> throw new IllegalArgumentException("Unsupported required fixture column: " + column.name() + "/" + column.type());
        };
    }

    private List<Column> metadata(String table) throws Exception {
        if (columns.containsKey(table)) return columns.get(table);
        List<Column> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("SELECT column_name,data_type,COALESCE(character_maximum_length,0),is_nullable,column_default,extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position")) {
            statement.setString(1, table);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    String name = rows.getString(1); require(name.matches("[a-z_0-9]+"), "safe schema column");
                    result.add(new Column(name, rows.getString(2), (int) Math.min(Integer.MAX_VALUE, rows.getLong(3)), rows.getString(4).equals("NO") && rows.getObject(5) == null, rows.getString(6).contains("auto_increment")));
                }
            }
        }
        require(!result.isEmpty(), "original table exists " + table); columns.put(table, result); return result;
    }

    private void process(String instance, long tenant, String status) {
        insert("wf_process_instance", Map.of("instance_id", instance, "tenant_id", tenant, "process_def_key", marker, "business_key", instance,
                "start_user_id", 1L, "status", status, "start_time", Timestamp.valueOf(LocalDateTime.now()), "create_time", Timestamp.valueOf(LocalDateTime.now())));
    }

    private void insert(String table, Map<String, Object> values) { equal(1, session.insert("reconcileFixtures.insertRow", Map.of("table", table, "values", values)), "sample insert " + table); }
    private void update(String table, String idField, Object id, long tenant, Map<String, Object> values) {
        equal(1, session.update("reconcileFixtures.updateRow", Map.of("table", table, "idField", idField, "id", id, "tenant", tenant, "values", values)), "sample update " + table);
    }
    private long scalar(String sql) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql); ResultSet result = statement.executeQuery()) { require(result.next(), "scalar result"); return result.getLong(1); }
    }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual); checks++; }
    private static void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
}
