package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeMediationDTO;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeMediationVO;

public interface HrDisputeMediationService {

    Long createMediation(Long disputeId, HrDisputeMediationDTO dto);

    void updateMediation(Long mediationId, HrDisputeMediationDTO dto);

    PageResult<HrDisputeMediationVO> listByDispute(Long disputeId);
}
