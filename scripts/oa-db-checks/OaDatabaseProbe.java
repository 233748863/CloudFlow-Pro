import java.sql.ResultSet;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Intercepts({
        @Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class}),
        @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})
})
public final class OaDatabaseProbe implements Interceptor {
    static final ThreadLocal<String> ACTOR = new ThreadLocal<>();
    final List<Call> calls = new CopyOnWriteArrayList<>();
    private final Map<String, AtomicInteger> ordinals = new ConcurrentHashMap<>();
    private final List<Watch> watches = new CopyOnWriteArrayList<>();

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        String actor = ACTOR.get();
        if (actor == null) return invocation.proceed();
        String statement = ((MappedStatement) invocation.getArgs()[0]).getId();
        int ordinal = ordinals.computeIfAbsent(actor + ":" + statement, ignored -> new AtomicInteger()).incrementAndGet();
        Connection connection = ((Executor) invocation.getTarget()).getTransaction().getConnection();
        Call call = new Call(actor, statement, ordinal, connectionId(connection), TransactionSynchronizationManager.isActualTransactionActive(),
                connection.getAutoCommit(), connection.getTransactionIsolation(), "update".equals(invocation.getMethod().getName()));
        calls.add(call);
        for (Watch watch : watches) if (watch.matches(call, false)) watch.action.accept(connection);
        try {
            Object result = invocation.proceed();
            call.completed = true;
            if (result instanceof Integer count) call.affected = count;
            for (Watch watch : watches) if (watch.matches(call, true)) watch.action.accept(connection);
            return result;
        } catch (Throwable failure) {
            call.failure = failure;
            throw failure;
        }
    }

    void watch(String actor, String suffix, int ordinal, boolean after, ConnectionAction action) {
        watches.add(new Watch(actor, suffix, ordinal, after, action));
    }

    Gate gate(String actor, String suffix, int ordinal, boolean after) {
        Gate gate = new Gate();
        watch(actor, suffix, ordinal, after, connection -> {
            gate.connectionId = connectionId(connection);
            gate.entered.countDown();
            if (!gate.release.await(12, TimeUnit.SECONDS)) throw new IllegalStateException("DATABASE_GATE_TIMEOUT");
        });
        return gate;
    }

    Call awaitCall(String actor, String suffix) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            for (Call call : calls) if (call.actor.equals(actor) && call.statement.endsWith(suffix)) return call;
            Thread.sleep(10);
        }
        throw new AssertionError("EXPECTED_REAL_MAPPER_CALL_NOT_REACHED");
    }

    List<Call> forActor(String actor) {
        return calls.stream().filter(call -> call.actor.equals(actor)).toList();
    }

    long successfulWrites(String actor, String suffix) {
        return calls.stream().filter(call -> call.actor.equals(actor) && call.statement.endsWith(suffix)
                && call.write && call.completed && call.failure == null && call.affected > 0).count();
    }

    void clearWatches() {
        watches.clear();
    }

    static long connectionId(Connection connection) throws SQLException {
        try (Statement query = connection.createStatement(); ResultSet rows = query.executeQuery("SELECT CONNECTION_ID()")) {
            if (!rows.next()) throw new SQLException("CONNECTION_ID_UNAVAILABLE");
            return rows.getLong(1);
        }
    }

    static final class Call {
        final String actor;
        final String statement;
        final int ordinal;
        final long connectionId;
        final boolean transaction;
        final boolean autoCommit;
        final int isolation;
        final boolean write;
        volatile boolean completed;
        volatile int affected;
        volatile Throwable failure;

        Call(String actor, String statement, int ordinal, long connectionId, boolean transaction, boolean autoCommit, int isolation, boolean write) {
            this.actor = actor;
            this.statement = statement;
            this.ordinal = ordinal;
            this.connectionId = connectionId;
            this.transaction = transaction;
            this.autoCommit = autoCommit;
            this.isolation = isolation;
            this.write = write;
        }
    }

    static final class Gate implements AutoCloseable {
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        volatile long connectionId;

        void awaitEntered() throws InterruptedException {
            if (!entered.await(8, TimeUnit.SECONDS)) throw new AssertionError("DATABASE_GATE_NOT_REACHED");
        }

        @Override
        public void close() {
            release.countDown();
        }
    }

    private record Watch(String actor, String suffix, int ordinal, boolean after, ConnectionAction action) {
        boolean matches(Call call, boolean completed) {
            return call.actor.equals(actor) && call.statement.endsWith(suffix) && call.ordinal == ordinal && after == completed;
        }
    }

    @FunctionalInterface
    interface ConnectionAction {
        void accept(Connection connection) throws Exception;
    }
}
