package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.WorkCalendarDTO;
import com.cloudflow.hr.domain.dto.WorkCalendarQueryDTO;
import com.cloudflow.hr.domain.vo.WorkCalendarVO;

import java.util.List;

public interface WorkCalendarService {

    Long createWorkCalendar(WorkCalendarDTO dto);

    void updateWorkCalendar(Long id, WorkCalendarDTO dto);

    void deleteWorkCalendar(Long id);

    List<WorkCalendarVO> listWorkCalendars(WorkCalendarQueryDTO query);
}
