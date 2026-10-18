package com.cloudflow.hr.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.hr.service.HrReferralProgressService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.support.GenericApplicationContext;

/** Formal registry/job/context; controlled business result; disposable real MySQL configuration. */
public final class ReferralEmploymentJobBasicChecks {
    private static int checks;

    public static void main(String[] args) throws Exception {
        if (args.length != 3 || !args[0].matches("jdbc:mysql://127[.]0[.]0[.]1:[0-9]+/cloud_flow_db[?].*")) {
            throw new IllegalArgumentException("Owned JDBC, datadir and workspace required");
        }
        try {
            caller(); registeredExecution(); failureAndEmpty(); configuration(args);
            System.out.println("REFERRAL_EMPLOYMENT_JOB_BASIC: checks=" + checks + "; failed=0; formal_registry_job_context=true; controlled_business=true; actual_mysql_configuration=true; http_and_natural_schedule=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void registeredExecution() throws Exception {
        List<Long> visits = new ArrayList<>();
        HrReferralProgressJob job = job(List.of(10L, 20L), Map.of(10L, 2, 20L, 3), visits, null);
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            context.registerBean("referralJob", HrReferralProgressJob.class, () -> job);
            context.refresh();
            JobHandlerRegistry registry = new JobHandlerRegistry(context); registry.refresh();
            check(registry.contains("hrReferralEmployment") && registry.list().size() == 1, "formal registry discovers single handler");
            check("hr-referral-employment".equals(registry.lockName("hrReferralEmployment")), "original distributed lock retained");
            JobResult result = registry.invoke("hrReferralEmployment", "");
            check("SUCCESS".equals(result.getExecuteStatus()) && Integer.valueOf(5).equals(result.getAffectedRows()), "actual changed rows returned");
            check("内推入职生效扫描完成：5条".equals(result.getResultMsg()), "execution summary");
            check(visits.equals(List.of(10L, 20L)), "every tenant visited"); restored();
        }
        check(job.getClass().getMethod("applyEmployment").getAnnotation(org.springframework.scheduling.annotation.Scheduled.class) == null, "no duplicate local timer");
    }

    private static void failureAndEmpty() {
        List<Long> visits = new ArrayList<>();
        RuntimeException original = new IllegalStateException("controlled business failure");
        RuntimeException failure = null;
        try { job(List.of(10L, 20L), Map.of(10L, 0, 20L, 3), visits, original).applyEmployment(); }
        catch (RuntimeException exception) { failure = exception; }
        check(failure != null && failure.getMessage().contains("已完成记录数：3"), "partial failure retains completed count");
        check(visits.equals(List.of(10L, 20L)), "failed tenant does not prevent later tenant");
        check(failure.getSuppressed().length == 1 && failure.getSuppressed()[0].getCause() == original, "original failure retained"); restored();
        visits.clear();
        check(job(List.of(), Map.of(), visits, null).applyEmployment().getAffectedRows() == 0 && visits.isEmpty(), "no tenant causes no business call");
        check(job(List.of(20L), Map.of(20L, 0), visits, null).applyEmployment().getAffectedRows() == 0, "empty scan returns zero");
    }

    private static HrReferralProgressJob job(List<Long> tenantIds, Map<Long, Integer> counts, List<Long> visits, RuntimeException failure) {
        TenantIterator tenants = new TenantIterator(null) {
            @Override public List<Long> listActiveTenantIds() { return tenantIds; }
        };
        HrReferralProgressService progress = new HrReferralProgressService(null, null, null, null, null) {
            @Override public int applyDueEmployment() {
                Long tenant = TenantContext.getTenantId();
                check(Objects.equals(tenant, UserContext.getTenantId()) && tenantIds.contains(tenant), "business context belongs to scanned tenant");
                check(UserContext.getUserId() == null && UserContext.getAuthToken() == null && UserContext.getDsType() == null && "system".equals(UserContext.getUserName()), "caller identity is not inherited");
                visits.add(tenant);
                if (failure != null && tenant.equals(10L)) throw failure;
                return counts.get(tenant);
            }
        };
        return new HrReferralProgressJob(tenants, progress);
    }

    private static void caller() {
        UserContext.setTenantId(9001L); TenantContext.setTenantId(9002L);
        UserContext.setUserId(99L); UserContext.setUserName("caller");
        UserContext.setAuthToken("check-token"); UserContext.setDsType(4);
    }

    private static void restored() {
        check(Objects.equals(UserContext.getTenantId(), 9001L) && Objects.equals(TenantContext.getTenantId(), 9002L)
                && Objects.equals(UserContext.getUserId(), 99L) && "caller".equals(UserContext.getUserName())
                && "check-token".equals(UserContext.getAuthToken()) && Integer.valueOf(4).equals(UserContext.getDsType()), "caller context restored");
    }

    private static void configuration(String[] args) throws Exception {
        String schema = "h2_referral_job_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Path root = Path.of(args[2]);
        List<String> migration = statements(Files.readString(root.resolve("cloudflow-backend/DB/migrations/20261017-h2-referral-employment-job.sql")));
        List<String> seed = statements(Files.readString(root.resolve("cloudflow-backend/DB/06.cloudflow-business-seed.sql")));
        check(migration.size() == 2 && seed.size() == 2, "both setup routes define handler and task");
        try (Connection owner = DriverManager.getConnection(args[0], "root", ""); Statement statement = owner.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT @@datadir")) {
                check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()), "owned datadir verified");
            }
            statement.execute("CREATE DATABASE " + schema + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            try (Connection isolated = DriverManager.getConnection(args[0].replace("/cloud_flow_db?", "/" + schema + "?"), "root", ""); Statement sql = isolated.createStatement()) {
                String formal = Files.readString(root.resolve("cloudflow-backend/DB/01.cloudflow-common.sql"));
                for (String table : List.of("sys_job_handler", "sys_job")) {
                    Matcher ddl = Pattern.compile("(?s)CREATE TABLE " + table + " [(].*?ENGINE=InnoDB.*?;").matcher(formal);
                    check(ddl.find(), "formal DDL " + table); sql.execute(ddl.group());
                }
                for (List<String> route : List.of(migration, seed)) {
                    for (String insert : route) sql.execute(insert);
                    check(count(sql, "SELECT COUNT(*) FROM sys_job_handler WHERE service_name='hr' AND handler_name='hrReferralEmployment' AND status='OFFLINE' AND last_report_time IS NULL") == 1, "new handler awaits real startup report");
                    check(count(sql, "SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND service_name='hr' AND handler_name='hrReferralEmployment' AND trigger_type='CRON' AND cron_expression='0 */5 * * * ?' AND status='ENABLED' AND concurrent_flag=0 AND misfire_strategy='IGNORE' AND timeout_seconds=240 AND lock_time_seconds=240 AND log_success_flag=1 AND alarm_on_fail_flag=1") == 1, "schedule lock logging and alarm defaults");
                    for (String insert : route) sql.execute(insert);
                    check(count(sql, "SELECT COUNT(*) FROM sys_job") == 1 && count(sql, "SELECT COUNT(*) FROM sys_job_handler") == 1, "repeat setup preserves single definitions");
                    sql.executeUpdate("UPDATE sys_job SET status='PAUSED',cron_expression='0 0 * * * ?',timeout_seconds=300");
                    sql.executeUpdate("UPDATE sys_job_handler SET status='ONLINE',last_report_time=NOW()");
                    for (String insert : migration) sql.execute(insert);
                    for (String insert : seed) sql.execute(insert);
                    check(count(sql, "SELECT COUNT(*) FROM sys_job WHERE status='PAUSED' AND cron_expression='0 0 * * * ?' AND timeout_seconds=300") == 1, "administrator configuration preserved");
                    check(count(sql, "SELECT COUNT(*) FROM sys_job_handler WHERE status='ONLINE' AND last_report_time IS NOT NULL") == 1, "real handler report preserved");
                    sql.executeUpdate("DELETE FROM sys_job"); sql.executeUpdate("DELETE FROM sys_job_handler");
                }
            } finally { statement.execute("DROP DATABASE " + schema); System.out.println("DISPOSABLE_SCHEMA_REMOVED: " + schema); }
        }
    }

    private static List<String> statements(String source) {
        List<String> result = new ArrayList<>();
        for (String sql : source.replace("cloud_flow_db.", "").replaceAll("(?m)^\\s*--[^\\r\\n]*", "").split(";")) {
            if (sql.contains("'hrReferralEmployment'") && sql.stripLeading().startsWith("INSERT INTO sys_job")) result.add(sql.trim());
        }
        return result;
    }

    private static int count(Statement sql, String query) throws Exception {
        try (ResultSet result = sql.executeQuery(query)) { result.next(); return result.getInt(1); }
    }

    private static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }
}
