package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageDeliveryMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class ImTodoDeliveryDatabaseChecks {
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final SqlSessionTemplate sessions;
    private final ImConfigRules rules;
    private final ImTodoAccounts accounts;
    private final WeComCredentials credentials;
    private final long receiver;
    private final AtomicInteger sends = new AtomicInteger();
    private final AtomicInteger updates = new AtomicInteger();
    private final AtomicReference<ChannelSendResult> updateOutcome = new AtomicReference<>(ChannelSendResult.success());
    private final AtomicReference<ImTodoProvider.Card> card = new AtomicReference<>();
    private final AtomicReference<String> state = new AtomicReference<>("ACTIVE");
    private final AtomicReference<Runnable> projectionHook = new AtomicReference<>(() -> { });
    private final AtomicReference<ChannelSendResult> outcome = new AtomicReference<>(ChannelSendResult.accepted("todo-provider-id"));
    private int assertions;

    ImTodoDeliveryDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions, ImConfigRules rules,
            ImTodoAccounts accounts, WeComCredentials credentials, long receiver) {
        this.jdbc = jdbc; this.database = database; this.sessions = sessions; this.rules = rules;
        this.accounts = accounts; this.credentials = credentials; this.receiver = receiver;
    }

    void run() {
        long tenant = credentials.tenantId();
        ImTodoMapper todos = sessions.getMapper(ImTodoMapper.class);
        ImProperties properties = ImConfigChecks.properties();
        ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
        MessageSecretCipher cipher = new MessageSecretCipher("todo-fixture-delivery-encryption-key-at-least-32-characters");
        ImTodoProvider provider = new ImTodoProvider() {
            @Override public String providerType() { return "WECOM"; }
            @Override public ChannelSendResult send(WeComCredentials actual, Card value) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "card provider runs after transaction commit");
                check(actual.tenantId() == tenant && actual.configId() == credentials.configId(), "provider uses persisted tenant config");
                sends.incrementAndGet(); card.set(value); return outcome.get();
            }
            @Override public ChannelSendResult terminal(WeComCredentials actual, Completion value) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "terminal update outside transaction");
                check(actual.tenantId() == tenant && value.responseCode() != null, "terminal update uses owned private receipt");
                updates.incrementAndGet(); return updateOutcome.get();
            }
        };
        ImTodoWorkflowClient workflow = request -> {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "projection is outside write transaction");
            projectionHook.get().run();
            return R.ok("ACTIVE".equals(state.get()) ? new ImTaskTodos.Projection(request, "ACTIVE", "todo-instance", "当前审批", "发起人", false,
                    List.of(new ImTaskTodos.Field("允许摘要", "permitted-value"))) : ImTaskTodos.Projection.terminal(request, state.get()));
        };
        ImTodoSender sender = new ImTodoSender(database, todos, rules, accounts, workflow, List.of(provider));
        ImMessageSender notice = new ImMessageSender() {
            @Override public String providerType() { return "WECOM"; }
            @Override public ChannelSendResult send(WeComCredentials actual, Notice value) { throw new AssertionError("todo must use card provider"); }
        };
        ImMessageChannelSender channel = new ImMessageChannelSender(database, sessions.getMapper(SysMessageChannelMapper.class), rules,
                properties, new ImConnectionProbe(), List.of(notice), sender);
        MessageDeliveryService deliveries = new MessageDeliveryService(sessions.getMapper(SysMessageDeliveryMapper.class), sessions.getMapper(SysMessageRecordMapper.class),
                sessions.getMapper(SysMessageChannelMapper.class), sessions.getMapper(SysMessageTemplateMapper.class), sessions.getMapper(SysMessageSubscribeMapper.class),
                sessions.getMapper(SysUserMapper.class), new MessageChannelSenderFactory(List.of(channel)), cipher, json,
                new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())), List.of(new ImTodoSourceGuard(database, todos, accounts)),
                new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json), sessions.getMapper(SysAuditLogMapper.class));
        ImTodoRegistration registration = new ImTodoRegistration(database, todos, rules, accounts, deliveries);
        ImTodoReceipts receipts = new ImTodoReceipts(database, deliveries);
        ImTodoReconciler reconciler = new ImTodoReconciler(database, todos, receipts, accounts,
                request -> R.ok(new ImTaskTodos.Status(request, "ACTIVE")), rules, List.of(provider));
        jdbc.update("INSERT INTO sys_message_channel(tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count,retry_interval_sec,deleted,version) VALUES (?,'WECOM','todo-delivery-test','待办验证','ENABLED',1,1,1,1,0,0)", tenant);
        try {
            ImTaskTodos.Candidate first = candidate("im-delivery-first");
            long deliveryId = registration.register(first, receiver);
            check(registration.register(first, receiver) == deliveryId, "repeat registration reuses durable delivery");
            parallel(registration, first, deliveryId);
            SysMessageDelivery saved = database.read(tenant, ignored -> deliveries.getOwned(tenant, deliveryId));
            String plain = cipher.decrypt(saved.getPayloadEncrypted());
            String privateKey = json.readTree(plain).path("request").path("params").path("imTodoCardKey").asText();
            check(privateKey.matches("[A-Za-z0-9_-]{43}") && !saved.getPayloadEncrypted().contains(privateKey), "random card identity stored encrypted");
            ImTodoRow mapping = database.read(tenant, ignored -> todos.byDelivery(tenant, deliveryId));
            check(mapping.getCardKeyHash().equals(ImTodoRegistration.hash(privateKey)), "only hash stored in mapping");
            MessageSendRequest request = MessageSendRequest.builder().params(Map.of("imTodoCardKey", privateKey, "ordinary", "allowed")).build();
            ChannelSendContext context = ChannelSendContext.builder().params(request.getParams()).build();
            check(!json.writeValueAsString(request).contains(privateKey) && !request.toString().contains(privateKey), "request diagnostic serialization protects card key");
            check(!json.writeValueAsString(context).contains(privateKey) && !context.toString().contains(privateKey), "context diagnostic serialization protects card key");
            check(MessagePayloadCodec.internalTree(request, json).path("params").path("imTodoCardKey").asText().equals(privateKey), "private encoding retains card key");
            ChannelSendContext forged = json.treeToValue(json.readTree(plain).path("context"), ChannelSendContext.class);
            forged.setDeliveryId(deliveryId);
            forged.setParams(Map.of("imTodoMappingId", mapping.getMappingId(), "imTodoCardKey", "X".repeat(43)));
            check("FAILED".equals(sender.send(forged).getOutcome()) && sends.get() == 0, "forged card key rejected before projection and send");
            forged.setParams(Map.of("imTodoMappingId", mapping.getMappingId() + 1, "imTodoCardKey", privateKey));
            check("FAILED".equals(sender.send(forged).getOutcome()) && sends.get() == 0, "forged mapping identity rejected");
            AtomicReference<ImTaskTodos.Page> page = new AtomicReference<>(new ImTaskTodos.Page(null, List.of(first)));
            AtomicInteger scans = new AtomicInteger();
            ImTodoRecovery recovery = new ImTodoRecovery(properties, todos, database, cursor -> { scans.incrementAndGet(); return R.ok(page.get()); }, registration, deliveries, reconciler);
            outcome.get().setPrivateReceipt(Map.of("responseCode", "private-todo-response", "expiresAt", Instant.now().plusSeconds(3600).toString()));
            recovery.recoverDue();
            check(sends.get() == 1 && "SENT".equals(mappingStatus(deliveryId)), "background scan sends once and recovers mapping state");
            check(card.get().cardKey().equals(privateKey) && !card.get().directAction() && card.get().fields().size() == 1, "card uses verified current projection and detail-only action");
            recovery.recoverDue();
            new ImTodoRecovery(properties, todos, database, cursor -> R.ok(page.get()), registration, deliveries, reconciler).recoverDue();
            check(sends.get() == 1, "repeat scan and process restart never duplicate sent card");
            long unknown = registration.register(candidate("im-delivery-unknown"), receiver);
            outcome.set(ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN"));
            page.set(new ImTaskTodos.Page(null, List.of(candidate("im-delivery-unknown"))));
            recovery.recoverDue(); recovery.recoverDue();
            check(sends.get() == 2 && "UNKNOWN".equals(mappingStatus(unknown)), "unknown outcome remains isolated without resend");
            state.set("COMPLETED");
            long completed = registration.register(candidate("im-delivery-completed"), receiver);
            page.set(new ImTaskTodos.Page(null, List.of(candidate("im-delivery-completed"))));
            recovery.recoverDue();
            check(sends.get() == 2 && "CANCELLED".equals(mappingStatus(completed)), "completed task suppressed before provider call");
            state.set("ACTIVE");
            long revoked = registration.register(candidate("im-delivery-revoked"), receiver);
            projectionHook.set(() -> jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED' WHERE tenant_id=? AND config_id=? AND user_id=?", tenant, credentials.configId(), receiver));
            page.set(new ImTaskTodos.Page(null, List.of(candidate("im-delivery-revoked"))));
            recovery.recoverDue();
            check(sends.get() == 2 && "CANCELLED".equals(mappingStatus(revoked)), "revocation during projection prevents external send");
            projectionHook.set(() -> { });
            jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE' WHERE tenant_id=? AND config_id=? AND user_id=?", tenant, credentials.configId(), receiver);
            properties.setEnabled(false);
            int before = scans.get(); recovery.recoverDue();
            check(scans.get() == before, "disabled deployment performs no workflow scan");
            properties.setEnabled(true);
            jdbc.update("UPDATE sys_im_config SET todo_enabled=0 WHERE tenant_id=? AND config_id=?", tenant, credentials.configId());
            try {
                recovery.recoverDue();
                check(scans.get() == before, "no enabled tenant configuration prevents workflow scan");
            } finally { jdbc.update("UPDATE sys_im_config SET todo_enabled=1 WHERE tenant_id=? AND config_id=?", tenant, credentials.configId()); }
            TenantContext.setTenantSkip();
            recovery.recoverDue();
            check(TenantContext.getTenantSkip(), "background tenant skip restored");
            TenantContext.clearTenantSkip();
            check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE job_id=1786 AND handler_name='imTodoRecovery' AND interval_ms=10000 AND timeout_seconds=240 AND lock_time_seconds=300 AND concurrent_flag=0", Integer.class) == 1, "bounded central job seeded");
            terminalChecks(deliveries, cipher, json, todos, receipts, provider, registration, recovery, page, deliveryId, unknown);
            System.out.println("G4_IM_TODO_DELIVERY_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_transactions=true; real_registration_and_delivery=true; projection_and_provider=controlled; vendor_service=false");
        } catch (Exception failure) { throw new IllegalStateException("TODO_DELIVERY_CHECK_FAILED", failure); }
        finally { TenantContext.clearTenantSkip(); }
    }

    private ImTaskTodos.Candidate candidate(String taskId) { return new ImTaskTodos.Candidate(credentials.tenantId(), taskId, 0, List.of(receiver)); }

    private void terminalChecks(MessageDeliveryService deliveries, MessageSecretCipher cipher, ObjectMapper json, ImTodoMapper todos,
            ImTodoReceipts receipts, ImTodoProvider provider, ImTodoRegistration registration, ImTodoRecovery recovery,
            AtomicReference<ImTaskTodos.Page> page, long first, long unknown) throws Exception {
        int before = assertions;
        long tenant = credentials.tenantId();
        ImTodoReconciler completed = new ImTodoReconciler(database, todos, receipts, accounts,
                request -> R.ok(new ImTaskTodos.Status(request, "COMPLETED")), rules, List.of(provider));
        check(completed.reconcile(tenant, first) && "COMPLETED".equals(mappingStatus(first)) && updates.get() == 1, "confirmed workflow terminal updates external card and mapping");
        check(!completed.reconcile(tenant, first) && updates.get() == 1, "completed card never consumes receipt twice");
        check(!completed.reconcile(tenant, unknown) && updates.get() == 1, "missing send receipt waits without external update");
        ImTodoRow unknownRow = database.read(tenant, ignored -> todos.byDelivery(tenant, unknown));
        String responseCode = "callback-private-recovered-receipt";
        ImCardCallback callback = new ImCardCallback("wecom-card:" + ImCardCallback.hash("callback-receipt-event"), ImCardCallback.hash("callback-receipt-payload"),
                unknownRow.getImUserId(), unknownRow.getCardKeyHash(), "APPROVE", java.time.LocalDateTime.now(), responseCode, Instant.now().plusSeconds(3600));
        ImCallbackInbox inbox = new ImCallbackInbox(database, sessions.getMapper(com.cloudflow.auth.mapper.ImCallbackMapper.class), rules,
                sessions.getMapper(SysAuditLogMapper.class), receipts);
        boolean rolledBack = false;
        try {
            new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource()))).execute(transaction -> {
                inbox.receive(credentials, callback, "127.0.0.1"); throw new IllegalStateException("RECEIPT_TRANSACTION_FIXTURE");
            });
        } catch (IllegalStateException expected) { rolledBack = "RECEIPT_TRANSACTION_FIXTURE".equals(expected.getMessage()); }
        check(rolledBack && jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_callback_event WHERE tenant_id=? AND event_key=?", Integer.class, tenant, callback.eventKey()) == 0, "inbox and receipt share rollback boundary");
        SysMessageDelivery afterRollback = database.read(tenant, ignored -> deliveries.getOwned(tenant, unknown));
        check(!cipher.decrypt(afterRollback.getPayloadEncrypted()).contains(responseCode), "rolled-back callback cannot leave a usable receipt");
        ImCallbackInbox.Receipt callbackReceipt = inbox.receive(credentials, callback, "127.0.0.1");
        inbox.finish(inbox.claim(tenant, callbackReceipt.callbackId()), "REJECTED", "IM_FIXTURE_RECEIPT_CAPTURED");
        SysMessageDelivery captured = database.read(tenant, ignored -> deliveries.getOwned(tenant, unknown));
        com.cloudflow.auth.message.MessageDeliveryPayload payload = json.readValue(cipher.decrypt(captured.getPayloadEncrypted()), com.cloudflow.auth.message.MessageDeliveryPayload.class);
        check(responseCode.equals(payload.attempts().get(0).privateReceipt().get("responseCode")), "durable verified inbox recovers lost send receipt");
        check(!json.writeValueAsString(payload).contains(responseCode) && !payload.toString().contains(responseCode), "private receipt hidden from ordinary payload serialization");
        updateOutcome.set(ChannelSendResult.unknown("IM_CARD_UPDATE_UNKNOWN"));
        check(!completed.reconcile(tenant, unknown) && updates.get() == 2 && "UNKNOWN".equals(receipts.status(unknownRow).outcome()), "uncertain terminal update persists unknown outcome");
        completed.reconcile(tenant, unknown);
        new ImTodoReconciler(database, todos, receipts, accounts, request -> R.ok(new ImTaskTodos.Status(request, "COMPLETED")), rules, List.of(provider)).reconcile(tenant, unknown);
        check(updates.get() == 2, "restart and retry cannot consume uncertain receipt again");
        ImCardCallback another = new ImCardCallback("wecom-card:" + ImCardCallback.hash("another-receipt-event"), ImCardCallback.hash("another-receipt-payload"),
                unknownRow.getImUserId(), unknownRow.getCardKeyHash(), "REJECT", java.time.LocalDateTime.now(), "another-private-code", Instant.now().plusSeconds(3600));
        ImCallbackInbox.Receipt anotherReceipt = inbox.receive(credentials, another, "127.0.0.1");
        inbox.finish(inbox.claim(tenant, anotherReceipt.callbackId()), "REJECTED", "IM_FIXTURE_RECEIPT_CAPTURED");
        check("UNKNOWN".equals(receipts.status(unknownRow).outcome()), "later callback cannot reset uncertain consumption");
        outcome.set(ChannelSendResult.accepted("crash-card-id"));
        outcome.get().setPrivateReceipt(Map.of("responseCode", "crash-private-receipt", "expiresAt", Instant.now().plusSeconds(3600).toString()));
        ImTaskTodos.Candidate crash = candidate("im-delivery-crash");
        long crashId = registration.register(crash, receiver);
        page.set(new ImTaskTodos.Page(null, List.of(crash))); recovery.recoverDue();
        ImTodoRow crashRow = database.read(tenant, ignored -> todos.byDelivery(tenant, crashId));
        ExecutorService workers = Executors.newFixedThreadPool(4);
        ImTodoReceipts.Lease claimed;
        try {
            Callable<ImTodoReceipts.Lease> action = () -> receipts.claim(crashRow, "CANCELLED");
            List<Future<ImTodoReceipts.Lease>> results = workers.invokeAll(List.of(action, action, action, action));
            java.util.ArrayList<ImTodoReceipts.Lease> leases = new java.util.ArrayList<>();
            for (Future<ImTodoReceipts.Lease> result : results) { ImTodoReceipts.Lease lease = result.get(); if (lease != null) leases.add(lease); }
            check(leases.size() == 1, "four concurrent workers claim one terminal receipt"); claimed = leases.get(0);
        } finally { workers.shutdownNow(); }
        check(!json.writeValueAsString(claimed).contains(claimed.responseCode()) && !claimed.toString().contains(claimed.responseCode()), "claimed receipt cannot leak through JSON or diagnostics");
        database.read(tenant, ignored -> deliveries.updatePrivateReceipt(tenant, crashId, "cloudflow-auth", "IM_TASK_TODO", crash.taskId(), existing -> {
            Map<String, String> changed = new java.util.LinkedHashMap<>(existing); changed.put("terminalClaimUntil", Instant.now().minusSeconds(1).toString()); return changed;
        }));
        check(receipts.claim(crashRow, "CANCELLED") == null && "UNKNOWN".equals(receipts.status(crashRow).outcome()), "crashed expired claimant is isolated without reusing code");
        check("UNKNOWN".equals(receipts.finish(crashRow, claimed, "APPLIED")), "late result cannot replace isolated unknown outcome");
        outcome.set(ChannelSendResult.accepted("expired-card-id"));
        outcome.get().setPrivateReceipt(Map.of("responseCode", "expired-private-receipt", "expiresAt", Instant.now().minusSeconds(1).toString()));
        ImTaskTodos.Candidate expired = candidate("im-delivery-expired");
        long expiredId = registration.register(expired, receiver);
        page.set(new ImTaskTodos.Page(null, List.of(expired))); recovery.recoverDue();
        check(!completed.reconcile(tenant, expiredId) && updates.get() == 2, "expired response code never reaches provider");
        check("EXPIRED".equals(receipts.status(database.read(tenant, ignored -> todos.byDelivery(tenant, expiredId))).outcome()), "expired outcome recorded durably");
        System.out.println("G4_IM_TODO_TERMINAL_DATABASE: assertions=" + (assertions - before) + "; failed=0; real_inbox_and_encrypted_receipts=true; concurrency=4; workflow_status_and_provider=controlled; vendor_service=false");
    }

    static ImTodoReceipts receipts(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions) {
        ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
        MessageDeliveryService worker = new MessageDeliveryService(sessions.getMapper(SysMessageDeliveryMapper.class), sessions.getMapper(SysMessageRecordMapper.class),
                sessions.getMapper(SysMessageChannelMapper.class), sessions.getMapper(SysMessageTemplateMapper.class), sessions.getMapper(SysMessageSubscribeMapper.class),
                sessions.getMapper(SysUserMapper.class), new MessageChannelSenderFactory(List.of()),
                new MessageSecretCipher("todo-fixture-delivery-encryption-key-at-least-32-characters"), json,
                new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())), List.of(),
                new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json), sessions.getMapper(SysAuditLogMapper.class));
        return new ImTodoReceipts(database, worker);
    }
    private String mappingStatus(long deliveryId) { return jdbc.queryForObject("SELECT status FROM sys_im_todo_mapping WHERE tenant_id=? AND delivery_id=?", String.class, credentials.tenantId(), deliveryId); }
    private void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    private void parallel(ImTodoRegistration registration, ImTaskTodos.Candidate candidate, long expected) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(4);
        try {
            Callable<Long> operation = () -> registration.register(candidate, receiver);
            List<Future<Long>> results = workers.invokeAll(List.of(operation, operation, operation, operation));
            for (Future<Long> result : results) check(result.get() == expected, "concurrent registration reuses one durable delivery");
        } finally { workers.shutdownNow(); }
    }
}
