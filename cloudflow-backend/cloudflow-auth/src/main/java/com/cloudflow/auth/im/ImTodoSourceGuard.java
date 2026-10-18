package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.auth.message.MessageDeliveryPayload;
import com.cloudflow.auth.message.MessageDeliverySourceGuard;
import com.cloudflow.common.security.im.ImTaskTodos;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoSourceGuard implements MessageDeliverySourceGuard {
    private final ImDatabase database;
    private final ImTodoMapper todos;
    private final ImTodoAccounts accounts;

    @Override public boolean supports(String sourceModule, String businessType) {
        return "cloudflow-auth".equals(sourceModule) && "IM_TASK_TODO".equals(businessType);
    }

    @Override public boolean verifyAtSendBoundary() { return true; }

    @Override public String rejectionCode(MessageDeliveryPayload payload) {
        ImTodoRow todo = database.read(payload.tenantId(), ignored -> todos.byRecord(payload.tenantId(), payload.context().getRecordId()));
        if (todo == null || !"WECOM".equals(todo.getImType()) || !Objects.equals(todo.getTaskId(), payload.request().getBizId())
                || !Objects.equals(todo.getReceiverUserId(), payload.context().getReceiver().getReceiverId())
                || !Objects.toString(todo.getMappingId()).equals(Objects.toString(payload.request().safeParams().get("imTodoMappingId"), ""))) {
            return "IM_TODO_SOURCE_INVALID";
        }
        try { accounts.verify(new ImTaskTodos.Request(payload.tenantId(), todo.getMappingId())); return null; }
        catch (ImFailure failure) { return failure.getReasonCode(); }
    }
}
