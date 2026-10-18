package com.cloudflow.crm.service.impl;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.controller.CrmTargetListController;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.remote.CrmBusinessRuleClient;
import com.cloudflow.crm.service.remote.CrmContractOriginClient;
import com.cloudflow.crm.service.remote.RemoteOaService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicLong;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmCommercialDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private CrmCommercialDatabaseChecks(CrmOperationsDatabaseChecks fixture) { this.fixture = fixture; }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        CrmCommercialDatabaseChecks checks = new CrmCommercialDatabaseChecks(fixture);
        checks.credit(); checks.loss(); checks.revenue();
        equal(List.of("crm:target-list:export"), List.of(CrmTargetListController.class.getMethod("export", Long.class).getAnnotation(SaCheckPermission.class).value()), "unmasked audience export has dedicated permission");
    }

    private void credit() throws Exception {
        CrmCustomer customer = fixture.customer("credit"); Long customerId = customer.getCustomerId();
        CrmCreditService service = fixture.bean(CrmCreditService.class);
        CrmCustomerCredit unsupported = proposal(null, "100"); unsupported.setCurrency("USD");
        fails(IllegalArgumentException.class, () -> service.submit(customerId, unsupported), "credit proposal only supports the receivable currency CNY");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_customer_credit WHERE customer_id=?", customerId), "unsupported currency rolls back initial credit record");
        Long approvalId = service.submit(customerId, proposal(null, "100"));
        CrmCustomerCredit current = current(customerId);
        decimal("0", current.getCreditLimit(), "credit application does not change effective amount"); equal("DISABLED", current.getStatus(), "first credit stays disabled pending approval");
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(approvalId);
        check(approval.getInstanceId() != null, "after-commit workflow instance persisted by independent transaction");
        equal(approval.getInstanceId(), current.getInstanceId(), "credit references correct approval instance");
        fails(IllegalArgumentException.class, () -> service.submit(customerId, proposal(current.getVersion(), "500")), "duplicate pending credit application rejected");
        ApprovalResultDTO stale = callback(approval); stale.setProcessInstanceId("older-instance");
        fixture.bean(CrmCreditApprovalHandler.class).handleApproved(stale);
        decimal("0", current(customerId).getCreditLimit(), "stale approval callback leaves credit unchanged");
        CrmCustomerCredit bypass = new CrmCustomerCredit(); bypass.setVersion(current.getVersion()); bypass.setBypassFlag(1);
        bypass.setBypassReason("测试临时额度放行"); bypass.setBypassExpireDate(LocalDate.now().plusDays(1)); service.bypass(customerId, bypass);
        fixture.bean(CrmCreditApprovalHandler.class).handleApproved(callback(approval));
        decimal("100", current(customerId).getCreditLimit(), "approved credit becomes effective"); equal(1, current(customerId).getBypassFlag(), "approval preserves independent bypass change");
        fails(IllegalArgumentException.class, () -> service.check(customerId, BigDecimal.ONE, "USD", "CRM_QUOTE", 900020L), "foreign currency cannot consume CNY credit even with bypass");
        int approvedVersion = current(customerId).getVersion(); fixture.bean(CrmCreditApprovalHandler.class).handleApproved(callback(approval));
        equal(approvedVersion, current(customerId).getVersion(), "duplicate approval does not change version or amount");
        AtomicLong pendingId = new AtomicLong(); int version = current(customerId).getVersion();
        Callable<Integer> submit = () -> {
            try { pendingId.set(service.submit(customerId, proposal(version, "250"))); return 1; }
            catch (IllegalArgumentException rejected) { return 0; }
        };
        int[] submitted = fixture.parallel(submit, submit); equal(1, submitted[0] + submitted[1], "concurrent credit applications serialize to one pending request");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_approval WHERE business_ref_id=? AND business_type=? AND status='PENDING'", customerId, CrmBusinessTypes.CRM_CUSTOMER_CREDIT), "one pending credit approval stored");
        CrmApproval pending = fixture.mapper(CrmApprovalMapper.class).selectById(pendingId.get());
        fixture.bean(CrmCreditApprovalHandler.class).handleApproved(callback(approval));
        equal(pending.getInstanceId(), current(customerId).getInstanceId(), "old completed callback cannot overwrite newer workflow link");
        fixture.bean(CrmCreditApprovalHandler.class).handleRejected(callback(pending)); decimal("100", current(customerId).getCreditLimit(), "rejected request preserves old limit");
        fixture.receivable(customer, null, "200", "50", LocalDate.now().minusDays(1));
        fixture.receivable(customer, null, "50", "20", LocalDate.now().plusDays(1));
        CrmReceivable cancelled = fixture.receivable(customer, null, "1000", "0", LocalDate.now().minusDays(1));
        cancelled.setStatus("CANCELLED"); fixture.mapper(CrmReceivableMapper.class).updateById(cancelled);
        Map<String, Object> view = service.view(customerId);
        decimal("180", (BigDecimal) view.get("occupied"), "live exposure excludes cancelled receivables");
        decimal("150", (BigDecimal) view.get("overdue"), "only overdue unpaid balance counted"); decimal("-80", (BigDecimal) view.get("available"), "available credit reflects live exposure");
        fixture.jdbc.update("UPDATE crm_customer_credit SET bypass_expire_date=? WHERE customer_id=?", LocalDate.now().minusDays(1), customerId);
        CrmOpportunity opportunity = fixture.opportunity(customer, null, "NEGOTIATION"); CrmQuote quote = fixture.quote(customer, opportunity.getOpportunityId(), null);
        int contractsBefore = fixture.contractCalls.get();
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmQuoteServiceImpl.class).submitQuote(quote.getQuoteId()), "overdue blocks quote submission");
        equal("DRAFT", fixture.mapper(CrmQuoteMapper.class).selectById(quote.getQuoteId()).getStatus(), "blocked quote stays draft");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmQuoteServiceImpl.class).createContractDraft(quote.getQuoteId()), "overdue blocks quote-to-contract");
        RemoteOaService.ContractDraftRequest contract = new RemoteOaService.ContractDraftRequest(); contract.setAmount(BigDecimal.TEN); contract.setCurrency("CNY");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmCrossModuleDraftServiceImpl.class).createContractDraft(customerId, contract), "overdue blocks customer-workspace contract");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmOpportunityServiceImpl.class).winOpportunity(opportunity.getOpportunityId(), null, opportunity.getVersion()), "overdue blocks win-generated contract");
        equal(contractsBefore, fixture.contractCalls.get(), "blocked paths never invoke OA contract creation");
        check(fixture.scalar("SELECT COUNT(*) FROM sys_audit_log WHERE biz_module='crm' AND audit_name='crm.credit.overdue:BLOCK'") >= 4, "blocking attempts survive business transaction rollback in audit log");
        CrmBusinessRuleClient.Rule warn = new CrmBusinessRuleClient.Rule(); warn.setEffect("WARN"); warn.setEnabled(1); warn.setThresholdValue(BigDecimal.ZERO);
        fixture.rules.put("crm.credit.overdue", warn);
        check(fixture.bean(CrmCrossModuleDraftServiceImpl.class).createContractDraft(customerId, contract) != null, "rule center WARN permits contract without deployment");
        fixture.rules.remove("crm.credit.overdue");
        bypass.setVersion(current(customerId).getVersion()); bypass.setBypassExpireDate(LocalDate.now().plusDays(1)); service.bypass(customerId, bypass);
        service.check(customerId, BigDecimal.TEN, "CNY", "CRM_CREDIT_CHECK", customerId);
        equal("BYPASSED", fixture.hits.get(fixture.hits.size() - 1).getHitResult(), "bypass still records rule hits");
        bypass.setVersion(current(customerId).getVersion()); bypass.setBypassFlag(0); bypass.setBypassReason("测试撤销放行"); service.bypass(customerId, bypass);
        fails(IllegalArgumentException.class, () -> service.check(customerId, BigDecimal.TEN, "CNY", "CRM_CREDIT_CHECK", customerId), "revoking bypass restores validation");
        identity(100001L, 1L, 0); fails(IllegalArgumentException.class, () -> service.view(customerId), "credit view cannot cross tenant"); identity();
    }

    private void loss() {
        CrmCustomer customer = fixture.customer("loss"); CrmOpportunity opportunity = fixture.opportunity(customer, null, "NEGOTIATION");
        CrmOpportunityLossDTO.Reason primary = new CrmOpportunityLossDTO.Reason(); primary.setReasonId(1550L); primary.setIsPrimary(true); primary.setAmountLost(new BigDecimal("100"));
        Long approvalId = fixture.bean(CrmApprovalServiceImpl.class).submitOpportunityDowngrade(opportunity.getOpportunityId(), "CLOSE", "LOST", "客户预算调整", List.of(primary), opportunity.getVersion());
        equal("NEGOTIATION", fixture.mapper(CrmOpportunityMapper.class).selectById(opportunity.getOpportunityId()).getStage(), "loss stays pending until approval");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_lost_detail WHERE opportunity_id=?", opportunity.getOpportunityId()), "loss detail not applied before approval");
        CrmApproval approval = fixture.mapper(CrmApprovalMapper.class).selectById(approvalId);
        fixture.bean(CrmOpportunityDowngradeApprovalHandler.class).handleApproved(callback(approval));
        CrmOpportunity lost = fixture.mapper(CrmOpportunityMapper.class).selectById(opportunity.getOpportunityId());
        equal("LOST", lost.getStage(), "loss approval closes opportunity"); equal("客户预算调整", lost.getLostReason(), "loss comment retained");
        fixture.bean(CrmOpportunityDowngradeApprovalHandler.class).handleApproved(callback(approval));
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_opportunity_lost_detail WHERE opportunity_id=? AND is_primary_flag=1", opportunity.getOpportunityId()), "loss callback idempotent with one primary cause");
        check(!fixture.bean(CrmLostAnalysisService.class).report(null, null).reasons().isEmpty(), "lost dashboard reports approved reasons");
    }

    private void revenue() {
        CrmCustomer customer = fixture.customer("revenue"); CrmCampaign campaign = fixture.campaign("revenue");
        campaignLead(campaign, customer.getCustomerId(), campaign.getStartDate().atStartOfDay());
        campaignLead(campaign, null, campaign.getEndDate().plusDays(30).atTime(23, 59, 59));
        campaignLead(campaign, null, campaign.getEndDate().plusDays(31).atStartOfDay());
        CrmOpportunity won = fixture.opportunity(customer, campaign.getCampaignId(), "WON");
        CrmQuote first = fixture.quote(customer, won.getOpportunityId(), 800100L); fixture.quote(customer, won.getOpportunityId(), 800100L);
        fixture.origins.put(800100L, new CrmContractOriginClient.Origin(800100L, customer.getCustomerId(), "CRM_QUOTE", first.getQuoteId(), "CNY", "ACTIVE"));
        CrmReceivable firstReceipt = fixture.receivable(customer, 800100L, "200", "50", LocalDate.now());
        fixture.receivable(customer, 800100L, "100", "25", LocalDate.now());
        fixture.origins.put(800101L, new CrmContractOriginClient.Origin(800101L, customer.getCustomerId(), "CRM_CUSTOMER", customer.getCustomerId(), "CNY", "ACTIVE"));
        fixture.receivable(customer, 800101L, "1000", "999", LocalDate.now());
        CrmCampaignRevenueService revenue = fixture.bean(CrmCampaignRevenueService.class); CrmCampaign calculated = revenue.recalculate(campaign.getCampaignId());
        equal(2, calculated.getLeadCreatedCount(), "attribution window includes last day but excludes following midnight");
        equal(1, calculated.getOpportunityCreatedCount(), "only campaign-linked converted customer opportunities count");
        equal(1, calculated.getWonOpportunityCount(), "won opportunity counted once");
        decimal("75", calculated.getRevenue(), "multiple quotes for same contract cannot multiply receivable revenue");
        decimal("-0.2500", calculated.getRoi(), "net ROI persisted");
        decimal("75", revenue.recalculate(campaign.getCampaignId()).getRevenue(), "attribution rerun is idempotent");
        firstReceipt.setReceivedAmount(new BigDecimal("95")); fixture.mapper(CrmReceivableMapper.class).updateById(firstReceipt);
        decimal("120", revenue.recalculate(campaign.getCampaignId()).getRevenue(), "rerun replaces result with current receipts");
        fixture.failOrigins = true;
        fails(IllegalStateException.class, () -> revenue.recalculate(campaign.getCampaignId()), "contract lookup failure prevents partial attribution"); fixture.failOrigins = false;
        decimal("120", fixture.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId()).getRevenue(), "lookup failure preserves last complete aggregate");
        fixture.origins.put(800100L, new CrmContractOriginClient.Origin(800100L, customer.getCustomerId(), "CRM_QUOTE", first.getQuoteId(), "USD", "ACTIVE"));
        fails(IllegalArgumentException.class, () -> revenue.recalculate(campaign.getCampaignId()), "mixed currency attribution rejected explicitly");
        fixture.origins.put(800100L, new CrmContractOriginClient.Origin(800100L, customer.getCustomerId(), "CRM_QUOTE", first.getQuoteId(), "CNY", "ACTIVE"));
        fixture.jdbc.update("UPDATE crm_campaign SET actual_cost=0 WHERE campaign_id=?", campaign.getCampaignId());
        equal(null, revenue.recalculate(campaign.getCampaignId()).getRoi(), "zero cost resets previously calculated ROI to null");
    }

    private void campaignLead(CrmCampaign campaign, Long customerId, LocalDateTime created) {
        CrmLead lead = new CrmLead(); lead.setLeadName("CRM revenue lead"); lead.setLeadNo("CHECK-" + UUID.randomUUID()); lead.setStatus("CONVERTED");
        lead.setCampaignId(campaign.getCampaignId()); lead.setConvertedCustomerId(customerId); lead.setOwnerId(1L); lead.setDeptId(100L);
        CrmRecordSupport.create(lead, "leadId"); lead.setCreateTime(created); fixture.mapper(CrmLeadMapper.class).insert(lead);
    }

    private CrmCustomerCredit proposal(Integer version, String amount) {
        CrmCustomerCredit proposal = new CrmCustomerCredit(); proposal.setVersion(version); proposal.setCreditLimit(new BigDecimal(amount));
        proposal.setOverdueThreshold(BigDecimal.ZERO); proposal.setCurrency("CNY"); proposal.setStatus("ENABLED"); proposal.setRemark("客户经营信用额度验收"); return proposal;
    }

    private CrmCustomerCredit current(Long customerId) { return (CrmCustomerCredit) fixture.bean(CrmCreditService.class).view(customerId).get("credit"); }

    private ApprovalResultDTO callback(CrmApproval approval) {
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setBusinessId(approval.getApprovalId()); result.setTenantId(100000L);
        result.setBusinessType(approval.getBusinessType()); result.setProcessInstanceId(approval.getInstanceId()); result.setApprovalResult("APPROVED"); return result;
    }
}
