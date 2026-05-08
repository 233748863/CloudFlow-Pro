package com.cloudflow.crm.domain.vo;

import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class CrmDashboardSummaryVO {
    private List<CrmOpportunityBoardColumnVO> funnel = new ArrayList<>();
    private List<CrmQuote> pendingQuotes = new ArrayList<>();
    private List<CrmReceivableAgingBucketVO> agingBuckets = new ArrayList<>();
    private List<CrmRenewal> renewalWindows = new ArrayList<>();
    private List<CrmServiceTicket> highSeverityTickets = new ArrayList<>();
    private List<CrmCustomer> staleFollowCustomers = new ArrayList<>();
    private List<CrmOpportunity> stalledOpportunities = new ArrayList<>();
    private List<CrmWorkspaceTodoItemVO> crossModuleTodos = new ArrayList<>();
    private List<CrmWorkspaceRiskItemVO> crossModuleRisks = new ArrayList<>();
    private List<RemoteBudgetLinkVO> budgetAlerts = new ArrayList<>();
    private List<RemoteInvoiceLinkVO> invoiceExceptions = new ArrayList<>();
}
