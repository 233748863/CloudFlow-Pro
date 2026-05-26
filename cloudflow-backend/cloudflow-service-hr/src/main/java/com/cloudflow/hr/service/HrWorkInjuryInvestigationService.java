package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryInvestigationDTO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryInvestigationVO;

import java.util.List;

public interface HrWorkInjuryInvestigationService {

    Long createInvestigation(Long injuryId, HrWorkInjuryInvestigationDTO dto);

    void updateInvestigation(Long investigationId, HrWorkInjuryInvestigationDTO dto);

    List<HrWorkInjuryInvestigationVO> listByInjury(Long injuryId);
}
