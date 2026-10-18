package com.cloudflow.crm.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthResourceContext;
import com.cloudflow.common.security.oauth2.OAuthResources;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.remote.OAuthVerificationClient;
import java.util.ArrayList;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/oauth2")
@RequiredArgsConstructor
public class CrmOAuthResourceController {
    private final OAuthVerificationClient verifier;
    private final CrmCustomerMapper customers;

    @PostMapping("/customers/query")
    @Inner(allowedServices = "cloudflow-auth")
    @SysLog(value = "第三方客户范围查询", logParams = false)
    public R<PageResult<OAuthResources.Customer>> query(@RequestBody OAuthResources.CustomerQuery request) {
        if (request.pageNum() < 1 || request.pageNum() > 1000000 || request.pageSize() < 1 || request.pageSize() > 100
                || request.name() != null && request.name().length() > 100) throw OAuthFailure.invalid("客户查询参数不合法");
        OAuthIdentity identity = identity(request.tokenHash());
        return OAuthResourceContext.read(identity, "crm.customer.read", () -> {
            CrmCustomer query = new CrmCustomer();
            query.setCustomerName(request.name());
            Page<CrmCustomer> page = customers.selectPageByDataScope(new Page<>(request.pageNum(), request.pageSize()), query, scope(identity));
            return R.ok(new PageResult<>(page.getRecords().stream().map(CrmOAuthResourceController::view).toList(), page.getTotal(), page.getCurrent(), page.getSize()));
        });
    }

    @PostMapping("/customer")
    @Inner(allowedServices = "cloudflow-auth")
    @SysLog(value = "第三方客户只读详情", logParams = false)
    public R<OAuthResources.Customer> detail(@RequestBody OAuthResources.CustomerRequest request) {
        if (request.customerId() == null || request.customerId() <= 0) throw OAuthFailure.invalid("客户编号不合法");
        OAuthIdentity identity = identity(request.tokenHash());
        return OAuthResourceContext.read(identity, "crm.customer.read", () -> {
            CrmCustomer customer = customers.selectByIdWithDataScope(request.customerId(), scope(identity));
            if (customer == null || !identity.tenantId().equals(customer.getTenantId())) throw OAuthFailure.forbidden();
            return R.ok(view(customer));
        });
    }

    private OAuthIdentity identity(String hash) {
        R<OAuthIdentity> result = verifier.verify(new OAuthResources.Verification(hash));
        if (result == null || !result.isSuccess() || result.getData() == null || !hash.equals(result.getData().tokenHash())) throw OAuthFailure.unauthenticated();
        return result.getData();
    }

    private static DataScope scope(OAuthIdentity identity) {
        DataScope scope = DataScopeUtils.listScope("dept_id", "owner_id");
        if (identity.dsType() == 0) scope.setSkip(true);
        else if (identity.dsType() == 4) scope.setUserId(identity.userId());
        else if (!identity.deptIds().isEmpty()) scope.setDeptList(new ArrayList<>(identity.deptIds()));
        else scope.setUserId(-1L);
        return scope;
    }

    private static OAuthResources.Customer view(CrmCustomer customer) {
        return new OAuthResources.Customer(customer.getCustomerId(), customer.getCustomerCode(), customer.getCustomerName(),
                customer.getCustomerType(), customer.getIndustry(), customer.getStatus());
    }
}

