package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysScheduleEvent;
import java.util.List;
import java.util.Date;

public interface ISysScheduleService extends IService<SysScheduleEvent> {
    
    /**
     * 创建日程 (包含冲突检测)
     */
    boolean createEvent(SysScheduleEvent event);
    
    /**
     * 获取我的日程
     */
    List<SysScheduleEvent> getMyEvents(Long userId, String startDateStr, String endDateStr);
    
    /**
     * 检查冲突
     */
    boolean checkConflict(Long roomId, Date start, Date end);
}
