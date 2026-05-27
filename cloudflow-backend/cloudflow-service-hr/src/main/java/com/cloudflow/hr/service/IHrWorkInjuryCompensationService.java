package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryCompensationDTO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryCompensationVO;

import java.util.List;

public interface IHrWorkInjuryCompensationService {

    Long createCompensation(Long injuryId, HrWorkInjuryCompensationDTO dto);

    void updateCompensation(Long compensationId, HrWorkInjuryCompensationDTO dto);

    List<HrWorkInjuryCompensationVO> listByInjury(Long injuryId);

    void markPaid(Long compensationId);
}
