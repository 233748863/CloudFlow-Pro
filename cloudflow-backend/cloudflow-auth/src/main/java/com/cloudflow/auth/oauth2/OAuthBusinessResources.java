package com.cloudflow.auth.oauth2;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.oauth2.OAuthContext;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthResources;
import lombok.RequiredArgsConstructor;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OAuthBusinessResources {
    private final OAuthCrmResourceClient crm;
    private final OAuthWorkflowResourceClient workflow;
    private final OAuthRateLimits limits;

    public PageResult<OAuthResources.Customer> customers(int pageNum, int pageSize, String name) {
        OAuthIdentity identity = require("crm.customer.read");
        OAuthClientRules.page(pageNum, pageSize);
        if (name != null && name.length() > 100) throw OAuthFailure.invalid("客户名称不能超过100字符");
        return read(() -> crm.query(new OAuthResources.CustomerQuery(identity.tokenHash(), pageNum, pageSize, name)));
    }

    public OAuthResources.Customer customer(Long customerId) {
        OAuthIdentity identity = require("crm.customer.read");
        if (customerId == null || customerId <= 0) throw OAuthFailure.invalid("客户编号不合法");
        return read(() -> crm.detail(new OAuthResources.CustomerRequest(identity.tokenHash(), customerId)));
    }

    public OAuthResources.Instance instance(String instanceId) {
        OAuthIdentity identity = require("workflow.instance.read");
        if (instanceId == null || !instanceId.matches("[A-Za-z0-9_-]{1,64}")) throw OAuthFailure.invalid("流程编号不合法");
        return read(() -> workflow.detail(new OAuthResources.InstanceRequest(identity.tokenHash(), instanceId)));
    }

    private OAuthIdentity require(String scope) {
        OAuthContext.requireScope(scope);
        OAuthIdentity identity = OAuthContext.require();
        limits.resource(identity.tokenHash());
        return identity;
    }

    private static <Result> Result read(Supplier<R<Result>> operation) {
        R<Result> response;
        try { response = operation.get(); }
        catch (feign.FeignException failure) {
            if (failure.status() == 401) throw OAuthFailure.unauthenticated();
            if (failure.status() == 403 || failure.status() == 404) throw OAuthFailure.forbidden();
            throw unavailable();
        }
        if (response == null || !response.isSuccess() || response.getData() == null) {
            if (response != null && response.getCode() == 401) throw OAuthFailure.unauthenticated();
            if (response != null && (response.getCode() == 403 || response.getCode() == 404)) throw OAuthFailure.forbidden();
            throw unavailable();
        }
        return response.getData();
    }

    private static OAuthFailure unavailable() { return new OAuthFailure("temporarily_unavailable", "授权业务查询暂不可用", 503); }
}
