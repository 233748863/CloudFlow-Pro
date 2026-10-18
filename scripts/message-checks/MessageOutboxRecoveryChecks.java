package com.cloudflow.auth.message;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.config.OutboxProperties;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxScheduler;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageOutboxRecoveryChecks {
    private final MessageDeliveryDatabaseChecks suite;
    private final OutboxEventMapper mapper;
    private final LocalDateTime now = LocalDateTime.now().withNano(0);

    private MessageOutboxRecoveryChecks(MessageDeliveryDatabaseChecks suite) {
        this.suite = suite;
        mapper = suite.mapper(OutboxEventMapper.class);
    }

    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        int before = suite.checks.get();
        MessageOutboxRecoveryChecks checks = new MessageOutboxRecoveryChecks(suite);
        checks.expiredClaim();
        checks.boundaries();
        checks.concurrentClaim();
        checks.schedulerRecovery();
        System.out.println("A2_OUTBOX_RECOVERY_CHECKS: assertions=" + (suite.checks.get() - before)
                + "; failed=0; mysql=true; actual_mapper=true; actual_scheduler=true; redis_double=true; dual_auth_processes=false");
    }

    private long insert(String status, LocalDateTime retryAt, String owner, LocalDateTime lockedUntil) {
        String eventId = "a2-recovery-" + UUID.randomUUID();
        suite.jdbc.update("INSERT INTO outbox_event(aggregate_type,aggregate_id,event_id,event_type,payload_json,status,retry_count,next_retry_at,tenant_id,locked_by,locked_until) VALUES ('A2_CHECK',1,?,'A2_RECOVERY',?, ?,0,?,?,?,?)",
                eventId, "{\"eventId\":\"" + eventId + "\"}", status, retryAt, suite.TENANT, owner, lockedUntil);
        return suite.jdbc.queryForObject("SELECT id FROM outbox_event WHERE event_id=?", Long.class, eventId);
    }

    private void expiredClaim() {
        long id = insert("PROCESSING", now.minusMinutes(2), "dead-worker", now.minusSeconds(1));
        suite.check(mapper.claimBatch("replacement", now, now.plusSeconds(30), 1) == 1,
                "expired PROCESSING event is reclaimed after worker interruption");
        OutboxEvent event = mapper.selectById(id);
        suite.check("PROCESSING".equals(event.getStatus()) && "replacement".equals(event.getLockedBy())
                && now.plusSeconds(30).equals(event.getLockedUntil()), "recovery atomically replaces owner and lease");
        suite.check(mapper.markPublished(id, "dead-worker", now) == 0, "stale worker cannot acknowledge replacement claim");
        suite.check(mapper.markFailed(id, "dead-worker", 1, now, "stale failure", "FAILED") == 0,
                "stale worker cannot fail replacement claim");
        suite.check(mapper.markPublished(id, "replacement", now) == 1, "replacement worker acknowledges recovered event");
        event = mapper.selectById(id);
        suite.check("PUBLISHED".equals(event.getStatus()) && event.getLockedBy() == null && event.getLockedUntil() == null,
                "recovered publication releases lease");
        suite.check(mapper.claimBatch("third-worker", now.plusMinutes(1), now.plusMinutes(2), 1) == 0,
                "published event cannot be reclaimed");
        suite.jdbc.update("DELETE FROM outbox_event WHERE id=?", id);
    }

    private void boundaries() {
        long live = insert("PROCESSING", now.minusMinutes(1), "live-worker", now.plusSeconds(30));
        long pending = insert("PENDING", now.plusSeconds(10), null, null);
        long failed = insert("FAILED", now.plusSeconds(10), null, null);
        long published = insert("PUBLISHED", now.minusMinutes(1), null, null);
        long deadLetter = insert("DLQ", now.minusMinutes(1), null, null);
        suite.check(mapper.claimBatch("boundary-worker", now, now.plusMinutes(1), 100) == 0,
                "active leases future retries and terminal states are excluded");
        suite.check("live-worker".equals(mapper.selectById(live).getLockedBy()), "active lease owner remains unchanged");
        suite.jdbc.update("DELETE FROM outbox_event WHERE id IN (?,?,?,?,?)", live, pending, failed, published, deadLetter);
        long duePending = insert("PENDING", now, null, null);
        long dueFailed = insert("FAILED", now, null, now);
        long dueProcessing = insert("PROCESSING", now, "boundary-expired", now);
        suite.check(mapper.claimBatch("due-worker", now, now.plusSeconds(30), 10) == 3,
                "retry and lease equality boundaries remain eligible");
        List<OutboxEvent> claimed = mapper.selectClaimedEvents("due-worker", 10);
        suite.check(claimed.size() == 3, "only claimed rows are selected for current owner");
        suite.jdbc.update("DELETE FROM outbox_event WHERE id IN (?,?,?)", duePending, dueFailed, dueProcessing);
    }

    private void concurrentClaim() throws Exception {
        long id = insert("PROCESSING", now.minusMinutes(2), "crashed-worker", now.minusSeconds(1));
        ExecutorService workers = Executors.newFixedThreadPool(2);
        List<Long> connections = new CopyOnWriteArrayList<>();
        try (Connection blocker = suite.jdbc.getDataSource().getConnection()) {
            blocker.setAutoCommit(false);
            try (PreparedStatement statement = blocker.prepareStatement("SELECT id FROM outbox_event WHERE id=? FOR UPDATE")) {
                statement.setLong(1, id);
                try (ResultSet rows = statement.executeQuery()) {
                    suite.check(rows.next(), "recovery race holds real MySQL row lock");
                }
            }
            Future<Integer> first = workers.submit(() -> claim("race-first", connections));
            Future<Integer> second = workers.submit(() -> claim("race-second", connections));
            try {
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
                int waiting = 0;
                while (System.nanoTime() < deadline) {
                    waiting = suite.jdbc.queryForObject("SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE l.OBJECT_SCHEMA=DATABASE() AND l.OBJECT_NAME='outbox_event'", Integer.class);
                    if (waiting == 2) break;
                    Thread.sleep(20);
                }
                suite.check(waiting == 2 && connections.size() == 2 && !connections.get(0).equals(connections.get(1)),
                        "two independent MySQL sessions contend for expired claim");
            } finally { blocker.commit(); }
            int firstCount = completedClaim(first);
            int secondCount = completedClaim(second);
            suite.check(firstCount + secondCount == 1, "concurrent recovery grants exactly one lease");
            String winner = firstCount == 1 ? "race-first" : "race-second";
            String loser = firstCount == 1 ? "race-second" : "race-first";
            suite.check(winner.equals(mapper.selectById(id).getLockedBy()), "winning recovery owner is persisted");
            suite.check(mapper.selectClaimedEvents(loser, 1).isEmpty(), "losing recovery owner has no event to publish");
            suite.check(mapper.claimBatch(loser, now, now.plusSeconds(30), 1) == 0,
                    "next scan after contention cannot steal active winning lease");
            suite.check(mapper.markPublished(id, winner, now) == 1, "winning recovery completes event once");
        } finally {
            workers.shutdownNow();
            workers.awaitTermination(5, TimeUnit.SECONDS);
            suite.jdbc.update("DELETE FROM outbox_event WHERE id=?", id);
        }
    }

    private int completedClaim(Future<Integer> result) throws Exception {
        try {
            return result.get(20, TimeUnit.SECONDS);
        } catch (ExecutionException failure) {
            Throwable cause = failure.getCause();
            while (cause != null) {
                if (cause instanceof SQLException sql && sql.getErrorCode() == 1213 && "40001".equals(sql.getSQLState())) {
                    suite.check(true, "MySQL contention loser rolls back with verified deadlock code 1213");
                    return 0;
                }
                cause = cause.getCause();
            }
            throw failure;
        }
    }

    private int claim(String owner, List<Long> connections) {
        UserContext.setTenantId(suite.TENANT);
        try {
            return new TransactionTemplate(suite.manager).execute(status -> {
                connections.add(suite.jdbc.queryForObject("SELECT CONNECTION_ID()", Long.class));
                return mapper.claimBatch(owner, now, now.plusSeconds(30), 1);
            });
        } finally { UserContext.clear(); }
    }

    private void schedulerRecovery() {
        long id = insert("PROCESSING", now.minusMinutes(2), "interrupted-instance", now.minusSeconds(1));
        List<Map<String, Object>> published = new CopyOnWriteArrayList<>();
        RedisStreamUtil transport = new RedisStreamUtil() {
            @Override public String publishGlobal(String key, Map<String, Object> content) {
                suite.check("a2:recovery:events".equals(key), "recovery scheduler uses configured stream");
                published.add(Map.copyOf(content));
                return published.size() + "-0";
            }
        };
        OutboxProperties properties = new OutboxProperties();
        properties.setOwner("restarted-instance");
        properties.setStreamKey("a2:recovery:events");
        properties.setStreamMaxLen(0);
        OutboxScheduler scheduler = new OutboxScheduler(mapper, transport, properties, suite.json,
                new DeadLetterPublisher(transport, "a2:recovery:dlq"));
        scheduler.scanAndPublish();
        suite.check(published.size() == 1 && "A2_RECOVERY".equals(published.get(0).get("eventType")),
                "actual scheduler publishes interrupted event after lease expiry");
        suite.check("PUBLISHED".equals(mapper.selectById(id).getStatus()), "actual scheduler persists recovered publication");
        scheduler.scanAndPublish();
        suite.check(published.size() == 1, "next scheduler scan leaves recovered publication unchanged");
        suite.jdbc.update("DELETE FROM outbox_event WHERE id=?", id);
    }
}
