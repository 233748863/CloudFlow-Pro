package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeEvidenceDTO;
import com.cloudflow.hr.domain.dto.dispute.HrLaborDisputeDTO;
import com.cloudflow.hr.domain.dto.dispute.HrLaborDisputeQueryDTO;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeEvidenceVO;
import com.cloudflow.hr.domain.vo.dispute.HrLaborDisputeVO;

public interface IHrLaborDisputeService {

    Long registerDispute(HrLaborDisputeDTO dto);

    void updateDispute(Long disputeId, HrLaborDisputeDTO dto);

    PageResult<HrLaborDisputeVO> page(HrLaborDisputeQueryDTO query);

    HrLaborDisputeVO get(Long disputeId);

    String submitWorkflow(Long disputeId);

    void close(Long disputeId, String reason);

    Long attachEvidence(Long disputeId, HrDisputeEvidenceDTO dto);

    PageResult<HrDisputeEvidenceVO> listEvidence(Long disputeId);
}
