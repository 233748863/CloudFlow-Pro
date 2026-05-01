package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.dto.OaRiskAssignDTO;
import com.cloudflow.oa.domain.dto.OaRiskStatsDTO;
import com.cloudflow.oa.domain.dto.OaRiskStatusDTO;

import java.util.List;

/**
 * OA 风险提醒服务。
 */
public interface IOaRiskAlertService extends IService<OaRiskAlert> {

    PageResult<OaRiskAlert> queryPage(OaRiskAlert query, PageQuery pageQuery);

    List<OaRiskAlert> listByBusiness(String businessType, Long businessId);

    OaRiskStatsDTO getStats();

    boolean createManualRisk(OaRiskAlert risk);

    boolean createRuleRiskIfAbsent(OaRiskAlert risk);

    boolean updateRiskStatus(Long id, OaRiskStatusDTO dto);

    boolean assignRisk(Long id, OaRiskAssignDTO dto);
}
