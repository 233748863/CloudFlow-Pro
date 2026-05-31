package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmAssignmentRule;
import com.cloudflow.crm.mapper.CrmAssignmentRuleMapper;
import com.cloudflow.crm.service.ICrmAssignmentRuleService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CrmAssignmentRuleServiceImpl extends CrmServiceSupport<CrmAssignmentRuleMapper, CrmAssignmentRule>
        implements ICrmAssignmentRuleService {

    @Override
    public PageResult<CrmAssignmentRule> queryPage(CrmAssignmentRule query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmAssignmentRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmAssignmentRule::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmAssignmentRule::getPriority)
                .orderByDesc(CrmAssignmentRule::getUpdateTime);
        likeIfPresent(wrapper, CrmAssignmentRule::getRuleName, query.getRuleName());
        eqIfPresent(wrapper, CrmAssignmentRule::getRuleType, query.getRuleType());
        eqIfPresent(wrapper, CrmAssignmentRule::getStatus, query.getStatus());
        if (query.getDeptId() != null) {
            wrapper.eq(CrmAssignmentRule::getDeptId, query.getDeptId());
        }
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createRule(CrmAssignmentRule rule) {
        validate(rule);
        if (rule.getPriority() == null) {
            rule.setPriority(100);
        }
        if (!StringUtils.hasText(rule.getStatus())) {
            rule.setStatus(CrmConstants.AssignmentRuleStatus.ACTIVE);
        }
        Localize.fillCommonAudit(rule, currentTenantId(), currentUserName(), now());
        return save(rule);
    }

    @Override
    @Audit(name = "更新分配规则", diff = true, highRisk = true)
    public boolean updateRule(CrmAssignmentRule rule) {
        if (rule == null || rule.getRuleId() == null) {
            throw new IllegalArgumentException("规则ID不能为空");
        }
        validate(rule);
        CrmAssignmentRule persisted = requireById(rule.getRuleId(), "分配规则不存在");
        rule.setTenantId(persisted.getTenantId());
        rule.setUpdateBy(currentUserName());
        rule.setUpdateTime(now());
        return updateById(rule);
    }

    private void validate(CrmAssignmentRule rule) {
        if (rule == null) {
            throw new IllegalArgumentException("分配规则不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleType())) {
            throw new IllegalArgumentException("规则类型不能为空");
        }
        if (!CrmConstants.AssignmentRuleType.AUTO_RELEASE.equals(rule.getRuleType())
                && !CrmConstants.AssignmentRuleType.CLAIM_LIMIT.equals(rule.getRuleType())
                && !CrmConstants.AssignmentRuleType.ASSIGN.equals(rule.getRuleType())) {
            throw new IllegalArgumentException("规则类型不支持");
        }
        if (CrmConstants.AssignmentRuleType.AUTO_RELEASE.equals(rule.getRuleType())) {
            if (rule.getInactiveDays() == null || rule.getInactiveDays() <= 0) {
                throw new IllegalArgumentException("自动回收规则必须填写未跟进天数阈值");
            }
        }
        if (CrmConstants.AssignmentRuleType.CLAIM_LIMIT.equals(rule.getRuleType())) {
            if (rule.getMaxPerOwner() == null || rule.getMaxPerOwner() <= 0) {
                throw new IllegalArgumentException("抢单上限规则必须填写单人持有上限");
            }
        }
    }
}
