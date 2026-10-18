package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImCallbackProcessor {
    private final ImCallbackInbox inbox;
    private final ImCallbackWorkflowClient workflow;
    private final ImConfigRules rules;

    public boolean process(long tenantId, long callbackId) {
        rules.requireDeployment();
        ImCallbackRow claim = inbox.claim(tenantId, callbackId);
        if (claim == null) return false;
        ImTaskCallbacks.Outcome outcome;
        try {
            R<ImTaskCallbacks.Outcome> result = workflow.complete(new ImTaskCallbacks.Request(tenantId, callbackId, claim.getClaimUntil()));
            outcome = result != null && result.isSuccess() && result.getData() != null ? result.getData()
                    : new ImTaskCallbacks.Outcome("RETRYABLE", "IM_WORKFLOW_UNAVAILABLE");
        } catch (RuntimeException failure) {
            outcome = new ImTaskCallbacks.Outcome("RETRYABLE", "IM_WORKFLOW_UNCERTAIN");
        }
        return inbox.finish(claim, outcome.status(), outcome.code());
    }
}
