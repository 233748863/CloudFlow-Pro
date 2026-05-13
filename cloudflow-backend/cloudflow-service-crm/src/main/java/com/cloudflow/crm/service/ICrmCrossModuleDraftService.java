package com.cloudflow.crm.service;

import com.cloudflow.crm.service.remote.RemoteOaService;

/**
 * CRM 调 OA 的跨模块草稿 / 绑定 / 作废操作，统一收口。
 * 抽出原因：原来散落在 CrmCustomerServiceImpl（1080 行），
 * 属于集成层而非客户域，单独成类便于后续扩展事件通知。
 */
public interface ICrmCrossModuleDraftService {

    Long createContractDraft(Long customerId, RemoteOaService.ContractDraftRequest request);

    Long createProjectDraft(Long customerId, RemoteOaService.ProjectDraftRequest request);

    boolean createBudgetDraft(Long customerId, RemoteOaService.BudgetDraftRequest request);

    boolean createInvoiceDraft(Long customerId, RemoteOaService.InvoiceDraftRequest request);

    boolean bindInvoice(Long customerId, Long invoiceId, RemoteOaService.InvoiceBindRequest request);

    boolean voidInvoice(Long customerId, Long invoiceId, String remark);

    boolean confirmReceivable(Long customerId, Long receivableId);
}
