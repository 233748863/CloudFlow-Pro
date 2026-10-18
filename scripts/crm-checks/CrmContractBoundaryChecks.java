package com.cloudflow.crm.service.impl;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.crm.controller.CrmActivityController;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.remote.RemoteOaService;
import java.lang.reflect.Method;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

final class CrmContractBoundaryChecks {
    static void run() throws ReflectiveOperationException {
        Method create = RemoteOaService.class.getMethod("createContract", String.class, String.class, RemoteOaService.ContractDraftRequest.class);
        Method detail = RemoteOaService.class.getMethod("getContract", Long.class);
        Method list = RemoteOaService.class.getMethod("listContracts", int.class, int.class, Long.class, String.class);
        CrmOperationsChecks.equal("/inner/oa/crm-contracts/draft", create.getAnnotation(PostMapping.class).value()[0], "CRM drafts use the service-only OA endpoint");
        CrmOperationsChecks.equal("/inner/oa/crm-contracts/{id}", detail.getAnnotation(GetMapping.class).value()[0], "CRM contract references use scoped summaries");
        CrmOperationsChecks.equal("/inner/oa/crm-contracts/list", list.getAnnotation(GetMapping.class).value()[0], "CRM workspaces use customer-filtered summaries");
        options();
    }

    private static void options() throws ReflectiveOperationException {
        Method endpoint = CrmActivityController.class.getMethod("contractChoices", Long.class, PageQuery.class);
        CrmOperationsChecks.equal(List.of("crm:activity:list"), List.of(endpoint.getAnnotation(SaCheckPermission.class).value()), "contract choices require activity permission");
        CrmOperationsChecks.equal(List.of("contractId", "contractNo", "contractName", "customerId"),
                Arrays.stream(CrmReferenceService.ContractChoice.class.getRecordComponents()).map(component -> component.getName()).toList(), "contract choices expose only reference fields");
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(77L);
        RemoteOaService.ContractInfo contract = new RemoteOaService.ContractInfo();
        contract.setContractId(88L);
        contract.setCustomerId(77L);
        contract.setContractNo("CHECK-88");
        contract.setContractName("测试合同");
        AtomicBoolean permitted = new AtomicBoolean(true);
        AtomicInteger remoteCalls = new AtomicInteger();
        AtomicReference<R<PageResult<RemoteOaService.ContractInfo>>> answer = new AtomicReference<R<PageResult<RemoteOaService.ContractInfo>>>(R.ok(new PageResult<>(List.of(contract), 1L, 1, 100)));
        CrmCustomerMapper customers = CrmOperationsChecks.proxy(CrmCustomerMapper.class, (method, arguments) -> {
            if (!"selectByIdWithDataScope".equals(method)) throw new AssertionError("Unexpected customer lookup: " + method);
            CrmOperationsChecks.equal(77L, arguments[0], "contract choices check the requested customer");
            return permitted.get() ? customer : null;
        });
        RemoteOaService remote = CrmOperationsChecks.proxy(RemoteOaService.class, (method, arguments) -> {
            if (!"listContracts".equals(method)) throw new AssertionError("Unexpected remote method: " + method);
            remoteCalls.incrementAndGet();
            CrmOperationsChecks.equal(1, arguments[0], "contract choice page number is normalized");
            CrmOperationsChecks.equal(100, arguments[1], "contract choice page size is capped at 100");
            CrmOperationsChecks.equal(77L, arguments[2], "contract choice remote lookup is customer-bound");
            return answer.get();
        });
        CrmReferenceService references = new CrmReferenceService(customers, null, null, null, null, null, remote, null);
        PageQuery page = new PageQuery();
        page.setPageNum(0);
        page.setPageSize(1000);
        PageResult<CrmReferenceService.ContractChoice> result = references.contractChoices(77L, page);
        CrmOperationsChecks.equal(88L, result.getRows().get(0).contractId(), "authorized customer contract is selectable");
        CrmOperationsChecks.equal(1L, result.getTotal(), "contract choices preserve remote pagination total");
        permitted.set(false);
        int before = remoteCalls.get();
        CrmOperationsChecks.fails(CrmBusinessException.class, () -> references.contractChoices(77L, page), "inaccessible customers cannot query contract options");
        CrmOperationsChecks.equal(before, remoteCalls.get(), "customer denial occurs before cross-service lookup");
        permitted.set(true);
        contract.setCustomerId(99L);
        unavailable(() -> references.contractChoices(77L, page), "cross-customer remote rows fail closed");
        contract.setCustomerId(77L);
        answer.set(R.fail("private-remote-failure"));
        unavailable(() -> references.contractChoices(77L, page), "remote failure is explicit rather than empty success");
    }

    private static void unavailable(Runnable action, String label) {
        try {
            action.run();
            throw new AssertionError(label);
        } catch (ServiceException exception) {
            CrmOperationsChecks.equal(503, exception.getCode(), label);
            CrmOperationsChecks.check(!exception.getMessage().contains("private-remote-failure"), "remote internals stay hidden");
        }
    }
}
