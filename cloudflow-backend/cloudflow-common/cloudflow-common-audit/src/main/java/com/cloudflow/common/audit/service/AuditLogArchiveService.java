package com.cloudflow.common.audit.service;

import com.cloudflow.common.audit.domain.SysAuditArchivePolicyEntity;
import com.cloudflow.common.core.context.UserContext;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Archives expired audit logs to configured cold tables.
 */
@Slf4j
@RequiredArgsConstructor
public class AuditLogArchiveService {

    private static final Pattern SAFE_TABLE_NAME = Pattern.compile("^[A-Za-z0-9_]+$");

    private final DataSource dataSource;
    private final boolean dryRun;

    public ArchiveResult archiveExpiredLogsForCurrentTenant() {
        Long tenantId = UserContext.getTenantId();
        List<SysAuditArchivePolicyEntity> policies = loadActivePolicies();
        int inserted = 0;
        int deleted = 0;
        int candidates = 0;
        for (SysAuditArchivePolicyEntity policy : policies) {
            ArchiveResult result = archivePolicy(policy, tenantId);
            inserted += result.getInserted();
            deleted += result.getDeleted();
            candidates += result.getCandidates();
        }
        return new ArchiveResult(inserted, deleted, candidates, dryRun);
    }

    private List<SysAuditArchivePolicyEntity> loadActivePolicies() {
        String sql = """
                SELECT id, biz_module, retain_days, archive_table, status
                FROM sys_audit_archive_policy
                WHERE status = 'ACTIVE' AND retain_days > 0
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
        } catch (SQLException e) {
            throw new IllegalStateException("加载审计归档策略失败", e);
        }
        return policies;
    }

    private ArchiveResult archivePolicy(SysAuditArchivePolicyEntity policy, Long tenantId) {
        String archiveTable = quoteArchiveTable(policy.getArchiveTable());
        String tenantFilter = tenantId == null ? "" : " AND tenant_id = ?";
        String condition = " FROM sys_audit_log WHERE biz_module = ?"
                + tenantFilter
                + " AND create_time < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)";
        if (dryRun) {
            int candidates = countArchiveCandidates(condition, policy, tenantId);
            log.info("审计日志归档 dry-run: bizModule={}, archiveTable={}, tenantId={}, candidates={}",
                    policy.getBizModule(), archiveTable, tenantId, candidates);
            return new ArchiveResult(0, 0, candidates, true);
        }
        String insertSql = "INSERT IGNORE INTO %s SELECT *%s".formatted(archiveTable, condition);
        String deleteSql = "DELETE%s".formatted(condition);
        try (Connection connection = dataSource.getConnection()) {
            boolean autoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try {
                createArchiveTable(connection, archiveTable);
                int inserted = executeArchiveMutation(connection, insertSql, policy, tenantId);
                setArchiveDeleteFlag(connection, true);
                int deleted = executeArchiveMutation(connection, deleteSql, policy, tenantId);
                setArchiveDeleteFlag(connection, false);
                connection.commit();
                return new ArchiveResult(inserted, deleted, deleted, false);
            } catch (Exception e) {
                try {
                    setArchiveDeleteFlag(connection, false);
                } catch (SQLException resetError) {
                    log.warn("reset audit archive delete flag failed: {}", resetError.getMessage());
                }
                connection.rollback();
                throw e;
            } finally {
                connection.setAutoCommit(autoCommit);
            }
        } catch (Exception e) {
            throw new IllegalStateException("审计日志归档失败, bizModule=" + policy.getBizModule(), e);
        }
    }

    private int countArchiveCandidates(String condition, SysAuditArchivePolicyEntity policy, Long tenantId) {
        String countSql = "SELECT COUNT(*)%s".formatted(condition);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(countSql)) {
            bindArchiveParameters(statement, policy, tenantId);
            try (ResultSet resultSet = statement.executeQuery()) {
                return resultSet.next() ? resultSet.getInt(1) : 0;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("审计日志归档 dry-run 失败, bizModule=" + policy.getBizModule(), e);
        }
    }

    private void createArchiveTable(Connection connection, String archiveTable) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS " + archiveTable + " LIKE sys_audit_log");
        }
    }

    private int executeArchiveMutation(Connection connection, String sql, SysAuditArchivePolicyEntity policy, Long tenantId)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindArchiveParameters(statement, policy, tenantId);
            return statement.executeUpdate();
        }
    }

    private void bindArchiveParameters(PreparedStatement statement, SysAuditArchivePolicyEntity policy, Long tenantId)
            throws SQLException {
        int index = 1;
        statement.setString(index++, policy.getBizModule());
        if (tenantId != null) {
            statement.setLong(index++, tenantId);
        }
        statement.setInt(index, policy.getRetainDays());
    }

    private void setArchiveDeleteFlag(Connection connection, boolean allow) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("SET @cloudflow_audit_archive_allow_delete = " + (allow ? "1" : "NULL"));
        }
    }

    private String quoteArchiveTable(String archiveTable) {
        if (archiveTable == null
                || !SAFE_TABLE_NAME.matcher(archiveTable).matches()
                || "sys_audit_log".equalsIgnoreCase(archiveTable)) {
            throw new IllegalArgumentException("非法审计归档表名: " + archiveTable);
        }
        return "`" + archiveTable + "`";
    }

    @Getter
    @RequiredArgsConstructor
    public static class ArchiveResult {
        private final int inserted;
        private final int deleted;
        private final int candidates;
        private final boolean dryRun;
    }
}
