package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmFollowUpService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class CrmFollowUpServiceImpl extends CrmServiceSupport<CrmFollowUpMapper, CrmFollowUp>
        implements ICrmFollowUpService {

    private final ICrmCustomerService customerService;
    private final CrmOpportunityMapper opportunityMapper;

    @Override
    public PageResult<CrmFollowUp> queryPage(CrmFollowUp query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmFollowUp> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmFollowUp::getDelFlag, "0").orderByDesc(CrmFollowUp::getFollowUpTime);
        eqIfPresent(wrapper, CrmFollowUp::getCustomerId, query.getCustomerId());
        eqIfPresent(wrapper, CrmFollowUp::getOpportunityId, query.getOpportunityId());
        eqIfPresent(wrapper, CrmFollowUp::getOwnerId, query.getOwnerId());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createFollowUp(CrmFollowUp followUp) {
        validate(followUp);
        if (followUp.getOwnerId() == null) {
            followUp.setOwnerId(com.cloudflow.common.core.context.UserContext.getUserId());
        }
        if (!StringUtils.hasText(followUp.getOwnerName())) {
            followUp.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(followUp, currentTenantId(), currentUserName(), now());
        boolean saved = save(followUp);
        if (saved) {
            syncOpportunityFollowUpTime(followUp);
            customerService.refreshHealth(followUp.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateFollowUp(CrmFollowUp followUp) {
        if (followUp == null || followUp.getFollowUpId() == null) {
            throw new IllegalArgumentException("跟进ID不能为空");
        }
        validate(followUp);
        CrmFollowUp persisted = requireById(followUp.getFollowUpId(), "跟进记录不存在");
        followUp.setTenantId(persisted.getTenantId());
        followUp.setUpdateBy(currentUserName());
        followUp.setUpdateTime(now());
        boolean updated = updateById(followUp);
        if (updated) {
            syncOpportunityFollowUpTime(followUp);
            customerService.refreshHealth(followUp.getCustomerId());
        }
        return updated;
    }

    private void validate(CrmFollowUp followUp) {
        if (followUp == null) {
            throw new IllegalArgumentException("跟进记录不能为空");
        }
        if (followUp.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (followUp.getFollowUpTime() == null) {
            followUp.setFollowUpTime(now());
        }
        if (!StringUtils.hasText(followUp.getContent())) {
            throw new IllegalArgumentException("跟进内容不能为空");
        }
    }

    private void syncOpportunityFollowUpTime(CrmFollowUp followUp) {
        if (followUp == null || followUp.getOpportunityId() == null || followUp.getFollowUpTime() == null) {
            return;
        }
        CrmOpportunity opportunity = opportunityMapper.selectById(followUp.getOpportunityId());
        if (opportunity == null || !"0".equals(opportunity.getDelFlag())) {
            return;
        }
        LambdaUpdateWrapper<CrmOpportunity> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmOpportunity::getOpportunityId, followUp.getOpportunityId())
                .set(CrmOpportunity::getLatestFollowUpTime, followUp.getFollowUpTime())
                .set(CrmOpportunity::getUpdateBy, currentUserName())
                .set(CrmOpportunity::getUpdateTime, now());
        opportunityMapper.update(null, wrapper);
    }
}
