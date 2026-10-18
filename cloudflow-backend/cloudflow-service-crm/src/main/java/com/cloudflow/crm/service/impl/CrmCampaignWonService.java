package com.cloudflow.crm.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmCampaignWonService {
    private final CrmCampaignMapper campaigns;
    private final SysConfigHelper configuration;

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmCampaign lock(CrmOpportunity opportunity) {
        if (opportunity.getCampaignId() == null) return null;
        CrmCampaign campaign = CrmRecordSupport.require(campaigns.lockById(opportunity.getCampaignId()), "关联营销活动不存在，请先核对");
        if (!Objects.equals(campaign.getTenantId(), opportunity.getTenantId())) throw new CrmBusinessException("营销活动租户不一致");
        return campaign;
    }

    @Audit(name = "同步商机赢单数量至营销归因")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void refresh(CrmCampaign campaign, CrmOpportunity opportunity) {
        if (!Objects.equals(campaign == null ? null : campaign.getCampaignId(), opportunity.getCampaignId()))
            throw new CrmBusinessException("商机关联活动已改变，请重新读取后提交");
        if (campaign == null) return;
        int days = configuration.getConfigInt("crm.campaign.attribution.window.days", 30);
        if (days < 0 || days > 3650) throw new CrmBusinessException("营销归因窗口须为0至3650天");
        if (campaign.getStartDate() == null || campaign.getEndDate() == null) throw new CrmBusinessException("营销活动日期缺失，请先核对");
        LocalDateTime start = campaign.getStartDate().atStartOfDay();
        LocalDateTime end = campaign.getEndDate().plusDays(days + 1L).atStartOfDay();
        CrmRecordSupport.saved(campaigns.refreshWonCount(campaign.getCampaignId(), campaign.getTenantId(), start, end,
                campaign.getVersion(), CrmRecordSupport.userName(), LocalDateTime.now()));
    }
}
