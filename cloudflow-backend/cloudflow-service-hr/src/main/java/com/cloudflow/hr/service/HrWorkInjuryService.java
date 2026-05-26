package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryQueryDTO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryListVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryVO;

public interface HrWorkInjuryService {

    Long createInjury(HrWorkInjuryDTO dto);

    void updateInjury(Long injuryId, HrWorkInjuryDTO dto);

    PageResult<HrWorkInjuryListVO> page(HrWorkInjuryQueryDTO query);

    PageResult<HrWorkInjuryListVO> listMine(HrWorkInjuryQueryDTO query);

    HrWorkInjuryVO get(Long injuryId);

    String submitDetermination(Long injuryId);

    void close(Long injuryId, String reason);
}
