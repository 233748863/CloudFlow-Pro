package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.security.im.ImTaskTodos;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class ImTodoReconciler {
    private final ImDatabase database;
    private final ImTodoMapper mapper;
    private final ImTodoReceipts receipts;
    private final ImTodoAccounts accounts;
    private final ImTodoStatusClient workflow;
    private final ImConfigRules rules;
    private final ImTodoProvider provider;

    public ImTodoReconciler(ImDatabase database, ImTodoMapper mapper, ImTodoReceipts receipts, ImTodoAccounts accounts,
            ImTodoStatusClient workflow, ImConfigRules rules, List<ImTodoProvider> providers) {
        this.database = database; this.mapper = mapper; this.receipts = receipts; this.accounts = accounts;
        this.workflow = workflow; this.rules = rules;
        List<ImTodoProvider> supported = providers.stream().filter(candidate -> "WECOM".equals(candidate.providerType())).toList();
        if (supported.size() != 1) throw new IllegalStateException("IM_TODO_PROVIDER_REQUIRED");
        provider = supported.get(0);
    }

    public boolean reconcile(long tenantId, long deliveryId) {
        try { return attempt(tenantId, deliveryId); }
        catch (ImFailure failure) {
            if (List.of("IM_CALLBACK_ACTOR_UNAVAILABLE", "IM_CALLBACK_STALE").contains(failure.getReasonCode())) return false;
            throw failure;
        }
    }

    private boolean attempt(long tenantId, long deliveryId) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("IM_CARD_TRANSACTION_INVALID");
        rules.requireDeployment();
        ImTodoRow todo = database.read(tenantId, ignored -> mapper.byDelivery(tenantId, deliveryId));
        if (todo == null || !List.of("SENT", "UNKNOWN").contains(todo.getStatus())) return false;
        ImTodoReceipts.Status saved = receipts.status(todo);
        if ("APPLIED".equals(saved.outcome())) return record(todo, saved.state());
        if (!"MISSING".equals(saved.outcome())) return false;
        ImTaskTodos.Request request = new ImTaskTodos.Request(tenantId, todo.getMappingId());
        ImTaskTodos.Actor actor = accounts.verify(request);
        R<ImTaskTodos.Status> response = workflow.status(request);
        if (response != null && (response.getCode() == 403 || response.getCode() == 409)) return false;
        if (response == null || !response.isSuccess() || response.getData() == null) throw ImFailure.callbackUnavailable();
        if (!request.equals(response.getData().request())) throw ImFailure.callbackStale();
        String state = response.getData().state();
        if ("ACTIVE".equals(state)) return false;
        WeComCredentials credentials = database.read(tenantId, scoped -> {
            ImConfigRow config = scoped.config(tenantId, todo.getConfigId());
            if (config == null || !Objects.equals(actor.configVersion(), config.getVersion())) throw ImFailure.callbackStale();
            return rules.credentials(config);
        });
        if (!actor.equals(accounts.verify(request))) throw ImFailure.callbackStale();
        ImTodoReceipts.Lease lease = receipts.claim(todo, state);
        if (lease == null) return false;
        String outcome;
        try {
            if (!actor.equals(accounts.verify(request))) outcome = "FAILED";
            else {
                ChannelSendResult result = provider.terminal(credentials, new ImTodoProvider.Completion(todo.getImUserId(), lease.responseCode(), lease.expiresAt(), lease.state()));
                outcome = result != null && result.isSuccess() ? "APPLIED"
                        : result != null && "IM_CARD_UPDATE_EXPIRED".equals(result.getSkipReason()) ? "EXPIRED" : "UNKNOWN";
            }
        } catch (RuntimeException failure) { outcome = "UNKNOWN"; }
        String persisted = receipts.finish(todo, lease, outcome);
        return "APPLIED".equals(persisted) && record(todo, state);
    }

    private boolean record(ImTodoRow todo, String state) {
        if (!List.of("COMPLETED", "CANCELLED").contains(state)) throw ImFailure.callbackStale();
        return database.write(todo.getTenantId(), ignored -> mapper.state(todo.getTenantId(), todo.getMappingId(), todo.getVersion(), state, null) == 1);
    }
}
