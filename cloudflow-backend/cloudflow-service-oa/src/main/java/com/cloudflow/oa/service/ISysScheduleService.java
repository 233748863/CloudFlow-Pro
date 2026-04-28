package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysScheduleEvent;

import java.util.List;

public interface ISysScheduleService extends IService<SysScheduleEvent> {

    boolean createEvent(SysScheduleEvent event);

    List<SysScheduleEvent> getMyEvents(Long userId, String startDateStr, String endDateStr);
}
