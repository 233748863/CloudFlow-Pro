package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardCardVO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmOpportunityService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmOpportunityServiceImpl extends CrmServiceSupport<CrmOpportunityMapper, CrmOpportunity>
        implements ICrmOpportunityService {

    private final ICrmCustomerService customerService;
    private final CrmQuoteMapper quoteMapper;
    private final RemoteOaService remoteOaService;
    private final CrmEventPublisher crmEventPublisher;

    @Override
    public PageResult<CrmOpportunity> queryPage(CrmOpportunity query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmOpportunity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmOpportunity::getDelFlag, "0").orderByDesc(CrmOpportunity::getUpdateTime);
        eqIfPresent(wrapper, CrmOpportunity::getCustomerId, query.getCustomerId());
        likeIfPresent(wrapper, CrmOpportunity::getOpportunityName, query.getOpportunityName());
        eqIfPresent(wrapper, CrmOpportunity::getStage, query.getStage());
        eqIfPresent(wrapper, CrmOpportunity::getOwnerId, query.getOwnerId());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createOpportunity(CrmOpportunity opportunity) {
        fillCustomerSnapshot(opportunity);
        validate(opportunity);
        if (opportunity.getOwnerId() == null) {
            opportunity.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(opportunity.getOwnerName())) {
            opportunity.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(opportunity, currentTenantId(), currentUserName(), now());
        return save(opportunity);
    }

    @Override
    public boolean updateOpportunity(CrmOpportunity opportunity) {
        if (opportunity == null || opportunity.getOpportunityId() == null) {
            throw new IllegalArgumentException("商机ID不能为空");
        }
        fillCustomerSnapshot(opportunity);
        validate(opportunity);
        CrmOpportunity persisted = requireById(opportunity.getOpportunityId(), "商机不存在");
        opportunity.setTenantId(persisted.getTenantId());
        opportunity.setOwnerId(opportunity.getOwnerId() == null ? persisted.getOwnerId() : opportunity.getOwnerId());
        opportunity.setOwnerName(StringUtils.hasText(opportunity.getOwnerName()) ? opportunity.getOwnerName() : persisted.getOwnerName());
        opportunity.setUpdateBy(currentUserName());
        opportunity.setUpdateTime(now());
        return updateById(opportunity);
    }

    @Override
    public boolean winOpportunity(Long opportunityId) {
        CrmOpportunity opportunity = requireById(opportunityId, "商机不存在");
        opportunity.setStage(CrmConstants.OpportunityStage.WON);
        opportunity.setStatus(CrmConstants.OpportunityStatus.CLOSED);
        opportunity.setStageChangedTime(now());
        opportunity.setUpdateBy(currentUserName());
        opportunity.setUpdateTime(now());
        boolean updated = updateById(opportunity);
        if (updated) {
            Long contractId = ensureContractDraft(opportunity);
            publishOpportunityWon(opportunity, contractId);
            customerService.refreshHealth(opportunity.getCustomerId());
        }
        return updated;
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
            RemoteOaService.ContractDraftRequest request = buildContractDraftRequest(opportunity);
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
                .eq(CrmQuote::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .eq(CrmQuote::getOpportunityId, opportunityId)
                .in(CrmQuote::getStatus,
                        CrmConstants.QuoteStatus.ACCEPTED,
                        CrmConstants.QuoteStatus.APPROVED,
                        CrmConstants.QuoteStatus.SENT)
                .orderByDesc(CrmQuote::getUpdateTime));
        return quotes.isEmpty() ? null : quotes.get(0);
    }

    private RemoteOaService.ContractDraftRequest buildContractDraftRequest(CrmOpportunity opportunity) {
        RemoteOaService.ContractDraftRequest request = new RemoteOaService.ContractDraftRequest();
        request.setContractName(opportunity.getOpportunityName() + " 合同");
        request.setCounterpartyName(opportunity.getCustomerName());
        request.setContractType("SALES");
        request.setAmount(opportunity.getExpectedAmount() == null ? BigDecimal.ZERO : opportunity.getExpectedAmount());
        request.setCurrency("CNY");
        request.setOwnerId(opportunity.getOwnerId());
        request.setOwnerName(opportunity.getOwnerName());
        request.setDeptId(opportunity.getDeptId());
        request.setDeptName(opportunity.getDeptName());
        request.setCustomerId(opportunity.getCustomerId());
        request.setCustomerName(opportunity.getCustomerName());
        request.setSourceType("CRM_OPPORTUNITY");
        request.setSourceId(opportunity.getOpportunityId());
        request.setRemark("由 CRM 商机赢单 #" + opportunity.getOpportunityId() + " 自动生成");
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
        CrmOpportunity opportunity = requireById(opportunityId, "商机不存在");
        opportunity.setStage(CrmConstants.OpportunityStage.LOST);
        opportunity.setStatus(CrmConstants.OpportunityStatus.CLOSED);
        opportunity.setLostReason(StringUtils.hasText(lostReason) ? lostReason : opportunity.getLostReason());
        opportunity.setUpdateBy(currentUserName());
        opportunity.setUpdateTime(now());
        boolean updated = updateById(opportunity);
        if (updated) {
            customerService.refreshHealth(opportunity.getCustomerId());
        }
        return updated;
    }

    @Override
    public Long createProjectDraft(Long opportunityId) {
        CrmOpportunity opportunity = requireById(opportunityId, "商机不存在");
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
        List<CrmOpportunity> opportunities = list(new LambdaQueryWrapper<CrmOpportunity>()
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

    @Override
    public boolean updateStage(Long opportunityId, String stage, String lostReason) {
        if (opportunityId == null) {
            throw new IllegalArgumentException("商机ID不能为空");
        }
        if (!StringUtils.hasText(stage)) {
            throw new IllegalArgumentException("商机阶段不能为空");
        }
        if ("LOST".equalsIgnoreCase(stage)) {
            return loseOpportunity(opportunityId, lostReason);
        }
        if ("WON".equalsIgnoreCase(stage)) {
            return winOpportunity(opportunityId);
        }
        CrmOpportunity opportunity = requireById(opportunityId, "商机不存在");
        opportunity.setStage(stage);
        opportunity.setStatus(CrmConstants.OpportunityStatus.OPEN);
        opportunity.setStageChangedTime(now());
        opportunity.setUpdateBy(currentUserName());
        opportunity.setUpdateTime(now());
        return updateById(opportunity);
    }

    private void validate(CrmOpportunity opportunity) {
        if (opportunity == null) {
            throw new IllegalArgumentException("商机不能为空");
        }
        if (opportunity.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(opportunity.getOpportunityName())) {
            throw new IllegalArgumentException("商机名称不能为空");
        }
        if (opportunity.getExpectedAmount() == null) {
            opportunity.setExpectedAmount(BigDecimal.ZERO);
        }
        if (opportunity.getWinRate() == null) {
            opportunity.setWinRate(BigDecimal.ZERO);
        }
        if (!StringUtils.hasText(opportunity.getStage())) {
            opportunity.setStage(CrmConstants.OpportunityStage.LEAD);
        }
        if (!StringUtils.hasText(opportunity.getStatus())) {
            opportunity.setStatus(CrmConstants.OpportunityStatus.OPEN);
        }
        if (opportunity.getStageChangedTime() == null) {
            opportunity.setStageChangedTime(now());
        }
    }

    private void fillCustomerSnapshot(CrmOpportunity opportunity) {
        if (opportunity == null || opportunity.getCustomerId() == null) {
            return;
        }
        CrmCustomer customer = customerService.getById(opportunity.getCustomerId());
        if (customer != null && "0".equals(customer.getDelFlag())) {
            opportunity.setCustomerName(customer.getCustomerName());
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
