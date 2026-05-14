package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;

import java.util.List;

public interface ICrmOpportunityService extends IService<CrmOpportunity> {

    PageResult<CrmOpportunity> queryPage(CrmOpportunity query, PageQuery pageQuery);

    CrmOpportunity getAccessibleOpportunity(Long opportunityId);

    boolean createOpportunity(CrmOpportunity opportunity);

    boolean updateOpportunity(CrmOpportunity opportunity);

    boolean winOpportunity(Long opportunityId);

    boolean loseOpportunity(Long opportunityId, String lostReason);

    Long createProjectDraft(Long opportunityId);

    List<CrmOpportunityBoardColumnVO> getBoard();

    boolean updateStage(Long opportunityId, String stage, String lostReason);
}
