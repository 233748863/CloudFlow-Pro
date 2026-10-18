package com.cloudflow.auth.job;

import com.cloudflow.common.audit.service.AuditLogArchiveService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 真实服务和MySQL基本检查；使用一次性数据库，租户枚举由测试指定。 */
public final class ObservabilityArchiveBasicChecks {
    private static HikariDataSource dataSource;
    private static int checks;

    public static void main(String[] args) throws Exception {
        if (args.length != 3 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.*")) {
            throw new IllegalArgumentException("Owned loopback JDBC, datadir and workspace required");
        }
        String schema = "g3_archive_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        try (Connection owner = DriverManager.getConnection(args[0], "root", ""); Statement statement = owner.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT @@datadir")) {
                check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()), "owned datadir");
            }
            statement.execute("CREATE DATABASE " + schema + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            try {
                HikariConfig config = new HikariConfig();
                config.setJdbcUrl(args[0].replace("/cloud_flow_db?", "/" + schema + "?"));
                config.setUsername("root"); config.setPassword(""); config.setMaximumPoolSize(1); config.setMinimumIdle(1);
                dataSource = new HikariDataSource(config);
                String formal = Files.readString(Path.of(args[2], "cloudflow-backend/DB/01.cloudflow-common.sql"));
                for (String table : List.of("sys_log", "sys_api_error_log", "sys_audit_log", "sys_audit_archive_policy")) {
                    Matcher ddl = Pattern.compile("(?s)CREATE TABLE " + table + " [(].*?ENGINE=InnoDB.*?;").matcher(formal);
                    check(ddl.find(), "formal definition " + table); execute(ddl.group());
                }
                for (String trigger : List.of("trg_sys_log_no_delete", "trg_sys_log_no_update", "trg_sys_audit_log_no_delete", "trg_sys_audit_log_no_update")) {
                    Matcher ddl = Pattern.compile("(?s)CREATE TRIGGER " + trigger + ".*?END[$][$]").matcher(formal);
                    check(ddl.find(), "formal trigger " + trigger); execute(ddl.group().replace("$$", ""));
                }
                basic();
                System.out.println("OBSERVABILITY_ARCHIVE_BASIC: checks=" + checks + "; failed=0; real_service_mysql=true; tenant_enumeration_controlled=true; full_http_browser=false");
            } finally {
                TenantContext.clear(); UserContext.clear();
                if (dataSource != null) dataSource.close();
                if (!schema.matches("g3_archive_[a-f0-9]{12}")) throw new IllegalStateException("Schema boundary");
                statement.execute("DROP DATABASE " + schema);
                try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='" + schema + "'")) {
                    check(result.next() && result.getInt(1) == 0, "disposable schema removed");
                }
                System.out.println("OBSERVABILITY_ARCHIVE_CLEANUP: schema_removed=true; original_schema_untouched=true");
            }
        }
    }

    private static void basic() throws Exception {
        execute("INSERT INTO sys_log(log_id,tenant_id,title,params,exception,trace_id,create_time) VALUES (1,10,'中文 👑 ','{\"k\":null}',NULL,'trace-1',DATE_SUB(NOW(),INTERVAL 31 DAY)), (2,10,'fresh',NULL,NULL,NULL,DATE_SUB(NOW(),INTERVAL 29 DAY)), (3,20,'tenant20',NULL,NULL,NULL,DATE_SUB(NOW(),INTERVAL 31 DAY)), (4,30,'excluded',NULL,NULL,NULL,DATE_SUB(NOW(),INTERVAL 31 DAY)), (5,10,'null-time',NULL,NULL,NULL,NULL)");
        execute("INSERT INTO sys_api_error_log(error_id,tenant_id,exception_message,exception_stack,process_status,process_remark,occur_time) VALUES (1,10,'中文 👑 ', 'stack ', 'DONE','resolved ',DATE_SUB(NOW(),INTERVAL 181 DAY)), (2,10,'fresh',NULL,'TODO',NULL,DATE_SUB(NOW(),INTERVAL 179 DAY)), (3,20,'tenant20',NULL,'TODO',NULL,DATE_SUB(NOW(),INTERVAL 181 DAY)), (4,30,'excluded',NULL,'TODO',NULL,DATE_SUB(NOW(),INTERVAL 181 DAY)), (5,10,'null-time',NULL,'TODO',NULL,NULL)");
        List<String> access = snapshot("sys_log", "log_id", 1);
        List<String> error = snapshot("sys_api_error_log", "error_id", 1);
        TenantContext.setTenantId(91L); UserContext.setTenantId(92L);
        caught(() -> new AuditLogArchiveService(dataSource, false).archiveObservabilityLogsForCurrentTenant(), "context mismatch rejected");
        JobResult preview = job(true, List.of(10L, 20L)).archiveExpiredLogs();
        check(preview.getAffectedRows() == 0 && preview.getResultMsg().contains("候选4条"), "preview counts 30/180 days and two tenants");
        check(scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()") == 4, "preview creates no cold tables");
        JobResult result = job(false, List.of(10L, 20L)).archiveExpiredLogs();
        check(result.getAffectedRows() == 4 && result.getResultMsg().contains("新增4条"), "default archive moves four originals");
        check(access.equals(snapshot("sys_log_archive", "log_id", 1)), "every access column preserved");
        check(error.equals(snapshot("sys_api_error_log_archive", "error_id", 1)), "every error column and processing state preserved");
        check(scalar("SELECT COUNT(*) FROM sys_log") == 3 && scalar("SELECT COUNT(*) FROM sys_api_error_log") == 3, "newer null-date and excluded-tenant rows remain");
        check(job(false, List.of(10L, 20L)).archiveExpiredLogs().getAffectedRows() == 0, "repeat creates no duplicates");
        check(Objects.equals(TenantContext.getTenantId(), 91L) && Objects.equals(UserContext.getTenantId(), 92L), "both caller contexts restored");
        rejectedSql("DELETE FROM sys_log WHERE log_id=2", "manual delete remains blocked");
        rejectedSql("UPDATE sys_log SET title='changed' WHERE log_id=2", "manual update remains blocked");
        check(scalar("SELECT COALESCE(@cloudflow_observability_archive_allow_delete,0)") == 0, "pooled connection exemption reset");

        execute("INSERT INTO sys_log(log_id,tenant_id,title,create_time) VALUES (6,10,'original ',DATE_SUB(NOW(),INTERVAL 31 DAY))");
        execute("INSERT INTO sys_log_archive SELECT * FROM sys_log WHERE log_id=6");
        execute("UPDATE sys_log_archive SET title='original' WHERE log_id=6");
        execute("INSERT INTO sys_api_error_log(error_id,tenant_id,occur_time) VALUES (6,10,DATE_SUB(NOW(),INTERVAL 181 DAY))");
        caught(() -> job(false, List.of(10L)).archiveExpiredLogs(), "conflicting copy reports failure");
        check(scalar("SELECT COUNT(*) FROM sys_log WHERE log_id=6") == 1, "binary trailing-space conflict preserves original");
        check(scalar("SELECT COUNT(*) FROM sys_api_error_log_archive WHERE error_id=6") == 1, "unaffected error type continues");
        execute("DELETE FROM sys_log_archive WHERE log_id=6");
        check(job(false, List.of(10L)).archiveExpiredLogs().getAffectedRows() == 1, "recovery moves failed original once");
        execute("INSERT INTO sys_audit_archive_policy(biz_module,retain_days,archive_table,status) VALUES ('__ACCESS_LOG__',1,'custom_access','INACTIVE'),('__API_ERROR_LOG__',1,'custom_error','ACTIVE'),('smoke',1,'audit_smoke','ACTIVE')");
        check(job(false, List.of(10L)).archiveExpiredLogs().getAffectedRows() == 1, "custom error policy uses configured retention");
        check(scalar("SELECT COUNT(*) FROM sys_log WHERE log_id=2") == 1, "inactive access policy overrides defaults");
        check(scalar("SELECT COUNT(*) FROM custom_error WHERE error_id=2") == 1, "custom cold table used");
        execute("UPDATE sys_audit_archive_policy SET archive_table='sys_api_error_log',status='ACTIVE' WHERE biz_module='__ACCESS_LOG__'");
        caught(() -> job(false, List.of(10L)).archiveExpiredLogs(), "online table cannot be archive target");
        execute("INSERT INTO sys_audit_log(audit_id,tenant_id,biz_module,create_time) VALUES (1,10,'smoke',DATE_SUB(NOW(),INTERVAL 2 DAY))");
        AuditLogArchiveService.ArchiveResult audit = TenantBroker.applyAs(10L, ignored -> new AuditLogArchiveService(dataSource, false).archiveExpiredLogsForCurrentTenant());
        check(audit.getDeleted() == 1 && scalar("SELECT COUNT(*) FROM audit_smoke") == 1, "existing audit path ignores observability policies");
        check(scalar("SELECT COALESCE(@cloudflow_audit_archive_allow_delete,0)") == 0, "audit exemption reset");
    }

    private static ObservabilityLogArchiveJob job(boolean dryRun, List<Long> tenants) {
        return new ObservabilityLogArchiveJob(new TenantIterator(null) {
            @Override public List<Long> listActiveTenantIds() { return tenants; }
        }, dataSource, dryRun);
    }
    private static List<String> snapshot(String table, String id, long value) throws SQLException {
        List<String> values = new ArrayList<>();
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement("SELECT * FROM " + table + " WHERE " + id + "=?")) {
            statement.setLong(1, value);
            try (ResultSet result = statement.executeQuery()) {
                if (result.next()) for (int index = 1; index <= result.getMetaData().getColumnCount(); index++) values.add(result.getString(index));
            }
        }
        return values;
    }
    private static void execute(String sql) throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) { statement.execute(sql); }
    }
    private static long scalar(String sql) throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            if (!result.next()) throw new IllegalStateException("Expected scalar"); return result.getLong(1);
        }
    }
    private static void rejectedSql(String sql, String label) throws SQLException {
        try { execute(sql); throw new AssertionError(label); } catch (SQLException exception) { check(exception.getMessage().contains("ERR.AUDIT_IMMUTABLE"), label); }
    }
    private static void caught(Runnable action, String label) {
        try { action.run(); throw new AssertionError(label); } catch (RuntimeException exception) { check(true, label); }
    }
    private static void check(boolean passed, String label) { if (!passed) throw new AssertionError(label); checks++; }
}
