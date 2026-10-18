import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WorkflowImCallbackMapper;
import com.cloudflow.workflow.service.IWfTaskService;
import com.cloudflow.workflow.service.WorkflowImButtonPolicy;
import com.cloudflow.workflow.service.WorkflowImCallbackGuard;
import com.cloudflow.workflow.service.WorkflowImCallbackService;
import com.cloudflow.workflow.service.WorkflowImCompletionContext;
import com.cloudflow.workflow.service.remote.ImCallbackVerificationClient;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

public final class WorkflowImCallbackDatabaseChecks {
    private static final long TENANT = 991901L;
    private static final long CONFIG = 993801L;
    private static final long ROLE = 993802L;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final WorkflowImCallbackMapper mapper;
    private final WorkflowImCallbackGuard guard;
    private final WorkflowImCallbackService service;
    private final Map<Long, ImTaskCallbacks.Actor> actors = new ConcurrentHashMap<>();
    private final AtomicBoolean denied = new AtomicBoolean();
    private final AtomicInteger verifications = new AtomicInteger();
    private int identities = 993810;
    private int assertions;
    private long approvalMenu;

    WorkflowImCallbackDatabaseChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, TransactionTemplate transactions,
            IWfTaskService tasks, WorkflowImButtonPolicy buttons) {
        this.jdbc = jdbc; this.transactions = transactions;
        mapper = sessions.getMapper(WorkflowImCallbackMapper.class);
        ImCallbackVerificationClient verifier = request -> {
            verifications.incrementAndGet();
            if (denied.get()) return R.fail(403, "controlled denial");
            ImTaskCallbacks.Actor actor = actors.get(request.callbackId());
            return actor != null && actor.request().equals(request) ? R.ok(actor) : R.fail(409, "controlled stale");
        };
        guard = new WorkflowImCallbackGuard(mapper, verifier);
        service = new WorkflowImCallbackService(mapper, guard, buttons, tasks);
    }

    void run(Supplier<WfTask> taskFactory) throws Exception {
        jdbc.update("INSERT INTO sys_im_config(config_id,tenant_id,im_type,corp_id,agent_id,app_secret_encrypted,status,version) VALUES (?,?,'WECOM','workflow-check','100001','controlled-ciphertext','DISABLED',0)", CONFIG, TENANT);
        approvalMenu = jdbc.queryForObject("SELECT menu_id FROM sys_menu WHERE perms='workflow:task:complete'", Long.class);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status) VALUES (?,?,'审批并发验证','im-callback-checks',1,'0')", ROLE, TENANT);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (?,?,?)", ROLE, approvalMenu, TENANT);
        feignHeaders();
        for (String action : List.of("APPROVE", "REJECT")) {
            WfTask task = taskFactory.get();
            ImTaskCallbacks.Actor actor = actor(task, action);
            int before = verifications.get();
            UserContext.setUserId(1L); UserContext.setTenantId(100000L); UserContext.setAuthToken("forged-local-context"); TenantContext.setTenantSkip();
            check("COMPLETED".equals(service.execute(actor.request()).status()), "exact event executes original task business");
            check(verifications.get() == before + 2, "identity verified before and inside locked task transaction");
            check(UserContext.getUserId() == null && UserContext.getAuthToken() == null && TenantContext.getTenantId() == null && !TenantContext.getTenantSkip(), "untrusted prior context and action context cleared");
            String history = history(actor);
            check(history != null, "committed action linked to persisted event");
            check(action.equals(jdbc.queryForObject("SELECT action FROM wf_task_history WHERE history_id=?", String.class, history)), "history action exactly matches event");
            denied.set(true);
            try { check("COMPLETED".equals(service.execute(actor.request()).status()), "lost response recovered from exact history after later identity revocation"); }
            finally { denied.set(false); }
            check(jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE task_id=?", Integer.class, task.getTaskId()) == 1, "repeat creates no second task history");
            ImTaskCallbacks.Actor otherEvent = actor(task, action);
            check("REJECTED".equals(service.execute(otherEvent.request()).status()), "another event cannot claim already completed task");
            check(history(otherEvent) == null, "other event has no matching history");
        }
        WfTask changed = taskFactory.get();
        ImTaskCallbacks.Actor stale = actor(changed, "APPROVE");
        jdbc.update("UPDATE sys_im_user_mapping SET version=version+1 WHERE mapping_id=?", stale.bindingId());
        check("REJECTED".equals(service.execute(stale.request()).status()), "binding mutation after first verification prevents commit");
        check(history(stale) == null && "TODO".equals(jdbc.queryForObject("SELECT status FROM wf_task WHERE task_id=?", String.class, changed.getTaskId())), "rejected identity creates no business change");
        WfTask complex = taskFactory.get();
        ImTaskCallbacks.Actor detailed = actor(complex, "APPROVE");
        jdbc.update("UPDATE wf_task SET task_type='ADD_SIGN' WHERE task_id=?", complex.getTaskId());
        check("IM_TASK_DETAILS_REQUIRED".equals(service.execute(detailed.request()).code()), "complex task requires system details");
        check(history(detailed) == null, "detail-only task cannot be approved by button");
        WfTask rejected = taskFactory.get();
        ImTaskCallbacks.Actor revoked = actor(rejected, "APPROVE");
        denied.set(true);
        try { check("REJECTED".equals(service.execute(revoked.request()).status()), "verifier refusal rejects task action"); }
        finally { denied.set(false); }
        ImTaskCallbacks.Actor raced = actor(taskFactory.get(), "APPROVE");
        ExecutorService concurrent = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start = new CountDownLatch(1);
            Future<ImTaskCallbacks.Outcome> first = concurrent.submit(() -> { start.await(); return service.execute(raced.request()); });
            Future<ImTaskCallbacks.Outcome> second = concurrent.submit(() -> { start.await(); return service.execute(raced.request()); });
            start.countDown();
            check("COMPLETED".equals(first.get(20, TimeUnit.SECONDS).status()) && "COMPLETED".equals(second.get(20, TimeUnit.SECONDS).status()), "concurrent duplicate requests agree on same committed history");
        } finally { concurrent.shutdownNow(); if (!concurrent.awaitTermination(5, TimeUnit.SECONDS)) throw new AssertionError("Callback workers did not stop"); }
        check(jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE task_id=?", Integer.class, raced.taskId()) == 1, "concurrent duplicate has one action");
        ImTaskCallbacks.Actor locked = actor(taskFactory.get(), "APPROVE");
        locks(locked);
        System.out.println("G4_IM_CALLBACK_EXECUTION_DATABASE: assertions=" + assertions + "; failed=0; actual_workflow_service=true; actual_task_business=true; actual_button_policy=true; real_mysql_locks=true; verifier=controlled; redis_task_lock=false; vendor_service=false");
    }

    private void locks(ImTaskCallbacks.Actor actor) throws Exception {
        TenantContext.setTenantId(TENANT);
        boolean noTransaction = false;
        try { guard.require(actor); } catch (ServiceException failure) { noTransaction = Integer.valueOf(409).equals(failure.getCode()); }
        check(noTransaction, "identity locks require actual task transaction");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch acquired = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            Future<?> held = pool.submit(() -> {
                TenantContext.setTenantId(TENANT);
                try { transactions.executeWithoutResult(status -> {
                    guard.require(actor); acquired.countDown();
                    try { if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("release timeout"); }
                    catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
                }); } finally { TenantContext.clear(); }
            });
            check(acquired.await(5, TimeUnit.SECONDS), "all identity records locked before business operation");
            CountDownLatch writing = new CountDownLatch(1);
            Future<Integer> mutation = pool.submit(() -> { writing.countDown(); return jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", CONFIG); });
            try {
                check(writing.await(2, TimeUnit.SECONDS), "concurrent administrator mutation started");
                boolean blocked = false;
                try { mutation.get(200, TimeUnit.MILLISECONDS); } catch (java.util.concurrent.TimeoutException expected) { blocked = true; }
                check(blocked, "administrator cannot alter locked configuration before task transaction completes");
            } finally { release.countDown(); }
            held.get(5, TimeUnit.SECONDS);
            check(mutation.get(5, TimeUnit.SECONDS) == 1, "administrator mutation completes after task transaction");
        } finally { pool.shutdownNow(); pool.awaitTermination(5, TimeUnit.SECONDS); TenantContext.clear(); }
    }

    private ImTaskCallbacks.Actor actor(WfTask task, String action) {
        long callback = ++identities;
        Long existing = jdbc.queryForObject("SELECT MIN(mapping_id) FROM sys_im_user_mapping WHERE tenant_id=? AND user_id=?", Long.class, TENANT, task.getAssignee());
        long binding = existing == null ? ++identities : existing;
        long mapping = ++identities;
        String member = "workflow-member-" + task.getAssignee();
        if (existing == null) jdbc.update("INSERT INTO sys_im_user_mapping(mapping_id,tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES (?,?,?,?,'WECOM',?,'SCAN_BIND',NOW(),'ACTIVE',0)", binding, TENANT, CONFIG, task.getAssignee(), member);
        Long priorTodo = jdbc.queryForObject("SELECT MIN(mapping_id) FROM sys_im_todo_mapping WHERE tenant_id=? AND task_id=?", Long.class, TENANT, task.getTaskId());
        if (priorTodo == null) jdbc.update("INSERT INTO sys_im_todo_mapping(mapping_id,tenant_id,config_id,task_id,assignment_version,receiver_user_id,im_type,im_user_id,card_key_hash,status,version) VALUES (?,?,?,?,?,?,'WECOM',?,?,'SENT',0)", mapping, TENANT, CONFIG, task.getTaskId(), task.getVersion(), task.getAssignee(), member, String.format("%064d", mapping));
        else mapping = priorTodo;
        LocalDateTime lease = LocalDateTime.now().plusSeconds(50).truncatedTo(ChronoUnit.SECONDS);
        jdbc.update("INSERT INTO sys_im_callback_event(callback_id,tenant_id,config_id,event_key,payload_hash,event_type,im_user_id,task_mapping_id,action_type,status,claim_until,source_ip,occurred_time) VALUES (?,?,?,?,?,'template_card_event',?,?,?,'PROCESSING',?,'127.0.0.1',NOW())", callback, TENANT, CONFIG, String.format("%064d", callback), "a".repeat(64), member, mapping, action, lease);
        ImTaskCallbacks.Actor actor = new ImTaskCallbacks.Actor(TENANT, callback, CONFIG, 0, lease, mapping, 0, task.getTaskId(), task.getVersion(), binding, 0,
                task.getAssignee(), 0, action, 0, Set.of(approvalMenu));
        if (existing == null) jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,?,?)", task.getAssignee(), ROLE, TENANT);
        actors.put(callback, actor);
        return actor;
    }

    private void feignHeaders() {
        UserContext.setTenantId(TENANT); UserContext.setUserId(1L); UserContext.setAuthToken("untrusted-browser-context");
        try {
            feign.RequestTemplate request = new feign.RequestTemplate();
            request.uri("/inner/auth/im-callback/verify"); request.header("Authorization", "forged");
            request.header("Cookie", "forged"); request.header("X-User-Id", "1");
            new com.cloudflow.workflow.config.FeignRequestInterceptor("cloudflow-service-workflow").apply(request);
            check(!request.headers().containsKey("Authorization") && !request.headers().containsKey("Cookie")
                    && !request.headers().containsKey("X-User-Id"), "workflow verification request strips browser credentials");
        } finally { UserContext.clear(); }
    }

    private String history(ImTaskCallbacks.Actor actor) {
        TenantContext.setTenantId(TENANT);
        try { return mapper.history(actor.request()); } finally { TenantContext.clear(); }
    }

    private void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
}
