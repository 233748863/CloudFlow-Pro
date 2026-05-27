package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrPerfDistributionCheckPayload;
import com.cloudflow.hr.domain.dto.HrPerfDistributionRulePayload;
import com.cloudflow.hr.domain.vo.performance.HrPerfDistributionRuleVO;
import com.cloudflow.hr.domain.vo.performance.HrPerfDistributionValidateVO;

import java.util.List;

/**
 * HR-P0-2 绩效强制分布服务。
 */
public interface IHrPerformanceDistributionService {

    /** 列出规则(全局规则 + 指定目标规则)。 */
    List<HrPerfDistributionRuleVO> listRules(Long objectiveId);

    /** 新增/更新规则。 */
    Long saveRule(HrPerfDistributionRulePayload payload);

    /** 删除规则(软删)。 */
    void deleteRule(Long id);

    /**
     * 校验评分明细是否符合分布配额。
     * 返回字段：valid / total / countsByGrade / quotaByGrade / violations。
     * BLOCK 模式下 valid=false 表示拦截；WARN 模式仅给出 violations 提醒。
     */
    HrPerfDistributionValidateVO validate(HrPerfDistributionCheckPayload payload);
}
