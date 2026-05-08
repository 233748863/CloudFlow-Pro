package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmDashboardWorkplaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.service.remote.RemoteOaService;

public interface ICrmCustomerService extends IService<CrmCustomer> {

    PageResult<CrmCustomer> queryPage(CrmCustomer query, PageQuery pageQuery);

    boolean createCustomer(CrmCustomer customer);

    boolean updateCustomer(CrmCustomer customer);

    void refreshHealth(Long customerId);

    CrmCustomerWorkspaceVO getWorkspace(Long customerId);

    CrmDashboardSummaryVO getDashboardSummary();

    CrmDashboardWorkplaceVO getDashboardWorkplace();

    Long createWorkspaceContractDraft(Long customerId, RemoteOaService.ContractDraftRequest request);

    Long createWorkspaceProjectDraft(Long customerId, RemoteOaService.ProjectDraftRequest request);

    boolean createWorkspaceBudgetDraft(Long customerId, RemoteOaService.BudgetDraftRequest request);

    boolean createWorkspaceInvoiceDraft(Long customerId, RemoteOaService.InvoiceDraftRequest request);

    boolean bindWorkspaceInvoice(Long customerId, Long invoiceId, RemoteOaService.InvoiceBindRequest request);

    boolean voidWorkspaceInvoice(Long customerId, Long invoiceId, String remark);

    boolean confirmWorkspaceReceivable(Long customerId, Long receivableId);
}
