package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.BusinessRule;

/**
 * 业务规则服务。
 */
public interface IBusinessRuleService extends IService<BusinessRule> {

    Page<BusinessRule> queryPage(String module, String ruleCode, Integer enabled, Integer pageNum, Integer pageSize);

    BusinessRule getEffectiveRule(String ruleCode);

    boolean createRule(BusinessRule rule);

    boolean updateRule(BusinessRule rule);

    boolean setEnabled(Long id, Integer enabled);
}
