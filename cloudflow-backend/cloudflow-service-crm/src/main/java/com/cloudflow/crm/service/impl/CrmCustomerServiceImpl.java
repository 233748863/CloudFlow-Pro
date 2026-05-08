package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.CrmDashboardWorkplaceVO;
import com.cloudflow.crm.domain.vo.CrmWorkspaceActivityItemVO;
import com.cloudflow.crm.domain.vo.CrmLinkSummaryVO;
import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.domain.vo.CrmHealthReasonItemVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardCardVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;
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
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class CrmCustomerServiceImpl extends CrmServiceSupport<CrmCustomerMapper, CrmCustomer>
        implements ICrmCustomerService {

    private final CrmRenewalMapper renewalMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final CrmFollowUpMapper followUpMapper;
    private final CrmContactMapper contactMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final RemoteOaService remoteOaService;

    @Override
    public PageResult<CrmCustomer> queryPage(CrmCustomer query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmCustomer> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmCustomer::getDelFlag, "0")
                .orderByDesc(CrmCustomer::getUpdateTime);
        likeIfPresent(wrapper, CrmCustomer::getCustomerName, query.getCustomerName());
        likeIfPresent(wrapper, CrmCustomer::getCustomerCode, query.getCustomerCode());
        likeIfPresent(wrapper, CrmCustomer::getCustomerTags, query.getCustomerTags());
        eqIfPresent(wrapper, CrmCustomer::getHealthLevel, query.getHealthLevel());
        eqIfPresent(wrapper, CrmCustomer::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createCustomer(CrmCustomer customer) {
        validate(customer);
        Localize.fillCustomerDefaults(customer, currentTenantId(), currentUserName(), now());
        boolean saved = save(customer);
        if (saved) {
            refreshHealth(customer.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateCustomer(CrmCustomer customer) {
        if (customer == null || customer.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        validate(customer);
        CrmCustomer persisted = requireById(customer.getCustomerId(), "客户不存在");
        customer.setTenantId(persisted.getTenantId());
        customer.setUpdateBy(currentUserName());
        customer.setUpdateTime(now());
        boolean updated = updateById(customer);
        if (updated) {
            refreshHealth(customer.getCustomerId());
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void refreshHealth(Long customerId) {
        if (customerId == null) {
            return;
        }
        CrmCustomer customer = getById(customerId);
        if (customer == null || !"0".equals(customer.getDelFlag())) {
            return;
        }

        LocalDate today = LocalDate.now();
        LocalDateTime currentTime = now();

        List<CrmFollowUp> followUps = followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getCustomerId, customerId)
                .eq(CrmFollowUp::getDelFlag, "0"));

        LocalDateTime lastFollowUpTime = followUps.stream()
                .map(CrmFollowUp::getFollowUpTime)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        LocalDateTime nextFollowUpTime = followUps.stream()
                .map(CrmFollowUp::getNextFollowUpTime)
                .filter(Objects::nonNull)
                .filter(value -> !value.isBefore(currentTime))
                .min(Comparator.naturalOrder())
                .orElse(null);

        LocalDate renewalWindowDate = resolveRenewalWindowDate(customerId);
        int overdueDays = resolveMaxOverdueDays(customerId, today);
        boolean hasHighSeverityOpenTicket = hasHighSeverityOpenTicket(customerId);

        List<String> redReasons = new ArrayList<>();
        List<String> yellowReasons = new ArrayList<>();

        if (renewalWindowDate != null) {
            long daysToRenewal = ChronoUnit.DAYS.between(today, renewalWindowDate);
            if (daysToRenewal <= 30) {
                redReasons.add("30天内续约到期");
            } else if (daysToRenewal <= 90) {
                yellowReasons.add("90天内续约到期");
            }
        }

        if (overdueDays > 30) {
            redReasons.add("回款逾期超过30天");
        } else if (overdueDays > 0) {
            yellowReasons.add("回款逾期未超过30天");
        }

        if (hasHighSeverityOpenTicket) {
            redReasons.add("存在高严重度未关闭工单");
        }

        if (lastFollowUpTime == null || ChronoUnit.DAYS.between(lastFollowUpTime.toLocalDate(), today) >= 30) {
            yellowReasons.add("30天未跟进");
        }

        String healthLevel;
        String healthReason;
        if (!redReasons.isEmpty()) {
            healthLevel = "RED";
            healthReason = String.join("；", redReasons);
        } else if (!yellowReasons.isEmpty()) {
            healthLevel = "YELLOW";
            healthReason = String.join("；", yellowReasons);
        } else {
            healthLevel = "GREEN";
            healthReason = "状态正常";
        }

        LambdaUpdateWrapper<CrmCustomer> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmCustomer::getCustomerId, customerId)
                .set(CrmCustomer::getHealthLevel, healthLevel)
                .set(CrmCustomer::getHealthReason, healthReason)
                .set(CrmCustomer::getLastFollowUpTime, lastFollowUpTime)
                .set(CrmCustomer::getNextFollowUpTime, nextFollowUpTime)
                .set(CrmCustomer::getUpdateBy, currentUserName())
                .set(CrmCustomer::getUpdateTime, currentTime);
        update(null, wrapper);
    }

    @Override
    public CrmCustomerWorkspaceVO getWorkspace(Long customerId) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        refreshHealth(customerId);
        customer = requireById(customerId, "客户不存在");

        CrmCustomerWorkspaceVO workspace = new CrmCustomerWorkspaceVO();
        workspace.setCustomer(customer);
        workspace.setHealthReasons(buildHealthReasons(customerId, customer));
        workspace.setContacts(contactMapper.selectList(new LambdaQueryWrapper<CrmContact>()
                .eq(CrmContact::getCustomerId, customerId)
                .eq(CrmContact::getDelFlag, "0")
                .orderByDesc(CrmContact::getPrimaryFlag)
                .orderByAsc(CrmContact::getContactId)));
        workspace.setFollowUps(followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getCustomerId, customerId)
                .eq(CrmFollowUp::getDelFlag, "0")
                .orderByDesc(CrmFollowUp::getFollowUpTime)));
        workspace.setOpportunities(opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getCustomerId, customerId)
                .eq(CrmOpportunity::getDelFlag, "0")
                .orderByDesc(CrmOpportunity::getUpdateTime)));
        workspace.setQuotes(quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getCustomerId, customerId)
                .eq(CrmQuote::getDelFlag, "0")
                .orderByDesc(CrmQuote::getUpdateTime)));
        workspace.setReceivables(receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getCustomerId, customerId)
                .eq(CrmReceivable::getDelFlag, "0")
                .orderByAsc(CrmReceivable::getDueDate)));
        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getCustomerId, customerId)
                .eq(CrmRenewal::getDelFlag, "0")
                .orderByAsc(CrmRenewal::getCurrentExpireDate));
        renewals.forEach(this::enrichRenewalRisk);
        workspace.setRenewals(renewals);
        workspace.setTickets(serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDelFlag, "0")
                .orderByDesc(CrmServiceTicket::getUpdateTime)));
        workspace.setContracts(loadContracts(customerId));
        workspace.setInvoices(loadInvoices(customerId));
        workspace.setProjects(loadProjects(customerId));
        workspace.setBudgets(loadBudgets(workspace.getProjects()));
        workspace.setCrossModuleTodos(buildCrossModuleTodos(customer, workspace));
        workspace.setCrossModuleRisks(buildCrossModuleRisks(customer, workspace));
        workspace.setLinkSummary(buildLinkSummary(workspace));
        return workspace;
    }

    @Override
    public CrmDashboardSummaryVO getDashboardSummary() {
        CrmDashboardSummaryVO summary = new CrmDashboardSummaryVO();
        summary.setFunnel(buildOpportunityBoard());
        summary.setPendingQuotes(quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getDelFlag, "0")
                .in(CrmQuote::getStatus, List.of("PENDING", "APPROVED", "SENT"))
                .orderByDesc(CrmQuote::getUpdateTime))
                .stream()
                .limit(8)
                .toList());
        summary.setAgingBuckets(buildAgingBuckets());

        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getDelFlag, "0")
                .orderByAsc(CrmRenewal::getCurrentExpireDate));
        renewals.forEach(this::enrichRenewalRisk);
        summary.setRenewalWindows(renewals.stream()
                .filter(item -> item.getCurrentExpireDate() != null)
                .filter(item -> !item.getCurrentExpireDate().isBefore(LocalDate.now()))
                .filter(item -> ChronoUnit.DAYS.between(LocalDate.now(), item.getCurrentExpireDate()) <= 90)
                .limit(10)
                .toList());
        summary.setHighSeverityTickets(serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getDelFlag, "0")
                .in(CrmServiceTicket::getSeverity, List.of("HIGH", "CRITICAL"))
                .notIn(CrmServiceTicket::getStatus, List.of("RESOLVED", "CLOSED"))
                .orderByDesc(CrmServiceTicket::getUpdateTime))
                .stream()
                .limit(10)
                .toList());
        summary.setStaleFollowCustomers(list(new LambdaQueryWrapper<CrmCustomer>()
                        .eq(CrmCustomer::getDelFlag, "0")
                        .orderByAsc(CrmCustomer::getLastFollowUpTime))
                .stream()
                .filter(item -> item.getLastFollowUpTime() == null || ChronoUnit.DAYS.between(item.getLastFollowUpTime().toLocalDate(), LocalDate.now()) >= 7)
                .limit(10)
                .toList());
        summary.setStalledOpportunities(opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                        .eq(CrmOpportunity::getDelFlag, "0")
                        .notIn(CrmOpportunity::getStage, List.of("WON", "LOST"))
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

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createWorkspaceContractDraft(Long customerId, RemoteOaService.ContractDraftRequest request) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        RemoteOaService.ContractDraftRequest payload = request == null ? new RemoteOaService.ContractDraftRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        if (!StringUtils.hasText(payload.getCounterpartyName())) {
            payload.setCounterpartyName(customer.getCustomerName());
        }
        if (!StringUtils.hasText(payload.getContractName())) {
            payload.setContractName(customer.getCustomerName() + "合同草稿");
        }
        if (!StringUtils.hasText(payload.getContractType())) {
            payload.setContractType("SALES");
        }
        if (payload.getAmount() == null) {
            payload.setAmount(BigDecimal.ZERO);
        }
        R<Long> response = remoteOaService.createContract("true", "cloudflow-service-crm", payload);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成合同草稿失败");
        }
        return response.getData();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createWorkspaceProjectDraft(Long customerId, RemoteOaService.ProjectDraftRequest request) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        RemoteOaService.ProjectDraftRequest payload = request == null ? new RemoteOaService.ProjectDraftRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        if (!StringUtils.hasText(payload.getProjectName())) {
            payload.setProjectName(customer.getCustomerName() + "交付项目");
        }
        if (!StringUtils.hasText(payload.getProjectType())) {
            payload.setProjectType("DELIVERY");
        }
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus("DRAFT");
        }
        if (!StringUtils.hasText(payload.getPriority())) {
            payload.setPriority("MEDIUM");
        }
        if (!StringUtils.hasText(payload.getRiskLevel())) {
            payload.setRiskLevel("LOW");
        }
        if (!StringUtils.hasText(payload.getSourceType())) {
            payload.setSourceType("CRM_CUSTOMER");
        }
        if (payload.getSourceId() == null) {
            payload.setSourceId(customerId);
        }
        if (!StringUtils.hasText(payload.getSourceName())) {
            payload.setSourceName(customer.getCustomerName());
        }
        if (payload.getBudgetAmount() == null) {
            payload.setBudgetAmount(BigDecimal.ZERO);
        }
        R<Long> response = remoteOaService.createProject("true", "cloudflow-service-crm", payload);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成项目草稿失败");
        }
        return response.getData();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createWorkspaceBudgetDraft(Long customerId, RemoteOaService.BudgetDraftRequest request) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        RemoteOaService.BudgetDraftRequest payload = request == null ? new RemoteOaService.BudgetDraftRequest() : request;
        if (!StringUtils.hasText(payload.getBudgetName())) {
            payload.setBudgetName(customer.getCustomerName() + "预算草稿");
        }
        if (payload.getFiscalYear() == null) {
            payload.setFiscalYear(LocalDate.now().getYear());
        }
        if (!StringUtils.hasText(payload.getPeriodType())) {
            payload.setPeriodType("ANNUAL");
        }
        if (!StringUtils.hasText(payload.getTargetType())) {
            payload.setTargetType(payload.getProjectId() != null ? "PROJECT" : "DEPT");
        }
        if (!StringUtils.hasText(payload.getTargetName())) {
            payload.setTargetName(StringUtils.hasText(payload.getProjectName()) ? payload.getProjectName() : customer.getDeptName());
        }
        if (payload.getTargetId() == null) {
            payload.setTargetId("PROJECT".equals(payload.getTargetType()) ? payload.getProjectId() : customer.getDeptId());
        }
        if (payload.getTotalAmount() == null) {
            payload.setTotalAmount(BigDecimal.ZERO);
        }
        if (payload.getLines() == null || payload.getLines().isEmpty()) {
            throw new IllegalArgumentException("预算明细不能为空");
        }
        R<Void> response = remoteOaService.createBudget("true", "cloudflow-service-crm", payload);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成预算草稿失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createWorkspaceInvoiceDraft(Long customerId, RemoteOaService.InvoiceDraftRequest request) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        RemoteOaService.InvoiceDraftRequest payload = request == null ? new RemoteOaService.InvoiceDraftRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        if (!StringUtils.hasText(payload.getInvoiceDirection())) {
            payload.setInvoiceDirection("OUTPUT");
        }
        if (!StringUtils.hasText(payload.getBuyerName())) {
            payload.setBuyerName(customer.getCustomerName());
        }
        if (payload.getGrossAmount() == null) {
            payload.setGrossAmount(BigDecimal.ZERO);
        }
        if (payload.getTaxAmount() == null) {
            payload.setTaxAmount(BigDecimal.ZERO);
        }
        R<Void> response = remoteOaService.createInvoice("true", "cloudflow-service-crm", payload);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成发票草稿失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean bindWorkspaceInvoice(Long customerId, Long invoiceId, RemoteOaService.InvoiceBindRequest request) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        RemoteOaService.InvoiceBindRequest payload = request == null ? new RemoteOaService.InvoiceBindRequest() : request;
        payload.setCustomerId(customerId);
        payload.setCustomerName(customer.getCustomerName());
        R<Void> response = remoteOaService.bindInvoice(invoiceId, payload);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "绑定发票失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean voidWorkspaceInvoice(Long customerId, Long invoiceId, String remark) {
        requireById(customerId, "客户不存在");
        RemoteOaService.InvoiceVoidRequest request = new RemoteOaService.InvoiceVoidRequest();
        request.setRemark(remark);
        R<Void> response = remoteOaService.voidInvoice(invoiceId, request);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "作废发票失败");
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmWorkspaceReceivable(Long customerId, Long receivableId) {
        CrmCustomer customer = requireById(customerId, "客户不存在");
        CrmReceivable receivable = requireReceivable(receivableId);
        if (!Objects.equals(receivable.getCustomerId(), customerId)) {
            throw new IllegalArgumentException("回款计划不属于当前客户");
        }
        receivable.setReceivedAmount(receivable.getPlannedAmount());
        receivable.setOutstandingAmount(BigDecimal.ZERO);
        receivable.setReceivedDate(receivable.getReceivedDate() == null ? LocalDate.now() : receivable.getReceivedDate());
        receivable.setStatus("RECEIVED");
        receivable.setUpdateBy(currentUserName());
        receivable.setUpdateTime(now());
        boolean updated = receivableMapper.updateById(receivable) > 0;
        if (updated) {
            refreshHealth(customer.getCustomerId());
        }
        return updated;
    }

    private void validate(CrmCustomer customer) {
        if (customer == null) {
            throw new IllegalArgumentException("客户不能为空");
        }
        if (!StringUtils.hasText(customer.getCustomerName())) {
            throw new IllegalArgumentException("客户名称不能为空");
        }
        if (!StringUtils.hasText(customer.getCustomerCode())) {
            customer.setCustomerCode(Localize.nextNo("KH"));
        }
        customer.setCustomerTags(normalizeTags(customer.getCustomerTags()));
        if (!StringUtils.hasText(customer.getHealthLevel())) {
            customer.setHealthLevel("GREEN");
        }
        if (!StringUtils.hasText(customer.getStatus())) {
            customer.setStatus("ACTIVE");
        }
    }

    private LocalDate resolveRenewalWindowDate(Long customerId) {
        return renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                        .eq(CrmRenewal::getCustomerId, customerId)
                        .eq(CrmRenewal::getDelFlag, "0"))
                .stream()
                .filter(item -> !"LOST".equalsIgnoreCase(item.getStatus()))
                .map(this::resolveRenewalDate)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
    }

    private LocalDate resolveRenewalDate(CrmRenewal renewal) {
        if (renewal == null) {
            return null;
        }
        if ("WON".equalsIgnoreCase(renewal.getStatus()) || "CLOSED".equalsIgnoreCase(renewal.getStatus())) {
            if (renewal.getNextExpireDate() != null) {
                return renewal.getNextExpireDate();
            }
        }
        if (renewal.getCurrentExpireDate() != null) {
            return renewal.getCurrentExpireDate();
        }
        if (renewal.getNextExpireDate() != null) {
            return renewal.getNextExpireDate();
        }
        return renewal.getExpectedSignDate();
    }

    private int resolveMaxOverdueDays(Long customerId, LocalDate today) {
        return (int) receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                        .eq(CrmReceivable::getCustomerId, customerId)
                        .eq(CrmReceivable::getDelFlag, "0"))
                .stream()
                .filter(item -> item.getDueDate() != null)
                .filter(item -> item.getOutstandingAmount() != null && item.getOutstandingAmount().signum() > 0)
                .filter(item -> item.getDueDate().isBefore(today))
                .mapToLong(item -> ChronoUnit.DAYS.between(item.getDueDate(), today))
                .max()
                .orElse(0L);
    }

    private boolean hasHighSeverityOpenTicket(Long customerId) {
        return serviceTicketMapper.selectCount(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDelFlag, "0")
                .in(CrmServiceTicket::getSeverity, "HIGH", "CRITICAL")
                .notIn(CrmServiceTicket::getStatus, "RESOLVED", "CLOSED")) > 0;
    }

    private String normalizeTags(String customerTags) {
        if (!StringUtils.hasText(customerTags)) {
            return null;
        }
        return java.util.Arrays.stream(customerTags.split("[,，]"))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .distinct()
                .reduce((left, right) -> left + "," + right)
                .orElse(null);
    }

    private List<CrmOpportunityBoardColumnVO> buildOpportunityBoard() {
        List<CrmOpportunity> opportunities = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDelFlag, "0")
                .orderByDesc(CrmOpportunity::getExpectedAmount)
                .orderByDesc(CrmOpportunity::getUpdateTime));
        Map<String, CrmOpportunityBoardColumnVO> columns = new LinkedHashMap<>();
        for (String stage : List.of("LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST")) {
            CrmOpportunityBoardColumnVO column = new CrmOpportunityBoardColumnVO();
            column.setStage(stage);
            column.setStageLabel(resolveStageLabel(stage));
            column.setCount(0);
            column.setTotalAmount(BigDecimal.ZERO);
            columns.put(stage, column);
        }
        LocalDate today = LocalDate.now();
        for (CrmOpportunity item : opportunities) {
            CrmOpportunityBoardColumnVO column = columns.computeIfAbsent(item.getStage(), stage -> {
                CrmOpportunityBoardColumnVO created = new CrmOpportunityBoardColumnVO();
                created.setStage(stage);
                created.setStageLabel(resolveStageLabel(stage));
                created.setCount(0);
                created.setTotalAmount(BigDecimal.ZERO);
                return created;
            });
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
            column.setTotalAmount(column.getTotalAmount().add(item.getExpectedAmount() == null ? BigDecimal.ZERO : item.getExpectedAmount()));
        }
        return new ArrayList<>(columns.values());
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
                .eq(CrmReceivable::getDelFlag, "0")
                .orderByAsc(CrmReceivable::getDueDate));
        Map<String, java.util.Set<Long>> customerCounter = new LinkedHashMap<>();
        for (String key : buckets.keySet()) {
            customerCounter.put(key, new java.util.HashSet<>());
        }

        for (CrmReceivable item : receivables) {
            if (item.getOutstandingAmount() == null || item.getOutstandingAmount().signum() <= 0) {
                continue;
            }
            String bucketCode = resolveAgingBucket(item.getDueDate(), today);
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

    private List<CrmHealthReasonItemVO> buildHealthReasons(Long customerId, CrmCustomer customer) {
        List<CrmHealthReasonItemVO> reasons = new ArrayList<>();
        LocalDate today = LocalDate.now();
        LocalDate renewalDate = resolveRenewalWindowDate(customerId);
        if (renewalDate != null) {
            long days = ChronoUnit.DAYS.between(today, renewalDate);
            if (days <= 90) {
                reasons.add(buildReason("RENEWAL", "RENEWAL_WINDOW", days <= 30 ? "30天内续约到期" : "90天内续约到期",
                        days <= 30 ? "RED" : "YELLOW", "/office/crm/customer/" + customerId + "?tab=renewal"));
            }
        }
        int overdueDays = resolveMaxOverdueDays(customerId, today);
        if (overdueDays > 0) {
            reasons.add(buildReason("RECEIVABLE", "RECEIVABLE_OVERDUE",
                    overdueDays > 30 ? "回款逾期超过30天" : "回款逾期未超过30天",
                    overdueDays > 30 ? "RED" : "YELLOW", "/office/crm/customer/" + customerId + "?tab=cashflow"));
        }
        if (hasHighSeverityOpenTicket(customerId)) {
            reasons.add(buildReason("TICKET", "HIGH_SEVERITY_OPEN", "存在高严重度未关闭工单", "RED",
                    "/office/crm/customer/" + customerId + "?tab=ticket"));
        }
        if (customer.getLastFollowUpTime() == null || ChronoUnit.DAYS.between(customer.getLastFollowUpTime().toLocalDate(), today) >= 30) {
            reasons.add(buildReason("FOLLOW_UP", "STALE_FOLLOW_UP", "30天未跟进", "YELLOW",
                    "/office/crm/customer/" + customerId + "?tab=follow-up"));
        }
        if (reasons.isEmpty()) {
            reasons.add(buildReason("HEALTH", "NORMAL", "状态正常", "GREEN", "/office/crm/customer/" + customerId));
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

    private String resolveStageLabel(String stage) {
        return switch (stage == null ? "" : stage) {
            case "LEAD" -> "线索";
            case "QUALIFIED" -> "已确认";
            case "PROPOSAL" -> "方案报价";
            case "NEGOTIATION" -> "商务谈判";
            case "WON" -> "赢单";
            case "LOST" -> "输单";
            default -> stage;
        };
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

    private String resolveAgingBucket(LocalDate dueDate, LocalDate today) {
        if (dueDate == null || !dueDate.isBefore(today)) {
            return "CURRENT";
        }
        long overdueDays = ChronoUnit.DAYS.between(dueDate, today);
        if (overdueDays <= 30) {
            return "DUE_30";
        }
        if (overdueDays <= 60) {
            return "DUE_60";
        }
        if (overdueDays <= 90) {
            return "DUE_90";
        }
        return "DUE_90_PLUS";
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
        } catch (Exception ignored) {
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
        } catch (Exception ignored) {
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
        } catch (Exception ignored) {
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
            } catch (Exception ignored) {
            }
        }
        return result;
    }

    private List<CrmWorkspaceTodoItemVO> buildCrossModuleTodos(CrmCustomer customer, CrmCustomerWorkspaceVO workspace) {
        List<CrmWorkspaceTodoItemVO> todos = new ArrayList<>();
        workspace.getQuotes().stream()
                .filter(item -> List.of("PENDING", "APPROVED", "SENT").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("quote-" + item.getQuoteId(), "CRM", "CRM 报价", item.getQuoteName(), "报价待继续推进", item.getStatus(), "/office/crm?tab=quote", item.getQuoteId(), "CRM_QUOTE")));
        workspace.getContracts().stream()
                .filter(item -> List.of("DRAFT", "PENDING", "APPROVED", "ACTIVE", "SEALING").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("contract-" + item.getContractId(), "OA", "OA 合同", item.getContractName(), "合同链路待继续推进", item.getStatus(), "/office/contracts", item.getContractId(), "CONTRACT")));
        workspace.getProjects().stream()
                .filter(item -> List.of("DRAFT", "PENDING", "APPROVED").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("project-" + item.getProjectId(), "OA", "OA 项目", item.getProjectName(), "项目草稿或立项待处理", item.getStatus(), "/office/project", item.getProjectId(), "PROJECT")));
        workspace.getBudgets().stream()
                .filter(item -> List.of("DRAFT", "PENDING", "APPROVED").contains(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("budget-" + item.getBudgetId(), "OA", "OA 预算", item.getBudgetName(), "预算草稿或审批待处理", item.getStatus(), "/office/budget", item.getBudgetId(), "BUDGET")));
        workspace.getReceivables().stream()
                .filter(item -> (item.getOutstandingAmount() != null && item.getOutstandingAmount().signum() > 0) || !"RECEIVED".equals(item.getStatus()))
                .limit(3)
                .forEach(item -> todos.add(todo("receivable-" + item.getReceivableId(), "CRM", "CRM 回款", item.getReceivableName(), "回款未完成或待确认", item.getStatus(), "/office/crm?tab=receivable", item.getReceivableId(), "CRM_RECEIVABLE")));
        return todos.stream().limit(8).toList();
    }

    private List<CrmWorkspaceRiskItemVO> buildCrossModuleRisks(CrmCustomer customer, CrmCustomerWorkspaceVO workspace) {
        List<CrmWorkspaceRiskItemVO> risks = new ArrayList<>();
        workspace.getHealthReasons().stream()
                .filter(item -> !"GREEN".equalsIgnoreCase(item.getLevel()))
                .forEach(item -> risks.add(risk(item.getCode(), "CRM", "客户健康", item.getName(), customer.getHealthReason(), item.getLevel(), "OPEN", "/office/crm/customer/" + customer.getCustomerId(), customer.getCustomerId(), "CRM_CUSTOMER")));
        workspace.getBudgets().stream()
                .filter(item -> List.of("WARN", "ALERT", "BLOCK").contains(item.getThresholdStatus()))
                .forEach(item -> risks.add(risk("budget-" + item.getBudgetId(), "OA", "预算阈值", item.getBudgetName(), "预算执行已进入阈值区间", item.getThresholdStatus(), item.getStatus(), "/office/budget", item.getBudgetId(), "BUDGET")));
        workspace.getInvoices().stream()
                .filter(item -> List.of("WRITEOFF_PARTIAL", "VOID").contains(item.getStatus()))
                .forEach(item -> risks.add(risk("invoice-" + item.getInvoiceId(), "OA", "发票异常", item.getInvoiceNo(), "发票部分核销或已作废", item.getStatus(), item.getStatus(), "/office/invoice", item.getInvoiceId(), "INVOICE")));
        workspace.getProjects().stream()
                .filter(item -> List.of("HIGH", "RED", "MEDIUM").contains(item.getRiskLevel()))
                .forEach(item -> risks.add(risk("project-" + item.getProjectId(), "OA", "项目风险", item.getProjectName(), "项目风险等级已抬高", item.getRiskLevel(), item.getStatus(), "/office/project", item.getProjectId(), "PROJECT")));
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
        list(new LambdaQueryWrapper<CrmCustomer>().eq(CrmCustomer::getDelFlag, "0").orderByDesc(CrmCustomer::getUpdateTime))
                .stream()
                .limit(8)
                .forEach(customer -> {
                    CrmCustomerWorkspaceVO workspace = getWorkspace(customer.getCustomerId());
                    todos.addAll(workspace.getCrossModuleTodos());
                });
        return todos.stream().limit(8).toList();
    }

    private List<CrmWorkspaceRiskItemVO> buildDashboardRisks() {
        List<CrmWorkspaceRiskItemVO> risks = new ArrayList<>();
        list(new LambdaQueryWrapper<CrmCustomer>().eq(CrmCustomer::getDelFlag, "0").orderByDesc(CrmCustomer::getUpdateTime))
                .stream()
                .limit(8)
                .forEach(customer -> {
                    CrmCustomerWorkspaceVO workspace = getWorkspace(customer.getCustomerId());
                    risks.addAll(workspace.getCrossModuleRisks());
                });
        return risks.stream().limit(8).toList();
    }

    private List<RemoteBudgetLinkVO> loadBudgetAlerts() {
        List<RemoteBudgetLinkVO> alerts = new ArrayList<>();
        list(new LambdaQueryWrapper<CrmCustomer>().eq(CrmCustomer::getDelFlag, "0").orderByDesc(CrmCustomer::getUpdateTime))
                .stream()
                .limit(8)
                .forEach(customer -> getWorkspace(customer.getCustomerId()).getBudgets().stream()
                        .filter(item -> List.of("WARN", "ALERT", "BLOCK").contains(item.getThresholdStatus()))
                        .forEach(alerts::add));
        return alerts.stream().limit(8).toList();
    }

    private List<RemoteInvoiceLinkVO> loadInvoiceExceptions() {
        List<RemoteInvoiceLinkVO> invoices = new ArrayList<>();
        list(new LambdaQueryWrapper<CrmCustomer>().eq(CrmCustomer::getDelFlag, "0").orderByDesc(CrmCustomer::getUpdateTime))
                .stream()
                .limit(8)
                .forEach(customer -> getWorkspace(customer.getCustomerId()).getInvoices().stream()
                        .filter(item -> List.of("BOUND", "WRITEOFF_PARTIAL", "VOID").contains(item.getStatus()))
                        .forEach(invoices::add));
        return invoices.stream().limit(8).toList();
    }

    private List<CrmWorkspaceActivityItemVO> buildDashboardActivities() {
        List<CrmWorkspaceActivityItemVO> activities = new ArrayList<>();
        quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                        .eq(CrmQuote::getDelFlag, "0")
                        .orderByDesc(CrmQuote::getUpdateTime))
                .stream()
                .limit(4)
                .forEach(item -> activities.add(activity(
                        "activity-quote-" + item.getQuoteId(),
                        "CRM",
                        "CRM 报价",
                        item.getQuoteName(),
                        "报价状态变更为 " + item.getStatus(),
                        item.getOwnerName(),
                        item.getUpdateTime() != null ? item.getUpdateTime() : item.getCreateTime(),
                        "/office/crm?tab=quote",
                        item.getQuoteId(),
                        "CRM_QUOTE"
                )));
        receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                        .eq(CrmReceivable::getDelFlag, "0")
                        .orderByDesc(CrmReceivable::getUpdateTime))
                .stream()
                .limit(4)
                .forEach(item -> activities.add(activity(
                        "activity-receivable-" + item.getReceivableId(),
                        "CRM",
                        "CRM 回款",
                        item.getReceivableName(),
                        "回款状态 " + item.getStatus() + "，发票状态 " + item.getInvoiceStatus(),
                        item.getOwnerName(),
                        item.getUpdateTime() != null ? item.getUpdateTime() : item.getCreateTime(),
                        "/office/crm?tab=receivable",
                        item.getReceivableId(),
                        "CRM_RECEIVABLE"
                )));
        return activities.stream()
                .sorted(Comparator.comparing(CrmWorkspaceActivityItemVO::getEventTime, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(8)
                .toList();
    }

    private CrmWorkspaceTodoItemVO todo(String id, String module, String sourceLabel, String title, String description, String status, String path, Long businessId, String businessType) {
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

    private CrmWorkspaceRiskItemVO risk(String id, String module, String sourceLabel, String title, String description, String level, String status, String path, Long businessId, String businessType) {
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

    private CrmWorkspaceActivityItemVO activity(String id, String module, String sourceLabel, String title, String content,
                                                String operatorName, LocalDateTime eventTime, String path, Long businessId, String businessType) {
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

    private CrmReceivable requireReceivable(Long receivableId) {
        CrmReceivable receivable = receivableMapper.selectById(receivableId);
        if (receivable == null || !"0".equals(receivable.getDelFlag())) {
            throw new IllegalArgumentException("回款计划不存在");
        }
        return receivable;
    }

    private int resolveStageStayDays(CrmOpportunity opportunity) {
        LocalDate date = opportunity.getStageChangedTime() != null ? opportunity.getStageChangedTime().toLocalDate()
                : opportunity.getUpdateTime() != null ? opportunity.getUpdateTime().toLocalDate()
                : opportunity.getCreateTime() != null ? opportunity.getCreateTime().toLocalDate() : LocalDate.now();
        return (int) ChronoUnit.DAYS.between(date, LocalDate.now());
    }

    private void enrichRenewalRisk(CrmRenewal renewal) {
        if (renewal == null) {
            return;
        }
        String status = renewal.getStatus();
        if ("WON".equalsIgnoreCase(status) || "CLOSED".equalsIgnoreCase(status)) {
            renewal.setRiskLevel("LOW");
            renewal.setRiskReason("续约已完成");
            return;
        }
        if ("LOST".equalsIgnoreCase(status)) {
            renewal.setRiskLevel("HIGH");
            renewal.setRiskReason("续约已丢单");
            return;
        }
        LocalDate today = LocalDate.now();
        if (renewal.getCurrentExpireDate() != null) {
            long daysToExpire = ChronoUnit.DAYS.between(today, renewal.getCurrentExpireDate());
            if (daysToExpire < 0) {
                renewal.setRiskLevel("HIGH");
                renewal.setRiskReason("当前合同已到期");
                return;
            }
            if (daysToExpire <= 30) {
                renewal.setRiskLevel("HIGH");
                renewal.setRiskReason("30天内合同到期");
                return;
            }
            if (daysToExpire <= 90) {
                renewal.setRiskLevel("MEDIUM");
                renewal.setRiskReason("90天内合同到期");
                return;
            }
        }
        if (renewal.getExpectedSignDate() != null && renewal.getExpectedSignDate().isBefore(today)) {
            renewal.setRiskLevel("MEDIUM");
            renewal.setRiskReason("预计签约日期已逾期");
            return;
        }
        renewal.setRiskLevel("LOW");
        renewal.setRiskReason("续约节奏正常");
    }
}
