package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestDTO;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestQueryDTO;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitRequestVO;

public interface IHrBenefitRequestService {

    Long createRequest(HrBenefitRequestDTO dto);

    void updateRequest(Long requestId, HrBenefitRequestDTO dto);

    PageResult<HrBenefitRequestVO> page(HrBenefitRequestQueryDTO query);

    HrBenefitRequestVO get(Long requestId);

    PageResult<HrBenefitRequestVO> listMine(HrBenefitRequestQueryDTO query);

    String submitWorkflow(Long requestId);

    void cancelRequest(Long requestId, String reason);
}
