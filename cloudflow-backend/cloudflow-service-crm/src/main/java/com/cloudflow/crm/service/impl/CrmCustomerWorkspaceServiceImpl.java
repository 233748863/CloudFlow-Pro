package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.domain.vo.CrmDashboardWorkplaceVO;
import com.cloudflow.crm.domain.vo.CrmHealthReasonItemVO;
import com.cloudflow.crm.domain.vo.CrmLinkSummaryVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardCardVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;
import com.cloudflow.crm.domain.vo.CrmWorkspaceActivityItemVO;
import com.cloudflow.crm.domain.vo.CrmWorkspaceRiskItemVO;
import com.cloudflow.crm.domain.vo.CrmWorkspaceTodoItemVO;
import com.cloudflow.crm.domain.vo.RemoteBudgetLinkVO;
import com.cloudflow.crm.domain.vo.RemoteContractLinkVO;
import com.cloudflow.crm.domain.vo.RemoteInvoiceLinkVO;
import com.cloudflow.crm.domain.vo.RemoteProjectLinkVO;
import com.cloudflow.crm.mapper.CrmContactMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmCustomerWorkspaceService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 客户工作台与 Dashboard 聚合。
 * 只做读模型组装，写操作交给 {@link ICrmCustomerService} / {@link com.cloudflow.crm.service.ICrmCrossModuleDraftService}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CrmCustomerWorkspaceServiceImpl implements ICrmCustomerWorkspaceService {

    private final ICrmCustomerService customerService;
    private final CrmCustomerMapper customerMapper;
    private final CrmContactMapper contactMapper;
    private final CrmFollowUpMapper followUpMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmRenewalMapper renewalMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final RemoteOaService remoteOaService;

    @Override
    public CrmCustomerWorkspaceVO getWorkspace(Long customerId) {
        CrmCustomer customer = requireCustomer(customerId);
        customerService.refreshHealth(customerId);
        customer = requireCustomer(customerId);

        CrmCustomerWorkspaceVO workspace = new CrmCustomerWorkspaceVO();
        workspace.setCustomer(customer);
        workspace.setHealthReasons(buildHealthReasons(customerId, customer));
        workspace.setContacts(contactMapper.selectList(new LambdaQueryWrapper<CrmContact>()
                .eq(CrmContact::getCustomerId, customerId)
                .eq(CrmContact::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmContact::getPrimaryFlag)
                .orderByAsc(CrmContact::getContactId)));
        workspace.setFollowUps(followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getCustomerId, customerId)
                .eq(CrmFollowUp::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmFollowUp::getFollowUpTime)));
        workspace.setOpportunities(opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getCustomerId, customerId)
                .eq(CrmOpportunity::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmOpportunity::getUpdateTime)));
        workspace.setQuotes(quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getCustomerId, customerId)
                .eq(CrmQuote::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmQuote::getUpdateTime)));
        workspace.setReceivables(receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getCustomerId, customerId)
                .eq(CrmReceivable::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmReceivable::getDueDate)));
        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getCustomerId, customerId)
                .eq(CrmRenewal::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmRenewal::getCurrentExpireDate));
        renewals.forEach(CrmRenewalRiskEvaluator::enrich);
        workspace.setRenewals(renewals);
        workspace.setTickets(serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmServiceTicket::getUpdateTime)));
        workspace.setContracts(loadContracts(customerId));
        workspace.setInvoices(loadInvoices(customerId));
        workspace.setProjects(loadProjects(customerId));
        workspace.setBudgets(loadBudgets(workspace.getProjects()));
        workspace.setCrossModuleTodos(buildCrossModuleTodos(workspace));
        workspace.setCrossModuleRisks(buildCrossModuleRisks(customer, workspace));
        workspace.setLinkSummary(buildLinkSummary(workspace));
        return workspace;
    }

    @Override
    public CrmDashboardSummaryVO getDashboardSummary() {
        CrmDashboardSummaryVO summary = new CrmDashboardSummaryVO();
        summary.setFunnel(buildOpportunityBoard());
        summary.setPendingQuotes(quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                        .eq(CrmQuote::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .in(CrmQuote::getStatus, List.of(
                                CrmConstants.QuoteStatus.PENDING,
                                CrmConstants.QuoteStatus.APPROVED,
                                CrmConstants.QuoteStatus.SENT))
                        .orderByDesc(CrmQuote::getUpdateTime))
                .stream()
                .limit(8)
                .toList());
        summary.setAgingBuckets(buildAgingBuckets());

        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmRenewal::getCurrentExpireDate));
        renewals.forEach(CrmRenewalRiskEvaluator::enrich);
        LocalDate today = LocalDate.now();
        summary.setRenewalWindows(renewals.stream()
                .filter(item -> item.getCurrentExpireDate() != null)
                .filter(item -> !item.getCurrentExpireDate().isBefore(today))
                .filter(item -> ChronoUnit.DAYS.between(today, item.getCurrentExpireDate()) <= 90)
                .limit(10)
                .toList());
        summary.setHighSeverityTickets(serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                        .eq(CrmServiceTicket::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .in(CrmServiceTicket::getSeverity,
                                CrmConstants.TicketSeverity.HIGH,
                                CrmConstants.TicketSeverity.CRITICAL)
                        .notIn(CrmServiceTicket::getStatus,
                                CrmConstants.TicketStatus.RESOLVED,
                                CrmConstants.TicketStatus.CLOSED)
                        .orderByDesc(CrmServiceTicket::getUpdateTime))
                .stream()
                .limit(10)
                .toList());
        summary.setStaleFollowCustomers(customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                        .eq(CrmCustomer::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .orderByAsc(CrmCustomer::getLastFollowUpTime))
                .stream()
                .filter(item -> item.getLastFollowUpTime() == null
                        || ChronoUnit.DAYS.between(item.getLastFollowUpTime().toLocalDate(), today) >= 7)
                .limit(10)
                .toList());
        summary.setStalledOpportunities(opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                        .eq(CrmOpportunity::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .notIn(CrmOpportunity::getStage,
                                CrmConstants.OpportunityStage.WON,
                                CrmConstants.OpportunityStage.LOST)
                        .orderByAsc(CrmOpportunity::getStageChangedTime))
                .stream()
                .filter(item -> resolveStageStayDays(item) >= 14)
                .limit(10)
                .toList());
        summary.setCrossModuleTodos(buildDashboardTodos());
        summary.setCrossModuleRisks(buildDashboardRisks());
        summary.setBudgetAlerts(loadBudgetAlerts());
        summary.setInvoiceExceptions(loadInvoiceExceptions());
        return summary;
    }

    @Override
    public CrmDashboardWorkplaceVO getDashboardWorkplace() {
        CrmDashboardWorkplaceVO summary = new CrmDashboardWorkplaceVO();
        summary.setTodos(buildDashboardTodos());
        summary.setRisks(buildDashboardRisks());
        summary.setActivities(buildDashboardActivities());
        return summary;
    }

    private CrmCustomer requireCustomer(Long customerId) {
        if (customerId == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        CrmCustomer customer = customerMapper.selectById(customerId);
        if (customer == null || !CrmConstants.DelFlag.NORMAL.equals(customer.getDelFlag())) {
            throw new IllegalArgumentException("客户不存在");
        }
        return customer;
    }

    private List<CrmHealthReasonItemVO> buildHealthReasons(Long customerId, CrmCustomer customer) {
        List<CrmHealthReasonItemVO> reasons = new ArrayList<>();
        LocalDate today = LocalDate.now();
        LocalDate renewalDate = CrmHealthCalculator.resolveRenewalWindowDate(renewalMapper, customerId);
        if (renewalDate != null) {
            long days = ChronoUnit.DAYS.between(today, renewalDate);
            if (days <= 90) {
                reasons.add(buildReason("RENEWAL", "RENEWAL_WINDOW",
                        days <= 30 ? "30天内续约到期" : "90天内续约到期",
                        days <= 30 ? CrmConstants.HealthLevel.RED : CrmConstants.HealthLevel.YELLOW,
                        "/office/crm/customer/" + customerId + "?tab=renewal"));
            }
        }
        int overdueDays = CrmHealthCalculator.resolveMaxOverdueDays(receivableMapper, customerId, today);
        if (overdueDays > 0) {
            reasons.add(buildReason("RECEIVABLE", "RECEIVABLE_OVERDUE",
                    overdueDays > 30 ? "回款逾期超过30天" : "回款逾期未超过30天",
                    overdueDays > 30 ? CrmConstants.HealthLevel.RED : CrmConstants.HealthLevel.YELLOW,
                    "/office/crm/customer/" + customerId + "?tab=cashflow"));
        }
        if (CrmHealthCalculator.hasHighSeverityOpenTicket(serviceTicketMapper, customerId)) {
            reasons.add(buildReason("TICKET", "HIGH_SEVERITY_OPEN", "存在高严重度未关闭工单",
                    CrmConstants.HealthLevel.RED,
                    "/office/crm/customer/" + customerId + "?tab=ticket"));
        }
        if (customer.getLastFollowUpTime() == null
                || ChronoUnit.DAYS.between(customer.getLastFollowUpTime().toLocalDate(), today) >= 30) {
            reasons.add(buildReason("FOLLOW_UP", "STALE_FOLLOW_UP", "30天未跟进",
                    CrmConstants.HealthLevel.YELLOW,
                    "/office/crm/customer/" + customerId + "?tab=follow-up"));
        }
        if (reasons.isEmpty()) {
            reasons.add(buildReason("HEALTH", "NORMAL", "状态正常",
                    CrmConstants.HealthLevel.GREEN,
                    "/office/crm/customer/" + customerId));
        }
        return reasons;
    }

    private CrmHealthReasonItemVO buildReason(String type, String code, String name, String level, String linkTarget) {
        CrmHealthReasonItemVO item = new CrmHealthReasonItemVO();
        item.setType(type);
        item.setCode(code);
        item.setName(name);
        item.setLevel(level);
        item.setLinkTarget(linkTarget);
        return item;
    }

    private List<CrmOpportunityBoardColumnVO> buildOpportunityBoard() {
        List<CrmOpportunity> opportunities = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmOpportunity::getExpectedAmount)
                .orderByDesc(CrmOpportunity::getUpdateTime));
        Map<String, CrmOpportunityBoardColumnVO> columns = new LinkedHashMap<>();
        for (String stage : List.of(
                CrmConstants.OpportunityStage.LEAD,
                CrmConstants.OpportunityStage.QUALIFIED,
                CrmConstants.OpportunityStage.PROPOSAL,
                CrmConstants.OpportunityStage.NEGOTIATION,
                CrmConstants.OpportunityStage.WON,
                CrmConstants.OpportunityStage.LOST)) {
            columns.put(stage, createColumn(stage));
        }
        LocalDate today = LocalDate.now();
        for (CrmOpportunity item : opportunities) {
            CrmOpportunityBoardColumnVO column = columns.computeIfAbsent(item.getStage(), this::createColumn);
            CrmOpportunityBoardCardVO card = new CrmOpportunityBoardCardVO();
            card.setOpportunityId(item.getOpportunityId());
            card.setCustomerId(item.getCustomerId());
            card.setCustomerName(item.getCustomerName());
            card.setOpportunityName(item.getOpportunityName());
            card.setExpectedAmount(item.getExpectedAmount());
            card.setWinRate(item.getWinRate());
            card.setOwnerName(item.getOwnerName());
            card.setExpectedSignDate(item.getExpectedSignDate() == null ? null : String.valueOf(item.getExpectedSignDate()));
            LocalDate pivotDate = item.getStageChangedTime() != null ? item.getStageChangedTime().toLocalDate()
                    : item.getUpdateTime() != null ? item.getUpdateTime().toLocalDate()
                    : item.getCreateTime() != null ? item.getCreateTime().toLocalDate() : today;
            card.setStageStayDays((int) ChronoUnit.DAYS.between(pivotDate, today));
            column.getItems().add(card);
            column.setCount(column.getCount() + 1);
            column.setTotalAmount(column.getTotalAmount().add(
                    item.getExpectedAmount() == null ? BigDecimal.ZERO : item.getExpectedAmount()));
        }
        return new ArrayList<>(columns.values());
    }

    private CrmOpportunityBoardColumnVO createColumn(String stage) {
        CrmOpportunityBoardColumnVO column = new CrmOpportunityBoardColumnVO();
        column.setStage(stage);
        column.setStageLabel(resolveStageLabel(stage));
        column.setCount(0);
        column.setTotalAmount(BigDecimal.ZERO);
        return column;
    }

    private String resolveStageLabel(String stage) {
        return switch (stage == null ? "" : stage) {
            case CrmConstants.OpportunityStage.LEAD -> "线索";
            case CrmConstants.OpportunityStage.QUALIFIED -> "已确认";
            case CrmConstants.OpportunityStage.PROPOSAL -> "方案报价";
            case CrmConstants.OpportunityStage.NEGOTIATION -> "商务谈判";
            case CrmConstants.OpportunityStage.WON -> "赢单";
            case CrmConstants.OpportunityStage.LOST -> "输单";
            default -> stage;
        };
    }

    private List<CrmReceivableAgingBucketVO> buildAgingBuckets() {
        Map<String, CrmReceivableAgingBucketVO> buckets = new LinkedHashMap<>();
        buckets.put("CURRENT", createBucket("CURRENT", "未逾期"));
        buckets.put("DUE_30", createBucket("DUE_30", "逾期1-30天"));
        buckets.put("DUE_60", createBucket("DUE_60", "逾期31-60天"));
        buckets.put("DUE_90", createBucket("DUE_90", "逾期61-90天"));
        buckets.put("DUE_90_PLUS", createBucket("DUE_90_PLUS", "逾期90天以上"));

        LocalDate today = LocalDate.now();
        List<CrmReceivable> receivables = receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmReceivable::getDueDate));
        Map<String, Set<Long>> customerCounter = new LinkedHashMap<>();
        for (String key : buckets.keySet()) {
            customerCounter.put(key, new HashSet<>());
        }
        for (CrmReceivable item : receivables) {
            if (item.getOutstandingAmount() == null || item.getOutstandingAmount().signum() <= 0) {
                continue;
            }
            String bucketCode = CrmHealthCalculator.resolveAgingBucket(item.getDueDate(), today);
            CrmReceivableAgingBucketVO bucket = buckets.get(bucketCode);
            if (bucket == null) {
                continue;
            }
            bucket.setReceivableCount(bucket.getReceivableCount() + 1);
            bucket.setOutstandingAmount(bucket.getOutstandingAmount().add(item.getOutstandingAmount()));
            if (item.getCustomerId() != null) {
                customerCounter.get(bucketCode).add(item.getCustomerId());
            }
        }
        for (Map.Entry<String, CrmReceivableAgingBucketVO> entry : buckets.entrySet()) {
            entry.getValue().setCustomerCount(customerCounter.get(entry.getKey()).size());
        }
        return new ArrayList<>(buckets.values());
    }

    private CrmReceivableAgingBucketVO createBucket(String code, String name) {
        CrmReceivableAgingBucketVO bucket = new CrmReceivableAgingBucketVO();
        bucket.setBucketCode(code);
        bucket.setBucketName(name);
        bucket.setCustomerCount(0);
        bucket.setReceivableCount(0);
        bucket.setOutstandingAmount(BigDecimal.ZERO);
        return bucket;
    }

    private int resolveStageStayDays(CrmOpportunity opportunity) {
        LocalDate date = opportunity.getStageChangedTime() != null ? opportunity.getStageChangedTime().toLocalDate()
                : opportunity.getUpdateTime() != null ? opportunity.getUpdateTime().toLocalDate()
                : opportunity.getCreateTime() != null ? opportunity.getCreateTime().toLocalDate() : LocalDate.now();
        return (int) ChronoUnit.DAYS.between(date, LocalDate.now());
    }

    private List<RemoteProjectLinkVO> loadProjects(Long customerId) {
        try {
            var response = remoteOaService.listProjects(1, 50, customerId, null);
            if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getRows() == null) {
                return new ArrayList<>();
            }
            return response.getData().getRows().stream().map(item -> {
                RemoteProjectLinkVO project = new RemoteProjectLinkVO();
                project.setProjectId(item.getProjectId());
                project.setProjectNo(item.getProjectNo());
                project.setProjectName(item.getProjectName());
                project.setStatus(item.getStatus());
                project.setRiskLevel(item.getRiskLevel());
                project.setBudgetAmount(item.getBudgetAmount());
                project.setActualCostAmount(item.getActualCostAmount());
                project.setSourceType(item.getSourceType());
                project.setSourceId(item.getSourceId());
                project.setSourceName(item.getSourceName());
                return project;
            }).toList();
        } catch (Exception ex) {
            log.warn("loadProjects failed, customerId={}", customerId, ex);
            return new ArrayList<>();
        }
    }

    private List<RemoteContractLinkVO> loadContracts(Long customerId) {
        try {
            var response = remoteOaService.listContracts(1, 50, customerId, null);
            if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getRows() == null) {
                return new ArrayList<>();
            }
            return response.getData().getRows().stream().map(item -> {
                RemoteContractLinkVO contract = new RemoteContractLinkVO();
                contract.setContractId(item.getContractId());
                contract.setContractNo(item.getContractNo());
                contract.setContractName(item.getContractName());
                contract.setStatus(item.getStatus());
                contract.setRiskLevel(item.getRiskLevel());
                contract.setAmount(item.getAmount());
                contract.setInvoiceStatus(item.getInvoiceStatus());
                contract.setProjectId(item.getProjectId());
                contract.setProjectName(item.getProjectName());
                return contract;
            }).toList();
        } catch (Exception ex) {
            log.warn("loadContracts failed, customerId={}", customerId, ex);
            return new ArrayList<>();
        }
    }

    private List<RemoteInvoiceLinkVO> loadInvoices(Long customerId) {
        try {
            var response = remoteOaService.listInvoices(1, 100, null, null, null, customerId);
            if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getRows() == null) {
                return new ArrayList<>();
            }
            return response.getData().getRows().stream().map(item -> {
                RemoteInvoiceLinkVO invoice = new RemoteInvoiceLinkVO();
                invoice.setInvoiceId(item.getInvoiceId());
                invoice.setInvoiceDirection(item.getInvoiceDirection());
                invoice.setInvoiceCode(item.getInvoiceCode());
                invoice.setInvoiceNo(item.getInvoiceNo());
                invoice.setInvoiceType(item.getInvoiceType());
                invoice.setGrossAmount(item.getGrossAmount());
                invoice.setStatus(item.getStatus());
                invoice.setReceivableId(item.getReceivableId());
                invoice.setContractId(item.getContractId());
                invoice.setContractNo(item.getContractNo());
                invoice.setExternalLinkUrl(item.getExternalLinkUrl());
                return invoice;
            }).limit(20).toList();
        } catch (Exception ex) {
            log.warn("loadInvoices failed, customerId={}", customerId, ex);
            return new ArrayList<>();
        }
    }

    private List<RemoteBudgetLinkVO> loadBudgets(List<RemoteProjectLinkVO> projects) {
        List<RemoteBudgetLinkVO> result = new ArrayList<>();
        for (RemoteProjectLinkVO project : projects) {
            if (project.getProjectId() == null) {
                continue;
            }
            try {
                var response = remoteOaService.listBudgets(1, 20, project.getProjectId(), null);
                if (response == null || !response.isSuccess() || response.getData() == null || response.getData().getRows() == null) {
                    continue;
                }
                result.addAll(response.getData().getRows().stream().map(item -> {
                    RemoteBudgetLinkVO budget = new RemoteBudgetLinkVO();
                    budget.setBudgetId(item.getBudgetId());
                    budget.setBudgetNo(item.getBudgetNo());
                    budget.setBudgetName(item.getBudgetName());
                    budget.setProjectId(item.getProjectId());
                    budget.setProjectName(item.getProjectName());
                    budget.setTotalAmount(item.getTotalAmount());
                    budget.setReservedAmount(item.getReservedAmount());
                    budget.setActualAmount(item.getActualAmount());
                    budget.setAvailableAmount(item.getAvailableAmount());
                    budget.setStatus(item.getStatus());
                    budget.setThresholdStatus(item.getThresholdStatus());
                    return budget;
                }).toList());
            } catch (Exception ex) {
                log.warn("loadBudgets failed, projectId={}", project.getProjectId(), ex);
            }
        }
        return result;
    }

    private List<CrmWorkspaceTodoItemVO> buildCrossModuleTodos(CrmCustomerWorkspaceVO workspace) {
        List<CrmWorkspaceTodoItemVO> todos = new ArrayList<>();
        workspace.getQuotes().stream()
                .filter(item -> List.of(
                        CrmConstants.QuoteStatus.PENDING,
                        CrmConstants.QuoteStatus.APPROVED,
                        CrmConstants.QuoteStatus.SENT).contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("quote-" + item.getQuoteId(), "CRM", "CRM 报价",
                        item.getQuoteName(), "报价待继续推进", item.getStatus(),
                        "/office/crm/quotes", item.getQuoteId(), "CRM_QUOTE")));
        workspace.getContracts().stream()
                .filter(item -> List.of("DRAFT", "PENDING", "APPROVED", "ACTIVE", "SEALING").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("contract-" + item.getContractId(), "OA", "OA 合同",
                        item.getContractName(), "合同链路待继续推进", item.getStatus(),
                        "/office/contracts", item.getContractId(), "CONTRACT")));
        workspace.getProjects().stream()
                .filter(item -> List.of("DRAFT", "PENDING", "APPROVED").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("project-" + item.getProjectId(), "OA", "OA 项目",
                        item.getProjectName(), "项目草稿或立项待处理", item.getStatus(),
                        "/office/project", item.getProjectId(), "PROJECT")));
        workspace.getBudgets().stream()
                .filter(item -> List.of("DRAFT", "PENDING", "APPROVED").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("budget-" + item.getBudgetId(), "OA", "OA 预算",
                        item.getBudgetName(), "预算草稿或审批待处理", item.getStatus(),
                        "/office/budget", item.getBudgetId(), "BUDGET")));
        workspace.getReceivables().stream()
                .filter(item -> (item.getOutstandingAmount() != null && item.getOutstandingAmount().signum() > 0)
                        || !CrmConstants.ReceivableStatus.RECEIVED.equals(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("receivable-" + item.getReceivableId(), "CRM", "CRM 回款",
                        item.getReceivableName(), "回款未完成或待确认", item.getStatus(),
                        "/office/crm/receivables", item.getReceivableId(), "CRM_RECEIVABLE")));
        return todos.stream().limit(8).toList();
    }

    private List<CrmWorkspaceRiskItemVO> buildCrossModuleRisks(CrmCustomer customer, CrmCustomerWorkspaceVO workspace) {
        List<CrmWorkspaceRiskItemVO> risks = new ArrayList<>();
        workspace.getHealthReasons().stream()
                .filter(item -> !CrmConstants.HealthLevel.GREEN.equalsIgnoreCase(item.getLevel()))
                .forEach(item -> risks.add(risk(item.getCode(), "CRM", "客户健康", item.getName(),
                        customer.getHealthReason(), item.getLevel(), "OPEN",
                        "/office/crm/customer/" + customer.getCustomerId(), customer.getCustomerId(), "CRM_CUSTOMER")));
        workspace.getBudgets().stream()
                .filter(item -> List.of(
                        CrmConstants.BudgetThreshold.WARN,
                        CrmConstants.BudgetThreshold.ALERT,
                        CrmConstants.BudgetThreshold.BLOCK).contains(item.getThresholdStatus()))
                .forEach(item -> risks.add(risk("budget-" + item.getBudgetId(), "OA", "预算阈值",
                        item.getBudgetName(), "预算执行已进入阈值区间",
                        item.getThresholdStatus(), item.getStatus(),
                        "/office/budget", item.getBudgetId(), "BUDGET")));
        workspace.getInvoices().stream()
                .filter(item -> List.of(CrmConstants.InvoiceStatus.WRITEOFF_PARTIAL, CrmConstants.InvoiceStatus.VOID)
                        .contains(item.getStatus()))
                .forEach(item -> risks.add(risk("invoice-" + item.getInvoiceId(), "OA", "发票异常",
                        item.getInvoiceNo(), "发票部分核销或已作废",
                        item.getStatus(), item.getStatus(),
                        "/office/invoice", item.getInvoiceId(), "INVOICE")));
        workspace.getProjects().stream()
                .filter(item -> List.of(
                        CrmConstants.RiskLevel.HIGH,
                        CrmConstants.RiskLevel.RED,
                        CrmConstants.RiskLevel.MEDIUM).contains(item.getRiskLevel()))
                .forEach(item -> risks.add(risk("project-" + item.getProjectId(), "OA", "项目风险",
                        item.getProjectName(), "项目风险等级已抬高",
                        item.getRiskLevel(), item.getStatus(),
                        "/office/project", item.getProjectId(), "PROJECT")));
        return risks.stream().limit(8).toList();
    }

    private CrmLinkSummaryVO buildLinkSummary(CrmCustomerWorkspaceVO workspace) {
        CrmLinkSummaryVO summary = new CrmLinkSummaryVO();
        summary.setContractCount(workspace.getContracts().size());
        summary.setInvoiceCount(workspace.getInvoices().size());
        summary.setBudgetCount(workspace.getBudgets().size());
        summary.setProjectCount(workspace.getProjects().size());
        summary.setOpenTodoCount(workspace.getCrossModuleTodos().size());
        summary.setOpenRiskCount(workspace.getCrossModuleRisks().size());
        return summary;
    }

    private List<CrmWorkspaceTodoItemVO> buildDashboardTodos() {
        List<CrmWorkspaceTodoItemVO> todos = new ArrayList<>();
        topActiveCustomers().forEach(customer -> {
            CrmCustomerWorkspaceVO workspace = getWorkspace(customer.getCustomerId());
            todos.addAll(workspace.getCrossModuleTodos());
        });
        return todos.stream().limit(8).toList();
    }

    private List<CrmWorkspaceRiskItemVO> buildDashboardRisks() {
        List<CrmWorkspaceRiskItemVO> risks = new ArrayList<>();
        topActiveCustomers().forEach(customer -> {
            CrmCustomerWorkspaceVO workspace = getWorkspace(customer.getCustomerId());
            risks.addAll(workspace.getCrossModuleRisks());
        });
        return risks.stream().limit(8).toList();
    }

    private List<RemoteBudgetLinkVO> loadBudgetAlerts() {
        List<RemoteBudgetLinkVO> alerts = new ArrayList<>();
        topActiveCustomers().forEach(customer -> getWorkspace(customer.getCustomerId()).getBudgets().stream()
                .filter(item -> List.of(
                        CrmConstants.BudgetThreshold.WARN,
                        CrmConstants.BudgetThreshold.ALERT,
                        CrmConstants.BudgetThreshold.BLOCK).contains(item.getThresholdStatus()))
                .forEach(alerts::add));
        return alerts.stream().limit(8).toList();
    }

    private List<RemoteInvoiceLinkVO> loadInvoiceExceptions() {
        List<RemoteInvoiceLinkVO> invoices = new ArrayList<>();
        topActiveCustomers().forEach(customer -> getWorkspace(customer.getCustomerId()).getInvoices().stream()
                .filter(item -> List.of(
                        CrmConstants.InvoiceStatus.BOUND,
                        CrmConstants.InvoiceStatus.WRITEOFF_PARTIAL,
                        CrmConstants.InvoiceStatus.VOID).contains(item.getStatus()))
                .forEach(invoices::add));
        return invoices.stream().limit(8).toList();
    }

    private List<CrmCustomer> topActiveCustomers() {
        return customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                        .eq(CrmCustomer::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .orderByDesc(CrmCustomer::getUpdateTime))
                .stream()
                .limit(8)
                .toList();
    }

    private List<CrmWorkspaceActivityItemVO> buildDashboardActivities() {
        List<CrmWorkspaceActivityItemVO> activities = new ArrayList<>();
        quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                        .eq(CrmQuote::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .orderByDesc(CrmQuote::getUpdateTime))
                .stream()
                .limit(4)
                .forEach(item -> activities.add(activity(
                        "activity-quote-" + item.getQuoteId(),
                        "CRM", "CRM 报价",
                        item.getQuoteName(),
                        "报价状态变更为 " + item.getStatus(),
                        item.getOwnerName(),
                        item.getUpdateTime() != null ? item.getUpdateTime() : item.getCreateTime(),
                        "/office/crm/quotes",
                        item.getQuoteId(),
                        "CRM_QUOTE")));
        receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                        .eq(CrmReceivable::getDelFlag, CrmConstants.DelFlag.NORMAL)
                        .orderByDesc(CrmReceivable::getUpdateTime))
                .stream()
                .limit(4)
                .forEach(item -> activities.add(activity(
                        "activity-receivable-" + item.getReceivableId(),
                        "CRM", "CRM 回款",
                        item.getReceivableName(),
                        "回款状态 " + item.getStatus() + "，发票状态 " + item.getInvoiceStatus(),
                        item.getOwnerName(),
                        item.getUpdateTime() != null ? item.getUpdateTime() : item.getCreateTime(),
                        "/office/crm/receivables",
                        item.getReceivableId(),
                        "CRM_RECEIVABLE")));
        return activities.stream()
                .sorted(Comparator.comparing(CrmWorkspaceActivityItemVO::getEventTime,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(8)
                .toList();
    }

    private CrmWorkspaceTodoItemVO todo(String id, String module, String sourceLabel, String title,
                                        String description, String status, String path,
                                        Long businessId, String businessType) {
        CrmWorkspaceTodoItemVO item = new CrmWorkspaceTodoItemVO();
        item.setId(id);
        item.setModule(module);
        item.setSourceLabel(sourceLabel);
        item.setTitle(title);
        item.setDescription(description);
        item.setStatus(status);
        item.setPath(path);
        item.setBusinessId(businessId);
        item.setBusinessType(businessType);
        return item;
    }

    private CrmWorkspaceRiskItemVO risk(String id, String module, String sourceLabel, String title,
                                        String description, String level, String status, String path,
                                        Long businessId, String businessType) {
        CrmWorkspaceRiskItemVO item = new CrmWorkspaceRiskItemVO();
        item.setId(id);
        item.setModule(module);
        item.setSourceLabel(sourceLabel);
        item.setTitle(title);
        item.setDescription(description);
        item.setLevel(level);
        item.setStatus(status);
        item.setPath(path);
        item.setBusinessId(businessId);
        item.setBusinessType(businessType);
        return item;
    }

    private CrmWorkspaceActivityItemVO activity(String id, String module, String sourceLabel, String title,
                                                String content, String operatorName, LocalDateTime eventTime,
                                                String path, Long businessId, String businessType) {
        CrmWorkspaceActivityItemVO item = new CrmWorkspaceActivityItemVO();
        item.setId(id);
        item.setModule(module);
        item.setSourceLabel(sourceLabel);
        item.setTitle(title);
        item.setContent(content);
        item.setOperatorName(operatorName);
        item.setEventTime(eventTime);
        item.setPath(path);
        item.setBusinessId(businessId);
        item.setBusinessType(businessType);
        return item;
    }
}
