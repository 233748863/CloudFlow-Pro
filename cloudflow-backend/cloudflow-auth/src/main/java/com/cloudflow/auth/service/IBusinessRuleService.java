package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.domain.BusinessRuleVersion;

/**
 * 业务规则服务。
 */
public interface IBusinessRuleService extends IService<BusinessRule> {

    Page<BusinessRule> queryPage(String module, String ruleCode, Integer enabled, Integer pageNum, Integer pageSize);

    BusinessRule getEffectiveRule(String ruleCode);

    boolean createRule(BusinessRule rule);

    boolean updateRule(BusinessRule rule);

    boolean setEnabled(Long id, Integer enabled);

    BusinessRuleVersion createDraft(BusinessRule rule);

    boolean publishVersion(Long versionId);

    boolean rollbackToVersion(Long ruleId, Long versionId);

    Page<BusinessRuleVersion> queryVersions(Long ruleId, String ruleCode, String status, Integer pageNum, Integer pageSize);

    Page<BusinessRuleHitRecord> queryHitRecords(String ruleCode, String businessType, String hitResult, Integer pageNum, Integer pageSize);

    boolean recordHit(BusinessRuleHitRecord record);
}
