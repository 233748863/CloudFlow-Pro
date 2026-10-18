package com.cloudflow.oa.service.impl;

import org.springframework.jdbc.datasource.AbstractDataSource;

import javax.sql.DataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;

/** 只统计计时调用中的JDBC连接、提交及SQL耗时，不修改SQL、事务或记录参数值。 */
final class OaAssetPlanSqlDiagnostics {
    private static final ThreadLocal<Timing> ACTIVE = new ThreadLocal<>();
    private OaAssetPlanSqlDiagnostics() { }

    private static final class Timing {
        long acquireNanos;
        long commitNanos;
        long executeNanos;
        long connectionNanos;
        long longestSqlNanos;
        int executions;
        String longestKind = "NONE";

        String report() {
            return "; jdbcAcquireMs=" + millis(acquireNanos) + "; jdbcCommitMs=" + millis(commitNanos)
                    + "; jdbcExecuteMs=" + millis(executeNanos) + "; jdbcConnectionMs=" + millis(connectionNanos)
                    + "; jdbcExecutions=" + executions + "; jdbcLongestKind=" + longestKind + "; jdbcLongestMs=" + millis(longestSqlNanos);
        }
    }

    static void begin() { ACTIVE.set(new Timing()); }
    static void clear() { ACTIVE.remove(); }
    static String report() { return ACTIVE.get().report(); }
    private static String millis(long nanos) { return BigDecimal.valueOf(nanos, 6).toPlainString(); }

    static DataSource wrap(DataSource delegate) {
        return new AbstractDataSource() {
            @Override public Connection getConnection() throws SQLException { return acquire(delegate, null, null); }
            @Override public Connection getConnection(String username, String password) throws SQLException { return acquire(delegate, username, password); }
        };
    }

    private static Connection acquire(DataSource source, String username, String password) throws SQLException {
        Timing timing = ACTIVE.get();
        if (timing == null) return username == null ? source.getConnection() : source.getConnection(username, password);
        long started = System.nanoTime();
        Connection connection;
        try { connection = username == null ? source.getConnection() : source.getConnection(username, password); }
        finally { timing.acquireNanos += System.nanoTime() - started; }
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (proxy, method, arguments) -> {
            long callStarted = System.nanoTime();
            Object result;
            try { result = invoke(connection, method, arguments); }
            finally {
                long elapsed = System.nanoTime() - callStarted;
                if ("commit".equals(method.getName())) timing.commitNanos += elapsed;
                else timing.connectionNanos += elapsed;
            }
            if (result instanceof Statement statement) {
                String sql = arguments != null && arguments.length > 0 && arguments[0] instanceof String value ? value : "";
                return statement(statement, sql, timing);
            }
            return result;
        });
    }

    private static Statement statement(Statement delegate, String sql, Timing timing) {
        Class<?> contract = delegate instanceof PreparedStatement ? PreparedStatement.class : Statement.class;
        return (Statement) Proxy.newProxyInstance(Statement.class.getClassLoader(), new Class<?>[] {contract}, (proxy, method, arguments) -> {
            if (!method.getName().startsWith("execute")) return invoke(delegate, method, arguments);
            long started = System.nanoTime();
            try { return invoke(delegate, method, arguments); }
            finally {
                long elapsed = System.nanoTime() - started;
                timing.executeNanos += elapsed; timing.executions++;
                if (elapsed > timing.longestSqlNanos) {
                    timing.longestSqlNanos = elapsed;
                    String statementSql = sql.isBlank() && arguments != null && arguments.length > 0 && arguments[0] instanceof String value ? value : sql;
                    timing.longestKind = kind(statementSql);
                }
            }
        });
    }

    private static String kind(String sql) {
        String normalized = sql.stripLeading().toUpperCase(java.util.Locale.ROOT);
        for (String kind : new String[] {"SELECT", "INSERT", "UPDATE", "DELETE"}) if (normalized.startsWith(kind + " ") || normalized.startsWith(kind + "\n")) return kind;
        return "OTHER";
    }

    private static Object invoke(Object target, Method method, Object[] arguments) throws Throwable {
        try { return method.invoke(target, arguments); }
        catch (InvocationTargetException exception) { throw exception.getCause(); }
    }
}
