package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.security.im.ImTaskTodos;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class ImTodoSender {
    private final ImDatabase database;
    private final ImTodoMapper todos;
    private final ImConfigRules rules;
    private final ImTodoAccounts accounts;
    private final ImTodoWorkflowClient workflow;
    private final ImTodoProvider provider;

    public ImTodoSender(ImDatabase database, ImTodoMapper todos, ImConfigRules rules, ImTodoAccounts accounts,
            ImTodoWorkflowClient workflow, List<ImTodoProvider> providers) {
        this.database = database; this.todos = todos; this.rules = rules; this.accounts = accounts; this.workflow = workflow;
        List<ImTodoProvider> supported = providers.stream().filter(candidate -> "WECOM".equals(candidate.providerType())).toList();
        if (supported.size() != 1) throw new IllegalStateException("IM_TODO_PROVIDER_REQUIRED");
        provider = supported.get(0);
    }

    public ChannelSendResult send(ChannelSendContext context) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("IM_CARD_TRANSACTION_INVALID");
        try {
            ImTodoRow todo = database.read(context.getTenantId(), ignored -> todos.byDelivery(context.getTenantId(), context.getDeliveryId()));
            Map<String, Object> params = context.getParams() == null ? Map.of() : context.getParams();
            if (todo == null || context.getReceiver() == null || !Objects.equals(todo.getReceiverUserId(), context.getReceiver().getReceiverId())
                    || !"USER".equals(context.getReceiver().getReceiverType())
                    || !Objects.toString(todo.getMappingId()).equals(Objects.toString(params.get("imTodoMappingId"), ""))
                    || !(params.get("imTodoCardKey") instanceof String cardKey) || !cardKey.matches("[A-Za-z0-9_-]{43}")
                    || !Objects.equals(todo.getCardKeyHash(), ImTodoRegistration.hash(cardKey))) return ChannelSendResult.failed("IM_TODO_SOURCE_INVALID");
            ImTaskTodos.Request request = new ImTaskTodos.Request(context.getTenantId(), todo.getMappingId());
            ImTaskTodos.Actor actor = accounts.verify(request);
            R<ImTaskTodos.Projection> result = workflow.project(request);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                return result != null && (result.getCode() == 403 || result.getCode() == 409)
                        ? ChannelSendResult.skipped("IM_TODO_UNAVAILABLE") : ChannelSendResult.retryable("IM_TODO_PROJECTION_UNAVAILABLE");
            }
            ImTaskTodos.Projection projection = result.getData();
            if (!request.equals(projection.request())) return ChannelSendResult.failed("IM_TODO_SOURCE_INVALID");
            if (!"ACTIVE".equals(projection.state())) return ChannelSendResult.skipped("IM_TODO_OBSOLETE");
            WeComCredentials credentials = database.read(context.getTenantId(), mapper -> {
                ImConfigRow config = mapper.config(context.getTenantId(), todo.getConfigId());
                if (config == null || !Objects.equals(config.getVersion(), actor.configVersion())) throw ImFailure.callbackStale();
                return rules.credentials(config);
            });
            if (!actor.equals(accounts.verify(request))) return ChannelSendResult.skipped("IM_TODO_UNAVAILABLE");
            ImTodoProvider.Card card = new ImTodoProvider.Card(todo.getImUserId(), cardKey, projection.title(), projection.initiator(),
                    projection.fields().stream().map(field -> new ImTodoProvider.Field(field.label(), field.value())).toList(),
                    "/workflow/task/" + todo.getTaskId(), projection.directAction());
            try {
                ChannelSendResult sent = provider.send(credentials, card);
                return sent == null ? ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN") : sent;
            } catch (RuntimeException failure) { return ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN"); }
        } catch (ImFailure failure) { return ChannelSendResult.skipped(failure.getReasonCode()); }
        catch (RuntimeException failure) { return ChannelSendResult.retryable("IM_TODO_PREFLIGHT_UNAVAILABLE"); }
    }
}
