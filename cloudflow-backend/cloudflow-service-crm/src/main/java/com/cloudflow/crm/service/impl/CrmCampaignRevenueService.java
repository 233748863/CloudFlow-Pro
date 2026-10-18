package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.remote.CrmContractOriginClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmCampaignRevenueService {
    private final CrmCampaignMapper campaigns;
    private final CrmLeadMapper leads;
    private final CrmOpportunityMapper opportunities;
    private final CrmQuoteMapper quotes;
    private final CrmReceivableMapper receivables;
    private final CrmContractOriginClient contracts;
    private final SysConfigHelper configuration;
    private final TransactionTemplate transactions;

    @Audit(name = "重算营销活动归因")
    @Transactional(rollbackFor = Exception.class)
    public CrmCampaign recalculate(Long id) {
        CrmCampaign campaign = CrmRecordSupport.require(campaigns.lockById(id), "营销活动不存在");
        int windowDays = configuration.getConfigInt("crm.campaign.attribution.window.days", 30);
        if (windowDays < 0 || windowDays > 3650) throw new CrmBusinessException("营销归因窗口须为0至3650天");
        LocalDateTime from = campaign.getStartDate().atStartOfDay();
        LocalDateTime endExclusive = campaign.getEndDate().plusDays(windowDays + 1L).atStartOfDay();
        List<CrmLead> campaignLeads = leads.selectList(new LambdaQueryWrapper<CrmLead>().eq(CrmLead::getCampaignId, id).eq(CrmLead::getDeleted, 0)
                .ge(CrmLead::getCreateTime, from).lt(CrmLead::getCreateTime, endExclusive));
        Set<Long> customerIds = campaignLeads.stream().map(CrmLead::getConvertedCustomerId).filter(Objects::nonNull).collect(Collectors.toSet());
        List<CrmOpportunity> attributed = customerIds.isEmpty() ? List.of() : opportunities.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getCampaignId, id).eq(CrmOpportunity::getDeleted, 0).in(CrmOpportunity::getCustomerId, customerIds));
        Map<Long, CrmOpportunity> won = attributed.stream().filter(opportunity -> "WON".equals(opportunity.getStage()))
                .collect(Collectors.toMap(CrmOpportunity::getOpportunityId, Function.identity()));
        BigDecimal revenue = received(won);
        CrmRecordSupport.money(revenue, "活动归因收入");
        BigDecimal roi = roi(revenue, campaign.getActualCost());
        CrmRecordSupport.saved(campaigns.update(null, new LambdaUpdateWrapper<CrmCampaign>().eq(CrmCampaign::getCampaignId, id)
                .eq(CrmCampaign::getVersion, campaign.getVersion()).set(CrmCampaign::getLeadCreatedCount, campaignLeads.size())
                .set(CrmCampaign::getOpportunityCreatedCount, attributed.size()).set(CrmCampaign::getWonOpportunityCount, won.size())
                .set(CrmCampaign::getRevenue, revenue).set(CrmCampaign::getRoi, roi).set(CrmCampaign::getVersion, campaign.getVersion() + 1)
                .set(CrmCampaign::getUpdateBy, CrmRecordSupport.userName()).set(CrmCampaign::getUpdateTime, LocalDateTime.now())));
        return campaigns.selectById(id);
    }

    private BigDecimal received(Map<Long, CrmOpportunity> won) {
        if (won.isEmpty()) return BigDecimal.ZERO;
        Set<Long> customerIds = won.values().stream().map(CrmOpportunity::getCustomerId).collect(Collectors.toSet());
        List<CrmReceivable> rows = receivables.selectList(new LambdaQueryWrapper<CrmReceivable>().eq(CrmReceivable::getDeleted, 0)
                .in(CrmReceivable::getCustomerId, customerIds).notIn(CrmReceivable::getStatus, "CANCELLED", "CLOSED")
                .isNotNull(CrmReceivable::getContractId).gt(CrmReceivable::getReceivedAmount, BigDecimal.ZERO));
        if (rows.isEmpty()) return BigDecimal.ZERO;
        List<CrmQuote> linkedQuotes = quotes.selectList(new LambdaQueryWrapper<CrmQuote>().eq(CrmQuote::getDeleted, 0).in(CrmQuote::getOpportunityId, won.keySet()));
        Set<Long> quoteIds = linkedQuotes.stream().map(CrmQuote::getQuoteId).collect(Collectors.toSet());
        Set<Long> quoteContractIds = linkedQuotes.stream().map(CrmQuote::getContractId).filter(Objects::nonNull).collect(Collectors.toSet());
        List<Long> ids = rows.stream().map(CrmReceivable::getContractId).distinct().toList();
        Map<Long, CrmContractOriginClient.Origin> origins = new HashMap<>();
        for (int offset = 0; offset < ids.size(); offset += 500) {
            R<List<CrmContractOriginClient.Origin>> response = contracts.origins(ids.subList(offset, Math.min(offset + 500, ids.size())));
            if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("合同来源查询失败，本次归因未覆盖历史结果");
            response.getData().forEach(origin -> origins.put(origin.contractId(), origin));
        }
        BigDecimal revenue = BigDecimal.ZERO;
        Set<Long> seenReceivables = new HashSet<>();
        for (CrmReceivable row : rows) {
            CrmContractOriginClient.Origin origin = origins.get(row.getContractId());
            if (origin == null || !Objects.equals(origin.customerId(), row.getCustomerId()) || Set.of("CANCELLED", "VOIDED").contains(origin.status())) continue;
            boolean attributed = "CRM_OPPORTUNITY".equals(origin.sourceType()) && won.containsKey(origin.sourceId())
                    || "CRM_QUOTE".equals(origin.sourceType()) && quoteIds.contains(origin.sourceId()) || quoteContractIds.contains(origin.contractId());
            if (!attributed || !seenReceivables.add(row.getReceivableId())) continue;
            if (origin.currency() != null && !"CNY".equals(origin.currency())) throw new CrmBusinessException("活动归因仅支持人民币，合同" + origin.contractId() + "为" + origin.currency() + "，未进行混币汇总");
            revenue = revenue.add(row.getReceivedAmount());
        }
        return revenue;
    }

    public static BigDecimal roi(BigDecimal revenue, BigDecimal actualCost) {
        return actualCost == null || actualCost.signum() == 0 ? null : revenue.subtract(actualCost).divide(actualCost, 4, RoundingMode.HALF_UP);
    }

    public int recalculateAll() {
        List<CrmCampaign> rows = campaigns.selectList(new LambdaQueryWrapper<CrmCampaign>().eq(CrmCampaign::getDeleted, 0).ne(CrmCampaign::getStatus, "CANCELLED"));
        List<Long> failed = new ArrayList<>();
        for (CrmCampaign campaign : rows) {
            try { transactions.execute(status -> recalculate(campaign.getCampaignId())); }
            catch (Exception exception) { failed.add(campaign.getCampaignId()); log.error("营销归因重算失败: campaignId={}", campaign.getCampaignId(), exception); }
        }
        if (!failed.isEmpty()) throw new IllegalStateException("营销归因失败活动：" + failed);
        return rows.size();
    }
}
