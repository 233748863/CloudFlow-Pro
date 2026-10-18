package com.cloudflow.common.audit.service;

import com.cloudflow.common.audit.domain.SysAuditArchivePolicyEntity;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** 按现有策略归档；每项策略完整提交，源记录只在逐字段核对归档副本后移出。 */
@RequiredArgsConstructor
public class AuditLogArchiveService {
    private static final Pattern SAFE_TABLE_NAME = Pattern.compile("^[A-Za-z0-9_]{1,64}$");
    private static final int COPY_BATCH_SIZE = 500;
    private static final List<String> AUDIT_COLUMNS = List.of("audit_id", "tenant_id", "biz_module", "audit_name",
            "audit_field", "before_val", "after_val", "before_json", "after_json", "diff_json", "high_risk",
            "risk_level", "create_by", "create_time");
    private static final LogSource AUDIT = new LogSource("sys_audit_log", "audit_id", "create_time", AUDIT_COLUMNS, true);
    private static final LogSource ACCESS = new LogSource("sys_log", "log_id", "create_time", List.of(
            "log_id", "tenant_id", "log_type", "title", "service_id", "remote_addr", "user_agent",
            "request_uri", "method", "params", "time", "exception", "create_by", "create_time",
            "trace_id", "service_name", "request_method", "request_url", "duration_ms", "result_code",
            "client_ip", "slow_flag"), true);
    private static final LogSource API_ERROR = new LogSource("sys_api_error_log", "error_id", "occur_time", List.of(
            "error_id", "tenant_id", "trace_id", "service_name", "user_id", "user_name", "request_method",
            "request_url", "request_params", "exception_class", "exception_message", "exception_stack",
            "client_ip", "user_agent", "occur_time", "process_status", "process_by", "process_time",
            "process_remark", "create_time"), true);
    private static final String ACCESS_POLICY = "__ACCESS_LOG__";
    private static final String ERROR_POLICY = "__API_ERROR_LOG__";
    private final DataSource dataSource;
    @Getter private final boolean dryRun;

    public ArchiveResult archiveExpiredLogsForCurrentTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || !Objects.equals(tenantId, TenantContext.getTenantId())) {
            throw new IllegalStateException("审计归档必须指定一致的租户上下文");
        }
        List<SysAuditArchivePolicyEntity> policies = loadActivePolicies();
        List<RuntimeException> failures = new ArrayList<>();
        int inserted = 0;
        int deleted = 0;
        int candidates = 0;
        for (SysAuditArchivePolicyEntity policy : policies) {
            try {
                ArchiveResult result = archivePolicy(policy, tenantId, AUDIT);
                inserted = Math.addExact(inserted, result.getInserted());
                deleted = Math.addExact(deleted, result.getDeleted());
                candidates = Math.addExact(candidates, result.getCandidates());
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("审计归档策略失败：" + policy.getId(), exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("审计归档存在失败策略：" + failures.size());
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return new ArchiveResult(inserted, deleted, candidates, dryRun);
    }

    /** 访问日志默认30天、错误日志180天；复用策略表，核对冷表后再移出在线表。 */
    public ArchiveResult archiveObservabilityLogsForCurrentTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || !Objects.equals(tenantId, TenantContext.getTenantId())) {
            throw new IllegalStateException("日志归档必须指定一致的租户上下文");
        }
        List<RuntimeException> failures = new ArrayList<>();
        int inserted = 0;
        int deleted = 0;
        int candidates = 0;
        for (SysAuditArchivePolicyEntity policy : loadObservabilityPolicies()) {
            if (!"ACTIVE".equals(policy.getStatus()) || policy.getRetainDays() <= 0) continue;
            LogSource source = ACCESS_POLICY.equals(policy.getBizModule()) ? ACCESS : API_ERROR;
            try {
                ArchiveResult result = archivePolicy(policy, tenantId, source);
                inserted = Math.addExact(inserted, result.getInserted());
                deleted = Math.addExact(deleted, result.getDeleted());
                candidates = Math.addExact(candidates, result.getCandidates());
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("日志归档类型失败：" + source.table(), exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("可观测日志归档存在失败类型：" + failures.size());
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return new ArchiveResult(inserted, deleted, candidates, dryRun);
    }

    private List<SysAuditArchivePolicyEntity> loadObservabilityPolicies() {
        List<SysAuditArchivePolicyEntity> policies = new ArrayList<>();
        String sql = "SELECT id, biz_module, retain_days, archive_table, status FROM sys_audit_archive_policy "
                + "WHERE biz_module IN ('__ACCESS_LOG__', '__API_ERROR_LOG__') ORDER BY id";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            while (resultSet.next()) {
                SysAuditArchivePolicyEntity policy = new SysAuditArchivePolicyEntity();
                policy.setId(resultSet.getLong("id"));
                policy.setBizModule(resultSet.getString("biz_module"));
                policy.setRetainDays(resultSet.getInt("retain_days"));
                policy.setArchiveTable(resultSet.getString("archive_table"));
                policy.setStatus(resultSet.getString("status"));
                policies.add(policy);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("加载可观测日志归档策略失败", exception);
        }
        addDefaultPolicy(policies, ACCESS_POLICY, 30, "sys_log_archive");
        addDefaultPolicy(policies, ERROR_POLICY, 180, "sys_api_error_log_archive");
        return policies;
    }

    private void addDefaultPolicy(List<SysAuditArchivePolicyEntity> policies, String module, int days, String table) {
        if (policies.stream().anyMatch(policy -> module.equals(policy.getBizModule()))) return;
        SysAuditArchivePolicyEntity policy = new SysAuditArchivePolicyEntity();
        policy.setBizModule(module); policy.setRetainDays(days);
        policy.setArchiveTable(table); policy.setStatus("ACTIVE"); policies.add(policy);
    }

    private List<SysAuditArchivePolicyEntity> loadActivePolicies() {
        String sql = """
                SELECT id, biz_module, retain_days, archive_table, status
                FROM sys_audit_archive_policy
                WHERE status = 'ACTIVE' AND retain_days > 0
                  AND biz_module NOT IN ('__ACCESS_LOG__', '__API_ERROR_LOG__') ORDER BY id
                """;
        List<SysAuditArchivePolicyEntity> policies = new ArrayList<>();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            while (resultSet.next()) {
                SysAuditArchivePolicyEntity policy = new SysAuditArchivePolicyEntity();
                policy.setId(resultSet.getLong("id"));
                policy.setBizModule(resultSet.getString("biz_module"));
                policy.setRetainDays(resultSet.getInt("retain_days"));
                policy.setArchiveTable(resultSet.getString("archive_table"));
                policy.setStatus(resultSet.getString("status"));
                policies.add(policy);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("加载审计归档策略失败", exception);
        }
        return policies;
    }

    private ArchiveResult archivePolicy(SysAuditArchivePolicyEntity policy, Long tenantId, LogSource source) {
        String archiveTable = quoteArchiveTable(policy.getArchiveTable());
        if (dryRun) return countCandidates(policy, tenantId, source);
        // DDL会隐式提交，必须在复制/核对/删除事务之外完成。
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS %s LIKE %s".formatted(archiveTable, source.table()));
        } catch (SQLException exception) {
            throw new IllegalStateException("准备审计归档表失败", exception);
        }
        try (Connection connection = dataSource.getConnection()) {
            boolean autoCommit = connection.getAutoCommit();
            boolean transactionEnded = false;
            connection.setAutoCommit(false);
            try {
                Timestamp cutoff = cutoff(connection, policy.getRetainDays());
                long maximum = maximumId(connection, policy, tenantId, cutoff, source);
                long cursor = 0;
                int inserted = 0;
                int deleted = 0;
                int candidates = 0;
                while (cursor < maximum) {
                    List<Long> ids = lockBatch(connection, policy, tenantId, cutoff, cursor, maximum, source);
                    if (ids.isEmpty()) break;
                    inserted = Math.addExact(inserted, copyAndVerify(connection, archiveTable, tenantId, ids, source));
                    candidates = Math.addExact(candidates, ids.size());
                    if (source.removeVerified()) {
                        int moved = removeVerified(connection, tenantId, ids, source);
                        if (moved != ids.size()) throw new IllegalStateException("审计归档源记录移出数量不一致");
                        deleted = Math.addExact(deleted, moved);
                    }
                    cursor = ids.get(ids.size() - 1);
                }
                connection.commit();
                transactionEnded = true;
                return new ArchiveResult(inserted, deleted, candidates, false);
            } catch (SQLException | RuntimeException exception) {
                try { connection.rollback(); transactionEnded = true; }
                catch (SQLException rollbackFailure) {
                    exception.addSuppressed(rollbackFailure);
                    try { connection.abort(Runnable::run); } catch (SQLException abortFailure) { exception.addSuppressed(abortFailure); }
                }
                throw exception;
            } finally {
                // 回滚失败时不得通过setAutoCommit(true)意外提交尚未确认的修改。
                if (transactionEnded) connection.setAutoCommit(autoCommit);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("审计日志归档失败", exception);
        }
    }

    private ArchiveResult countCandidates(SysAuditArchivePolicyEntity policy, Long tenantId, LogSource source) {
        String sql = "SELECT COUNT(*) FROM " + source.table() + " WHERE " + filter(source)
                + source.timeColumn() + " < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)";
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = bindScope(statement, policy, tenantId, source);
            statement.setInt(index, policy.getRetainDays());
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) throw new IllegalStateException("审计预演统计未返回结果");
                return new ArchiveResult(0, 0, Math.toIntExact(resultSet.getLong(1)), true);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("审计日志归档预演失败", exception);
        }
    }

    private String filter(LogSource source) {
        return (source == AUDIT ? "biz_module = ? AND " : "") + "tenant_id = ? AND ";
    }

    private int bindScope(PreparedStatement statement, SysAuditArchivePolicyEntity policy, Long tenantId,
                          LogSource source) throws SQLException {
        int index = 1;
        if (source == AUDIT) statement.setString(index++, policy.getBizModule());
        statement.setLong(index++, tenantId);
        return index;
    }

    private Timestamp cutoff(Connection connection, int days) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)")) {
            statement.setInt(1, days);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) throw new IllegalStateException("审计归档截止时间未返回");
                return Objects.requireNonNull(resultSet.getTimestamp(1));
            }
        }
    }

    private long maximumId(Connection connection, SysAuditArchivePolicyEntity policy, Long tenantId,
                           Timestamp cutoff, LogSource source) throws SQLException {
        String sql = "SELECT COALESCE(MAX(" + source.idColumn() + "), 0) FROM " + source.table()
                + " WHERE " + filter(source) + source.timeColumn() + " < ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = bindScope(statement, policy, tenantId, source);
            statement.setTimestamp(index, cutoff);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) throw new IllegalStateException("审计归档范围未返回");
                return resultSet.getLong(1);
            }
        }
    }

    private List<Long> lockBatch(Connection connection, SysAuditArchivePolicyEntity policy, Long tenantId,
                                 Timestamp cutoff, long cursor, long maximum, LogSource source) throws SQLException {
        String sql = "SELECT " + source.idColumn() + " FROM " + source.table() + " WHERE " + filter(source)
                + source.timeColumn() + " < ? AND " + source.idColumn() + " > ? AND " + source.idColumn()
                + " <= ? ORDER BY " + source.idColumn() + " LIMIT ? FOR UPDATE";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            int index = bindScope(statement, policy, tenantId, source);
            statement.setTimestamp(index++, cutoff); statement.setLong(index++, cursor);
            statement.setLong(index++, maximum); statement.setInt(index, COPY_BATCH_SIZE);
            List<Long> ids = new ArrayList<>();
            try (ResultSet resultSet = statement.executeQuery()) { while (resultSet.next()) ids.add(resultSet.getLong(1)); }
            return ids;
        }
    }

    private int copyAndVerify(Connection connection, String archiveTable, Long tenantId, List<Long> ids, LogSource source) throws SQLException {
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        String columns = String.join(",", source.columns());
        String sourceColumns = source.columns().stream().map(column -> "s." + column).collect(Collectors.joining(","));
        String insertSql = """
                INSERT INTO %s (%s) SELECT %s FROM %s s
                LEFT JOIN %s a ON a.%s = s.%s
                WHERE s.tenant_id = ? AND s.%s IN (%s) AND a.%s IS NULL
                """.formatted(archiveTable, columns, sourceColumns, source.table(), archiveTable,
                        source.idColumn(), source.idColumn(), source.idColumn(), placeholders, source.idColumn());
        int inserted;
        try (PreparedStatement statement = connection.prepareStatement(insertSql)) {
            bindIds(statement, tenantId, ids); inserted = statement.executeUpdate();
        }
        String identical = source.columns().stream().map(column -> "(BINARY a.%s <=> BINARY s.%s)".formatted(column, column))
                .collect(Collectors.joining(" AND "));
        // 锁住全部归档副本直至提交；二进制NULL安全比较包含大小写及尾部空格。
        String verifySql = """
                SELECT s.%s, (a.%s IS NOT NULL AND (%s)) AS identical
                FROM %s s LEFT JOIN %s a ON a.%s = s.%s
                WHERE s.tenant_id = ? AND s.%s IN (%s) FOR UPDATE
                """.formatted(source.idColumn(), source.idColumn(), identical, source.table(), archiveTable,
                        source.idColumn(), source.idColumn(), source.idColumn(), placeholders);
        try (PreparedStatement statement = connection.prepareStatement(verifySql)) {
            bindIds(statement, tenantId, ids);
            int verified = 0;
            try (ResultSet resultSet = statement.executeQuery()) {
                while (resultSet.next()) {
                    if (!resultSet.getBoolean("identical")) throw new IllegalStateException("审计归档副本不完整或内容冲突，原日志保留");
                    verified++;
                }
            }
            if (verified != ids.size()) throw new IllegalStateException("审计归档核对数量不一致");
        }
        return inserted;
    }

    private int removeVerified(Connection connection, Long tenantId, List<Long> ids, LogSource source) throws SQLException {
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        String sql = "DELETE FROM %s WHERE tenant_id = ? AND %s IN (%s)"
                .formatted(source.table(), source.idColumn(), placeholders);
        String exemption = source == AUDIT ? "@cloudflow_audit_archive_allow_delete"
                : "@cloudflow_observability_archive_allow_delete";
        try (Statement flag = connection.createStatement()) {
            flag.execute("SET " + exemption + " = 1");
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                bindIds(statement, tenantId, ids); return statement.executeUpdate();
            } finally {
                try { flag.execute("SET " + exemption + " = NULL"); }
                catch (SQLException resetFailure) {
                    // 会话变量不随事务回滚；清除失败必须关闭底层连接，不能带删除豁免回到连接池。
                    try { connection.abort(Runnable::run); } catch (SQLException abortFailure) { resetFailure.addSuppressed(abortFailure); }
                    throw resetFailure;
                }
            }
        }
    }

    private void bindIds(PreparedStatement statement, Long tenantId, List<Long> ids) throws SQLException {
        statement.setLong(1, tenantId);
        for (int index = 0; index < ids.size(); index++) statement.setLong(index + 2, ids.get(index));
    }

    private String quoteArchiveTable(String archiveTable) {
        if (archiveTable == null || !SAFE_TABLE_NAME.matcher(archiveTable).matches()
                || List.of("sys_log", "sys_audit_log", "sys_login_log", "sys_api_error_log", "sys_audit_archive_policy")
                .stream().anyMatch(table -> table.equalsIgnoreCase(archiveTable))) {
            throw new IllegalArgumentException("非法审计归档表名");
        }
        return "`%s`".formatted(archiveTable);
    }

    private record LogSource(String table, String idColumn, String timeColumn, List<String> columns, boolean removeVerified) {}

    @Getter
    @RequiredArgsConstructor
    public static class ArchiveResult {
        private final int inserted;
        private final int deleted;
        private final int candidates;
        private final boolean dryRun;
    }
}
