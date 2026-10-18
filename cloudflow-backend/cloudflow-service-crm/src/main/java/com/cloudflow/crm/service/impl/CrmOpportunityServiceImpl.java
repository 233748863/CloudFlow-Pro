package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardCardVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmOpportunityService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityAccessService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityStagePolicy;
import com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService;
import com.cloudflow.crm.service.opportunity.CrmSalesStageService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmOpportunityServiceImpl extends CrmServiceSupport<CrmOpportunityMapper, CrmOpportunity>
        implements ICrmOpportunityService {

    private static final String SCOPE_DEPT_COLUMN = "scope_dept_id";
    private static final String SCOPE_OWNER_COLUMN = "scope_owner_id";

    private final ICrmCustomerService crmCustomerService;
    private final CrmQuoteMapper quoteMapper;
    private final RemoteOaService remoteOaService;
    private final CrmEventPublisher crmEventPublisher;
    private final CrmCreditService creditService;
    private final CrmReferenceService references;
    private final CrmOpportunityAccessService access;
    private final CrmOpportunityWriteService writes;
    private final CrmSalesStageService stages;

    @Override
    public PageResult<CrmOpportunity> queryPage(CrmOpportunity query, PageQuery pageQuery) {
        Page<CrmOpportunity> result = baseMapper.selectPageByDataScope(
                pageQuery.build(),
                query,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN));
        result.getRecords().forEach(this::correctDuration);
        return PageResult.build(result);
    }

    @Override
    public CrmOpportunity getAccessibleOpportunity(Long opportunityId) {
        CrmOpportunity opportunity = access.read(opportunityId);
        correctDuration(opportunity);
        return opportunity;
    }

    @Override
    public boolean createOpportunity(CrmOpportunity opportunity) {
        CrmRecordSupport.require(opportunity, "商机不能为空");
        CrmOpportunity saved = writes.create(opportunity, owner(opportunity.getOwnerId() == null ? UserContext.getUserId() : opportunity.getOwnerId()));
        org.springframework.beans.BeanUtils.copyProperties(saved, opportunity);
        return true;
    }

    @Override
    @Audit(name = "更新商机")
    public boolean updateOpportunity(CrmOpportunity opportunity) {
        if (opportunity == null || opportunity.getOpportunityId() == null) {
            throw new IllegalArgumentException("商机ID不能为空");
        }
        CrmOpportunity persisted = getAccessibleOpportunity(opportunity.getOpportunityId());
        DataScopeUtils.assertOwnership(persisted, CrmOpportunity::getOwnerId, "商机");
        CrmOpportunityStagePolicy.version(opportunity.getVersion(), persisted);
        writes.update(opportunity, owner(opportunity.getOwnerId() == null ? persisted.getOwnerId() : opportunity.getOwnerId()));
        return true;
    }

    @Override
    public CrmOpportunity previewImport(CrmOpportunity opportunity) {
        CrmRecordSupport.require(opportunity, "商机不能为空");
        Long ownerId = opportunity.getOwnerId();
        if (ownerId == null) {
            ownerId = opportunity.getOpportunityId() == null ? UserContext.getUserId()
                    : getAccessibleOpportunity(opportunity.getOpportunityId()).getOwnerId();
        }
        return writes.previewImport(opportunity, owner(ownerId));
    }

    @Override
    public boolean winOpportunity(Long opportunityId, Long competitorId, Integer version) {
        CrmOpportunity opportunity = getAccessibleOpportunity(opportunityId);
        DataScopeUtils.assertOwnership(opportunity, CrmOpportunity::getOwnerId, "商机");
        CrmOpportunityStagePolicy.version(version, opportunity);
        if (CrmConstants.OpportunityStage.WON.equals(opportunity.getStage())) return true;
        if (CrmConstants.OpportunityStage.LOST.equals(opportunity.getStage())) throw new IllegalArgumentException("已输单商机不能直接赢单");
        CrmQuote acceptedQuote = findAcceptedQuote(opportunityId);
        if (acceptedQuote == null || acceptedQuote.getContractId() == null) {
            RemoteOaService.ContractDraftRequest draft = buildContractDraftRequest(opportunity, acceptedQuote);
            creditService.check(opportunity.getCustomerId(), draft.getAmount(), draft.getCurrency(), "CRM_OPPORTUNITY_CONTRACT", opportunityId);
        }
        CrmOpportunity won = writes.win(opportunityId, competitorId, version);
        Long contractId = ensureContractDraft(won);
        publishOpportunityWon(won, contractId);
        crmCustomerService.refreshHealth(won.getCustomerId());
        return true;
    }

    /**
     * 赢单后确保有合同草稿：优先复用已接受报价的 contractId；
     * 否则基于商机直接落合同草稿，返回合同 ID。
     * 合同真正审批通过后由 3.2 的事件触发后续项目/预算。
     */
    private Long ensureContractDraft(CrmOpportunity opportunity) {
        try {
            CrmQuote existingQuote = findAcceptedQuote(opportunity.getOpportunityId());
            if (existingQuote != null && existingQuote.getContractId() != null) {
                return existingQuote.getContractId();
            }
            RemoteOaService.ContractDraftRequest request = buildContractDraftRequest(opportunity, existingQuote);
            R<Long> response = remoteOaService.createContract("true", CrmConstants.SERVICE_NAME, request);
            if (response == null || !response.isSuccess() || response.getData() == null) {
                log.warn("商机赢单自动建合同失败: opportunityId={}, msg={}",
                        opportunity.getOpportunityId(),
                        response != null ? response.getMsg() : "no response");
                return null;
            }
            Long contractId = response.getData();
            if (existingQuote != null) {
                LambdaUpdateWrapper<CrmQuote> wrapper = new LambdaUpdateWrapper<CrmQuote>()
                        .eq(CrmQuote::getQuoteId, existingQuote.getQuoteId())
                        .set(CrmQuote::getContractId, contractId)
                        .set(CrmQuote::getUpdateBy, currentUserName())
                        .set(CrmQuote::getUpdateTime, now());
                quoteMapper.update(null, wrapper);
            }
            return contractId;
        } catch (Exception ex) {
            log.warn("商机赢单自动建合同异常: opportunityId={}", opportunity.getOpportunityId(), ex);
            return null;
        }
    }

    private CrmQuote findAcceptedQuote(Long opportunityId) {
        List<CrmQuote> quotes = quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmQuote::getOpportunityId, opportunityId)
                .in(CrmQuote::getStatus,
                        CrmConstants.QuoteStatus.ACCEPTED,
                        CrmConstants.QuoteStatus.APPROVED,
                        CrmConstants.QuoteStatus.SENT)
                .orderByDesc(CrmQuote::getUpdateTime));
        return quotes.isEmpty() ? null : quotes.get(0);
    }

    private RemoteOaService.ContractDraftRequest buildContractDraftRequest(CrmOpportunity opportunity, CrmQuote quote) {
        RemoteOaService.ContractDraftRequest request = new RemoteOaService.ContractDraftRequest();
        request.setContractName(StringUtils.hasText(quote != null ? quote.getQuoteName() : null)
                ? quote.getQuoteName()
                : opportunity.getOpportunityName() + " 合同");
        request.setCounterpartyName(opportunity.getCustomerName());
        request.setContractType("SALES");
        request.setAmount(quote != null && quote.getTotalAmount() != null
                ? quote.getTotalAmount()
                : opportunity.getExpectedAmount() == null ? BigDecimal.ZERO : opportunity.getExpectedAmount());
        request.setCurrency(StringUtils.hasText(quote != null ? quote.getCurrency() : null)
                ? quote.getCurrency()
                : "CNY");
        request.setOwnerId(opportunity.getOwnerId());
        request.setOwnerName(opportunity.getOwnerName());
        request.setDeptId(opportunity.getDeptId());
        request.setDeptName(opportunity.getDeptName());
        request.setCustomerId(opportunity.getCustomerId());
        request.setCustomerName(opportunity.getCustomerName());
        if (quote != null && quote.getQuoteId() != null) {
            request.setSourceType("CRM_QUOTE");
            request.setSourceId(quote.getQuoteId());
            request.setSourceVersion(quote.getVersion());
            request.setOpportunityVersion(opportunity.getVersion());
            request.setRemark("由 CRM 报价 " + quote.getQuoteNo() + " / 商机赢单 #" + opportunity.getOpportunityId() + " 自动生成");
        } else {
            request.setSourceType("CRM_OPPORTUNITY");
            request.setSourceId(opportunity.getOpportunityId());
            request.setSourceVersion(opportunity.getVersion());
            request.setRemark("由 CRM 商机赢单 #" + opportunity.getOpportunityId() + " 自动生成");
        }
        return request;
    }

    private void publishOpportunityWon(CrmOpportunity opportunity, Long contractId) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("opportunityId", opportunity.getOpportunityId());
        fields.put("opportunityName", opportunity.getOpportunityName());
        fields.put("customerId", opportunity.getCustomerId());
        fields.put("customerName", opportunity.getCustomerName());
        fields.put("ownerId", opportunity.getOwnerId());
        fields.put("ownerName", opportunity.getOwnerName());
        fields.put("deptId", opportunity.getDeptId());
        fields.put("expectedAmount", opportunity.getExpectedAmount());
        fields.put("contractId", contractId);
        crmEventPublisher.publish(CrmEventStreamConstants.EVENT_OPPORTUNITY_WON,
                opportunity.getTenantId(), fields);
    }

    @Override
    public boolean loseOpportunity(Long opportunityId, String lostReason) {
        throw new IllegalArgumentException("输单必须选择结构化原因并提交关闭审批");
    }

    @Override
    public Long createProjectDraft(Long opportunityId) {
        CrmOpportunity opportunity = getAccessibleOpportunity(opportunityId);
        RemoteOaService.ProjectDraftRequest request = new RemoteOaService.ProjectDraftRequest();
        request.setProjectName(opportunity.getOpportunityName());
        request.setProjectType("DELIVERY");
        request.setCustomerId(opportunity.getCustomerId());
        request.setCustomerName(opportunity.getCustomerName());
        request.setOwnerId(opportunity.getOwnerId());
        request.setOwnerName(opportunity.getOwnerName());
        request.setDeptId(opportunity.getDeptId());
        request.setDeptName(opportunity.getDeptName());
        request.setBudgetAmount(opportunity.getExpectedAmount());
        request.setPriority("MEDIUM");
        request.setStatus("DRAFT");
        request.setRiskLevel(CrmConstants.RiskLevel.LOW);
        request.setSourceType("CRM_OPPORTUNITY");
        request.setSourceId(opportunityId);
        request.setSourceName(opportunity.getOpportunityName());
        request.setRemark("由CRM商机赢单生成");

        R<Long> response = remoteOaService.createProject("true", "cloudflow-service-crm", request);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成项目草稿失败");
        }
        if (response.getData() == null) {
            throw new IllegalArgumentException("OA 项目草稿返回ID为空");
        }
        return response.getData();
    }

    @Override
    public List<CrmOpportunityBoardColumnVO> getBoard() {
        List<CrmOpportunity> opportunities = baseMapper.selectPageByDataScope(
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, Long.MAX_VALUE),
                new CrmOpportunity(),
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN)).getRecords();
        Map<String, CrmOpportunityBoardColumnVO> columns = new LinkedHashMap<>();
        for (CrmSalesStage rule : stages.list()) {
            String stage = rule.getStageCode();
            CrmOpportunityBoardColumnVO column = new CrmOpportunityBoardColumnVO();
            column.setStage(stage);
            column.setStageLabel(rule.getStageName());
            column.setSortNo(rule.getSortNo());
            column.setEnabled("ACTIVE".equals(rule.getStatus()));
            column.setAllowSkipFlag(rule.getAllowSkipFlag());
            column.setOverdueDays(rule.getOverdueDays());
            column.setCount(0);
            column.setTotalAmount(BigDecimal.ZERO);
            columns.put(stage, column);
        }
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
            card.setVersion(item.getVersion());
            card.setWeightedAmount(item.getWeightedAmount());
            card.setOwnerName(item.getOwnerName());
            card.setExpectedSignDate(item.getExpectedSignDate() == null ? null : String.valueOf(item.getExpectedSignDate()));
            correctDuration(item);
            card.setStageStayDays(item.getStageChangedTime() == null ? null : item.getStageDurationDays());
            column.getItems().add(card);
            column.setCount(column.getCount() + 1);
            column.setTotalAmount(column.getTotalAmount().add(item.getExpectedAmount() == null ? BigDecimal.ZERO : item.getExpectedAmount()));
        }
        return new ArrayList<>(columns.values());
    }

    @Override
    @Audit(name = "更新商机阶段")
    public boolean updateStage(Long opportunityId, String stage, Integer version) {
        writes.advance(opportunityId, stage, version);
        return true;
    }

    private CrmOpportunityWriteService.Owner owner(Long userId) {
        CrmRecordSupport.require(userId, "商机负责人不能为空");
        HrEmployeeSummaryVO employee = references.user(userId);
        if (!Objects.equals(userId, employee.getUserId())) throw new IllegalArgumentException("商机负责人校验失败");
        return new CrmOpportunityWriteService.Owner(userId, employee.getEmployeeName(), employee.getDeptId(), employee.getDeptName());
    }

    private void correctDuration(CrmOpportunity opportunity) {
        if (opportunity.getStageChangedTime() != null) {
            long elapsed = ChronoUnit.SECONDS.between(opportunity.getStageChangedTime(), now());
            opportunity.setStageDurationDays(Math.toIntExact(Math.max(0, elapsed) / 86400));
        }
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
}
