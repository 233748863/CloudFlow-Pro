package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryRehabilitationDTO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryRehabilitationVO;

import java.util.List;

public interface IHrWorkInjuryRehabilitationService {

    Long createRehabilitation(Long injuryId, HrWorkInjuryRehabilitationDTO dto);

    void updateRehabilitation(Long rehabilitationId, HrWorkInjuryRehabilitationDTO dto);

    List<HrWorkInjuryRehabilitationVO> listByInjury(Long injuryId);
}
