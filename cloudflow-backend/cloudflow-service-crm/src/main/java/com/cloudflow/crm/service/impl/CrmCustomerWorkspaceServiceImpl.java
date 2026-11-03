package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
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
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.audit.annotation.Audit;
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
import java.util.Objects;
import java.util.Set;

/**
 * 客户工作台与 Dashboard 聚合。
 * 只做读模型组装，写操作交给 {@link ICrmCustomerService} / {@link com.cloudflow.crm.service.ICrmCrossModuleDraftService}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CrmCustomerWorkspaceServiceImpl implements ICrmCustomerWorkspaceService {

    private final ICrmCustomerService crmCustomerService;
    private final CrmCustomerMapper customerMapper;
    private final CrmContactMapper contactMapper;
    private final CrmFollowUpMapper followUpMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmRenewalMapper renewalMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final RemoteOaService remoteOaService;
    private final com.cloudflow.common.redis.core.SysDictHelper sysDictHelper;
    private final CrmLostAnalysisService lostAnalysisService;
    private final CrmCustomerHealthService healthService;

    @Override
    public CrmCustomerWorkspaceVO getWorkspace(Long customerId) {
        return buildWorkspace(requireCustomer(customerId));
    }

    private CrmCustomerWorkspaceVO buildWorkspace(CrmCustomer customer) {
        Long customerId = customer.getCustomerId();
        CrmCustomerWorkspaceVO workspace = new CrmCustomerWorkspaceVO();
        workspace.setCustomer(customer);
        workspace.setContacts(contactMapper.selectList(new LambdaQueryWrapper<CrmContact>()
                .eq(CrmContact::getCustomerId, customerId)
                .eq(CrmContact::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmContact::getPrimaryFlag)
                .orderByAsc(CrmContact::getContactId)));
        workspace.setFollowUps(followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getCustomerId, customerId)
                .eq(CrmFollowUp::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmFollowUp::getFollowUpTime)));
        workspace.setOpportunities(opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getCustomerId, customerId)
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmOpportunity::getUpdateTime)));
        workspace.setQuotes(quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getCustomerId, customerId)
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmQuote::getUpdateTime)));
        workspace.setReceivables(receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getCustomerId, customerId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmReceivable::getDueDate)));
        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getCustomerId, customerId)
                .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmRenewal::getCurrentExpireDate));
        renewals.forEach(r -> CrmRenewalRiskEvaluator.enrich(r, sysDictHelper));
        workspace.setRenewals(renewals);
        workspace.setTickets(serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmServiceTicket::getUpdateTime)));
        workspace.setHealthReasons(healthService.refresh(customer, workspace.getFollowUps(), renewals,
                workspace.getReceivables(), workspace.getTickets()));
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
        summary.setLostAnalysis(lostAnalysisService.report(null, null));
        List<CrmCustomer> customers = accessibleCustomers(200);
        List<Long> accessibleCustomerIds = customers.stream().map(CrmCustomer::getCustomerId).toList();
        summary.setFunnel(buildOpportunityBoard(accessibleCustomerIds));
        if (accessibleCustomerIds.isEmpty()) {
            summary.setPendingQuotes(List.of());
            summary.setAgingBuckets(buildAgingBuckets(accessibleCustomerIds));
            summary.setRenewalWindows(List.of());
            summary.setHighSeverityTickets(List.of());
            summary.setStaleFollowCustomers(List.of());
            summary.setStalledOpportunities(List.of());
            summary.setCrossModuleTodos(List.of());
            summary.setCrossModuleRisks(List.of());
            summary.setBudgetAlerts(List.of());
            summary.setInvoiceExceptions(List.of());
            return summary;
        }
        summary.setPendingQuotes(quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                        .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmQuote::getCustomerId, accessibleCustomerIds)
                        .in(CrmQuote::getStatus, List.of(
                                CrmConstants.QuoteStatus.PENDING,
                                CrmConstants.QuoteStatus.APPROVED,
                                CrmConstants.QuoteStatus.SENT))
                        .orderByDesc(CrmQuote::getUpdateTime)
                        .last("LIMIT 8")));
        summary.setAgingBuckets(buildAgingBuckets(accessibleCustomerIds));

        LocalDate today = LocalDate.now();
        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL)
                .in(CrmRenewal::getCustomerId, accessibleCustomerIds)
                .between(CrmRenewal::getCurrentExpireDate, today, today.plusDays(90))
                .orderByAsc(CrmRenewal::getCurrentExpireDate)
                .last("LIMIT 10"));
        renewals.forEach(item -> CrmRenewalRiskEvaluator.enrich(item, sysDictHelper));
        summary.setRenewalWindows(renewals);
        summary.setHighSeverityTickets(serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                        .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmServiceTicket::getCustomerId, accessibleCustomerIds)
                        .in(CrmServiceTicket::getSeverity,
                        CrmConstants.TicketSeverity.P2,
                        CrmConstants.TicketSeverity.P1)
                        .notIn(CrmServiceTicket::getStatus,
                                CrmConstants.TicketStatus.RESOLVED,
                                CrmConstants.TicketStatus.CLOSED)
                        .orderByDesc(CrmServiceTicket::getUpdateTime)
                        .last("LIMIT 10")));
        summary.setStaleFollowCustomers(customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                        .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmCustomer::getCustomerId, accessibleCustomerIds)
                        .and(query -> query.isNull(CrmCustomer::getLastFollowUpTime)
                                .or().lt(CrmCustomer::getLastFollowUpTime, today.minusDays(6).atStartOfDay()))
                        .orderByAsc(CrmCustomer::getLastFollowUpTime)
                        .last("LIMIT 10")));
        summary.setStalledOpportunities(opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                        .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmOpportunity::getCustomerId, accessibleCustomerIds)
                        .notIn(CrmOpportunity::getStage,
                                CrmConstants.OpportunityStage.WON,
                                CrmConstants.OpportunityStage.LOST)
                        .apply("COALESCE(stage_changed_time, update_time, create_time) < {0}",
                                today.minusDays(13).atStartOfDay())
                        .orderByAsc(CrmOpportunity::getStageChangedTime)
                        .last("LIMIT 10")));
        List<CrmCustomerWorkspaceVO> workspaces = customers.stream().limit(8).map(this::buildWorkspace).toList();
        summary.setCrossModuleTodos(buildDashboardTodos(workspaces));
        summary.setCrossModuleRisks(buildDashboardRisks(workspaces));
        summary.setBudgetAlerts(loadBudgetAlerts(workspaces));
        summary.setInvoiceExceptions(loadInvoiceExceptions(workspaces));
        return summary;
    }

    @Override
    public CrmDashboardWorkplaceVO getDashboardWorkplace() {
        CrmDashboardWorkplaceVO summary = new CrmDashboardWorkplaceVO();
        List<CrmCustomer> customers = accessibleCustomers(200);
        List<CrmCustomerWorkspaceVO> workspaces = customers.stream().limit(8).map(this::buildWorkspace).toList();
        summary.setTodos(buildDashboardTodos(workspaces));
        summary.setRisks(buildDashboardRisks(workspaces));
        summary.setActivities(buildDashboardActivities(customers.stream().map(CrmCustomer::getCustomerId).toList()));
        return summary;
    }

    private CrmCustomer requireCustomer(Long customerId) {
        return crmCustomerService.getAccessibleCustomer(customerId);
    }

    private List<CrmOpportunityBoardColumnVO> buildOpportunityBoard(List<Long> accessibleCustomerIds) {
        if (accessibleCustomerIds.isEmpty()) {
            return defaultOpportunityBoardColumns();
        }
        List<CrmOpportunity> opportunities = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .in(CrmOpportunity::getCustomerId, accessibleCustomerIds)
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

    private List<CrmOpportunityBoardColumnVO> defaultOpportunityBoardColumns() {
        List<CrmOpportunityBoardColumnVO> columns = new ArrayList<>();
        for (String stage : List.of(
                CrmConstants.OpportunityStage.LEAD,
                CrmConstants.OpportunityStage.QUALIFIED,
                CrmConstants.OpportunityStage.PROPOSAL,
                CrmConstants.OpportunityStage.NEGOTIATION,
                CrmConstants.OpportunityStage.WON,
                CrmConstants.OpportunityStage.LOST)) {
            columns.add(createColumn(stage));
        }
        return columns;
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

    private List<CrmReceivableAgingBucketVO> buildAgingBuckets(List<Long> accessibleCustomerIds) {
        List<CrmReceivableAging.Tier> tiers = CrmReceivableAging.loadTiers(sysDictHelper);
        List<CrmReceivable> receivables = accessibleCustomerIds.isEmpty() ? List.of()
                : receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                        .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmReceivable::getCustomerId, accessibleCustomerIds)
                        .gt(CrmReceivable::getOutstandingAmount, BigDecimal.ZERO));
        return CrmReceivableAging.summarize(receivables, tiers, LocalDate.now());
    }

    private List<RemoteProjectLinkVO> loadProjects(Long customerId) {
        try {
            R<PageResult<RemoteOaService.ProjectInfo>> response = remoteOaService.listProjects(1, 50, customerId, null);
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
            R<PageResult<RemoteOaService.ContractInfo>> response = remoteOaService.listContracts(1, 50, customerId, null);
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
            R<PageResult<RemoteOaService.InvoiceInfo>> response = remoteOaService.listInvoices(1, 100, null, null, null, customerId);
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
                R<PageResult<RemoteOaService.BudgetInfo>> response = remoteOaService.listBudgets(1, 20, project.getProjectId(), null);
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
                .filter(item -> isQuoteTodoStatus(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("quote-" + item.getQuoteId(), "CRM", "CRM 报价",
                        item.getQuoteName(), "报价待继续推进", item.getStatus(),
                        "/office/crm/quotes", item.getQuoteId(), "CRM_QUOTE")));
        workspace.getContracts().stream()
                .filter(item -> isContractTodoStatus(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("contract-" + item.getContractId(), "OA", "OA 合同",
                        item.getContractName(), "合同链路待继续推进", item.getStatus(),
                        "/office/contracts", item.getContractId(), "CONTRACT")));
        workspace.getProjects().stream()
                .filter(item -> isProjectTodoStatus(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("project-" + item.getProjectId(), "OA", "OA 项目",
                        item.getProjectName(), "项目草稿或立项待处理", item.getStatus(),
                        "/office/project", item.getProjectId(), "PROJECT")));
        workspace.getBudgets().stream()
                .filter(item -> isBudgetTodoStatus(item.getStatus()))
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
                .filter(item -> isBudgetThresholdRisk(item.getThresholdStatus()))
                .forEach(item -> risks.add(risk("budget-" + item.getBudgetId(), "OA", "预算阈值",
                        item.getBudgetName(), "预算执行已进入阈值区间",
                        item.getThresholdStatus(), item.getStatus(),
                        "/office/budget", item.getBudgetId(), "BUDGET")));
        workspace.getInvoices().stream()
                .filter(item -> isInvoiceRiskStatus(item.getStatus()))
                .forEach(item -> risks.add(risk("invoice-" + item.getInvoiceId(), "OA", "发票异常",
                        item.getInvoiceNo(), "发票部分核销或已作废",
                        item.getStatus(), item.getStatus(),
                        "/office/invoice", item.getInvoiceId(), "INVOICE")));
        workspace.getProjects().stream()
                .filter(item -> isProjectRiskLevel(item.getRiskLevel()))
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

    private List<CrmWorkspaceTodoItemVO> buildDashboardTodos(List<CrmCustomerWorkspaceVO> workspaces) {
        return workspaces.stream().flatMap(workspace -> workspace.getCrossModuleTodos().stream()).limit(8).toList();
    }

    private List<CrmWorkspaceRiskItemVO> buildDashboardRisks(List<CrmCustomerWorkspaceVO> workspaces) {
        return workspaces.stream().flatMap(workspace -> workspace.getCrossModuleRisks().stream()).limit(8).toList();
    }

    private List<RemoteBudgetLinkVO> loadBudgetAlerts(List<CrmCustomerWorkspaceVO> workspaces) {
        return workspaces.stream().flatMap(workspace -> workspace.getBudgets().stream())
                .filter(item -> isBudgetThresholdRisk(item.getThresholdStatus())).limit(8).toList();
    }

    private List<RemoteInvoiceLinkVO> loadInvoiceExceptions(List<CrmCustomerWorkspaceVO> workspaces) {
        return workspaces.stream().flatMap(workspace -> workspace.getInvoices().stream())
                .filter(item -> isInvoiceExceptionStatus(item.getStatus())).limit(8).toList();
    }

    private List<CrmCustomer> accessibleCustomers(int limit) {
        Page<CrmCustomer> page = customerMapper.selectPageByDataScope(
                new Page<>(1, Math.max(1, limit), false),
                new CrmCustomer(),
                DataScopeUtils.listScope("dept_id", "owner_id"));
        return page.getRecords() == null ? List.of() : page.getRecords();
    }

    private List<CrmWorkspaceActivityItemVO> buildDashboardActivities(List<Long> accessibleCustomerIds) {
        if (accessibleCustomerIds.isEmpty()) {
            return List.of();
        }
        List<CrmWorkspaceActivityItemVO> activities = new ArrayList<>();
        quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                        .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmQuote::getCustomerId, accessibleCustomerIds)
                        .orderByDesc(CrmQuote::getUpdateTime)
                        .last("LIMIT 4"))
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
                        .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                        .in(CrmReceivable::getCustomerId, accessibleCustomerIds)
                        .orderByDesc(CrmReceivable::getUpdateTime)
                        .last("LIMIT 4"))
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

    private boolean isBudgetThresholdRisk(String thresholdStatus) {
        return CrmConstants.BudgetThreshold.WARN.equals(thresholdStatus)
                || CrmConstants.BudgetThreshold.ALERT.equals(thresholdStatus)
                || CrmConstants.BudgetThreshold.BLOCK.equals(thresholdStatus);
    }

    private boolean isQuoteTodoStatus(String status) {
        return CrmConstants.QuoteStatus.PENDING.equals(status)
                || CrmConstants.QuoteStatus.APPROVED.equals(status)
                || CrmConstants.QuoteStatus.SENT.equals(status);
    }

    private boolean isContractTodoStatus(String status) {
        return "DRAFT".equals(status)
                || "PENDING".equals(status)
                || "APPROVED".equals(status)
                || "ACTIVE".equals(status)
                || "SEALING".equals(status);
    }

    private boolean isProjectTodoStatus(String status) {
        return "DRAFT".equals(status)
                || "PENDING".equals(status)
                || "APPROVED".equals(status);
    }

    private boolean isBudgetTodoStatus(String status) {
        return "DRAFT".equals(status)
                || "PENDING".equals(status)
                || "APPROVED".equals(status);
    }

    private boolean isInvoiceRiskStatus(String status) {
        return CrmConstants.InvoiceStatus.WRITEOFF_PARTIAL.equals(status)
                || CrmConstants.InvoiceStatus.VOID.equals(status);
    }

    private boolean isProjectRiskLevel(String riskLevel) {
        return CrmConstants.RiskLevel.HIGH.equals(riskLevel)
                || CrmConstants.RiskLevel.RED.equals(riskLevel)
                || CrmConstants.RiskLevel.MEDIUM.equals(riskLevel);
    }

    private boolean isInvoiceExceptionStatus(String status) {
        return CrmConstants.InvoiceStatus.BOUND.equals(status)
                || CrmConstants.InvoiceStatus.WRITEOFF_PARTIAL.equals(status)
                || CrmConstants.InvoiceStatus.VOID.equals(status);
    }
}
