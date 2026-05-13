package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmAssignmentRule;

public interface ICrmAssignmentRuleService extends IService<CrmAssignmentRule> {

    PageResult<CrmAssignmentRule> queryPage(CrmAssignmentRule query, PageQuery pageQuery);

    boolean createRule(CrmAssignmentRule rule);

    boolean updateRule(CrmAssignmentRule rule);
}
