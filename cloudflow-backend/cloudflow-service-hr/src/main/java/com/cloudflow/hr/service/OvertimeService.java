package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.OvertimeApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OvertimeApplicationQueryDTO;
import com.cloudflow.hr.domain.vo.OvertimeApplicationVO;
import com.cloudflow.hr.domain.vo.OvertimeStatisticsVO;

import java.time.YearMonth;
import java.util.List;

public interface OvertimeService {

    Long createOvertimeApplication(OvertimeApplicationCreateDTO dto);

    void updateOvertimeApplication(Long id, OvertimeApplicationCreateDTO dto);

    void deleteOvertimeApplication(Long id);

    void submitOvertimeApplication(Long id);

    void approveOvertimeApplication(Long id);

    void rejectOvertimeApplication(Long id);

    void cancelOvertimeApplication(Long id);

    List<OvertimeApplicationVO> listOvertimeApplications(OvertimeApplicationQueryDTO query);

    OvertimeApplicationVO getOvertimeApplication(Long id);

    OvertimeStatisticsVO getOvertimeStatistics(Long employeeId, YearMonth yearMonth);
}
