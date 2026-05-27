package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
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

    private static final String SCOPE_DEPT_COLUMN = "scope_dept_id";
    private static final String SCOPE_OWNER_COLUMN = "scope_owner_id";

    private final ICrmCustomerService crmCustomerService;
    private final CrmOpportunityMapper opportunityMapper;

    @Override
    public PageResult<CrmFollowUp> queryPage(CrmFollowUp query, PageQuery pageQuery) {
        return PageResult.build(baseMapper.selectPageByDataScope(
                pageQuery.build(),
                query,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN)));
    }

    @Override
    public CrmFollowUp getAccessibleFollowUp(Long followUpId) {
        if (followUpId == null) {
            throw new IllegalArgumentException("跟进ID不能为空");
        }
        CrmFollowUp followUp = baseMapper.selectByIdWithDataScope(
                followUpId,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN));
        if (followUp == null) {
            throw new IllegalArgumentException("跟进记录不存在");
        }
        return followUp;
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
            crmCustomerService.refreshHealth(followUp.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateFollowUp(CrmFollowUp followUp) {
        if (followUp == null || followUp.getFollowUpId() == null) {
            throw new IllegalArgumentException("跟进ID不能为空");
        }
        validate(followUp);
        CrmFollowUp persisted = getAccessibleFollowUp(followUp.getFollowUpId());
        followUp.setTenantId(persisted.getTenantId());
        followUp.setUpdateBy(currentUserName());
        followUp.setUpdateTime(now());
        boolean updated = updateById(followUp);
        if (updated) {
            syncOpportunityFollowUpTime(followUp);
            crmCustomerService.refreshHealth(followUp.getCustomerId());
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
        CrmOpportunity opportunity = opportunityMapper.selectByIdWithDataScope(
                followUp.getOpportunityId(),
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN));
        if (opportunity == null) {
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
