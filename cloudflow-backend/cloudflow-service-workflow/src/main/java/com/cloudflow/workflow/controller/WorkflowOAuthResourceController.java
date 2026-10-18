package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthResourceContext;
import com.cloudflow.common.security.oauth2.OAuthResources;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.service.IWfInstanceService;
import com.cloudflow.workflow.service.WorkflowFormAccessService;
import com.cloudflow.workflow.service.remote.OAuthVerificationClient;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/oauth2")
@RequiredArgsConstructor
public class WorkflowOAuthResourceController {
    private final OAuthVerificationClient verifier;
    private final IWfInstanceService instances;
    private final WorkflowFormAccessService forms;

    @PostMapping("/instance")
    @Inner(allowedServices = "cloudflow-auth")
    @SysLog(value = "第三方流程受限读取", logParams = false)
    public R<OAuthResources.Instance> detail(@RequestBody OAuthResources.InstanceRequest request) {
        if (request.instanceId() == null || !request.instanceId().matches("[A-Za-z0-9_-]{1,64}")) throw OAuthFailure.invalid("流程编号不合法");
        R<OAuthIdentity> result = verifier.verify(new OAuthResources.Verification(request.tokenHash()));
        if (result == null || !result.isSuccess() || result.getData() == null || !request.tokenHash().equals(result.getData().tokenHash())) throw OAuthFailure.unauthenticated();
        return OAuthResourceContext.read(result.getData(), "workflow.instance.read", () -> {
            WfProcessInstance instance = instances.getProcessInstance(request.instanceId());
            WorkflowFormAccessService.ReadContext context = forms.instance(instance.getInstanceId(), null);
            Map<String, Object> visible = context.form() == null ? Map.of() : forms.projection(context, context.rawValues()).values();
            return R.ok(new OAuthResources.Instance(instance.getInstanceId(), instance.getProcessNo(), instance.getTitle(), instance.getStatus(),
                    instance.getStartTime(), instance.getEndTime(), context.form() == null ? "UNDECLARED" : "DECLARED", visible));
        });
    }
}

