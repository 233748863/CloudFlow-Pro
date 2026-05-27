package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeArbitrationDTO;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeArbitrationVO;

public interface IHrDisputeArbitrationService {

    Long createArbitration(Long disputeId, HrDisputeArbitrationDTO dto);

    void updateArbitration(Long arbitrationId, HrDisputeArbitrationDTO dto);

    PageResult<HrDisputeArbitrationVO> listByDispute(Long disputeId);
}
