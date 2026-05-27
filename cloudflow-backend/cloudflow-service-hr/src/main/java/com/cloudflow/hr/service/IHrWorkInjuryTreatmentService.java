package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryTreatmentDTO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryTreatmentVO;

import java.util.List;

public interface IHrWorkInjuryTreatmentService {

    Long createTreatment(Long injuryId, HrWorkInjuryTreatmentDTO dto);

    void updateTreatment(Long treatmentId, HrWorkInjuryTreatmentDTO dto);

    List<HrWorkInjuryTreatmentVO> listByInjury(Long injuryId);
}
