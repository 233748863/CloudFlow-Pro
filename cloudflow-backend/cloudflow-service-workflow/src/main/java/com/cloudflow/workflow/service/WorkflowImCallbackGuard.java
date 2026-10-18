package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import com.cloudflow.workflow.mapper.WorkflowImCallbackMapper;
import com.cloudflow.workflow.service.remote.ImCallbackVerificationClient;
import java.util.HashSet;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
@RequiredArgsConstructor
public class WorkflowImCallbackGuard {
    private final WorkflowImCallbackMapper mapper;
    private final ImCallbackVerificationClient verifier;

    public ImTaskCallbacks.Actor verify(ImTaskCallbacks.Request request) {
        R<ImTaskCallbacks.Actor> result = verifier.verify(request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            int code = result != null && (result.getCode() == 403 || result.getCode() == 409) ? result.getCode() : 503;
            throw new ServiceException("企业通信审批身份核验失败", code);
        }
        ImTaskCallbacks.Actor actor = result.getData();
        if (!actor.request().equals(request)) throw stale();
        return actor;
    }

    public void require(ImTaskCallbacks.Actor actor) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw stale();
        if (!Objects.equals(mapper.lockTenant(actor), actor.tenantId()) || !Objects.equals(mapper.lockConfig(actor), actor.configId())
                || !Objects.equals(mapper.lockBinding(actor), actor.bindingId()) || !Objects.equals(mapper.lockUser(actor), actor.userId())
                || !Objects.equals(mapper.lockEvent(actor), actor.callbackId()) || !Objects.equals(mapper.lockTodo(actor), actor.todoMappingId())) throw stale();
        mapper.lockRoles(actor);
        mapper.lockBlacklist(actor);
        if (!actor.entitlementMenuIds().isEmpty()
                && !new HashSet<>(mapper.lockMenus(actor.entitlementMenuIds())).equals(actor.entitlementMenuIds())) throw stale();
        if (!actor.equals(verify(actor.request()))) throw stale();
    }

    private static ServiceException stale() { return new ServiceException("企业通信审批依据已变化", 409); }
}
