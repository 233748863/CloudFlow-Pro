package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysScheduleEvent;
import java.util.List;
import java.util.Date;

public interface ISysScheduleService extends IService<SysScheduleEvent> {

    /**
     * 查询指定会议室某天的所有日程（所有人可见）
     */
    List<SysScheduleEvent> getRoomEvents(Long roomId, String date);
    
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
    
    /**
     * 获取会议室一周的预订（周视图日历用）
     */
    List<SysScheduleEvent> getRoomWeekEvents(Long roomId, String weekStart);
    
    /**
     * 获取我的会议室预订记录
     */
    List<SysScheduleEvent> getMyBookings(Long userId, String status);
    
    /**
     * 取消预订
     */
    boolean cancelBooking(Long eventId, Long userId);
    
    /**
     * 会议室使用统计
     */
    List<java.util.Map<String, Object>> getRoomUsageStats(String startDate, String endDate);
}
