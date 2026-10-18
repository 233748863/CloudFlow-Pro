package com.cloudflow.common.datasource.runtime;

import com.zaxxer.hikari.HikariDataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;
import javax.sql.DataSource;

public final class ManagedRuntimeDataSource implements DataSource, AutoCloseable {
    private final long configId;
    private final ScheduledExecutorService retirement;
    private final List<HikariDataSource> retiring = new ArrayList<>();
    private State current = new State(null, 0);
    private boolean closed;

    public ManagedRuntimeDataSource(long configId, ScheduledExecutorService retirement) {
        this.configId = configId;
        this.retirement = retirement;
    }

    public synchronized State state() { return current; }

    public synchronized State exchange(State candidate) {
        if (closed) throw new DataSourceFailure("INSTANCE_STOPPING", "服务实例正在停止", 503);
        State previous = current;
        current = candidate;
        return previous;
    }

    public synchronized void retire(State previous) {
        if (previous.pool() == null || previous.pool() == current.pool()) return;
        retiring.add(previous.pool());
        drain(previous.pool(), System.nanoTime() + TimeUnit.SECONDS.toNanos(60));
    }

    private synchronized void drain(HikariDataSource pool, long deadline) {
        if (pool.isClosed() || pool.getHikariPoolMXBean() == null
                || pool.getHikariPoolMXBean().getActiveConnections() == 0 || System.nanoTime() >= deadline || closed) {
            pool.close();
            retiring.remove(pool);
            return;
        }
        retirement.schedule(() -> drain(pool, deadline), 1, TimeUnit.SECONDS);
    }

    public long configId() { return configId; }

    @Override
    public synchronized Connection getConnection() throws SQLException {
        if (closed || current.pool() == null) throw new SQLException("运行时数据源已停用", "08003");
        return current.pool().getConnection();
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        throw new SQLFeatureNotSupportedException("运行时数据源不接受调用方凭据");
    }

    @Override
    public synchronized void close() {
        closed = true;
        if (current.pool() != null) current.pool().close();
        for (HikariDataSource pool : retiring) pool.close();
        retiring.clear();
        current = new State(null, current.version());
    }

    @Override
    public PrintWriter getLogWriter() { return null; }

    @Override
    public void setLogWriter(PrintWriter output) throws SQLException { throw new SQLFeatureNotSupportedException(); }

    @Override
    public void setLoginTimeout(int seconds) throws SQLException { throw new SQLFeatureNotSupportedException(); }

    @Override
    public int getLoginTimeout() { return 5; }

    @Override
    public Logger getParentLogger() { return Logger.getLogger("com.cloudflow.datasource.runtime"); }

    @Override
    public <Target> Target unwrap(Class<Target> type) throws SQLException {
        if (type != null && type.isInstance(this)) return type.cast(this);
        throw new SQLFeatureNotSupportedException("禁止取得运行时连接池内部对象");
    }

    @Override
    public boolean isWrapperFor(Class<?> type) { return type != null && type.isInstance(this); }

    public record State(HikariDataSource pool, int version) {
        @Override
        public String toString() { return "RuntimeDataSourceState[active=" + (pool != null) + ", version=" + version + "]"; }
    }
}
