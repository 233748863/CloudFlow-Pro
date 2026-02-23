package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysScheduleEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

@Mapper
public interface SysScheduleEventMapper extends BaseMapper<SysScheduleEvent> {
    
    /**
     * 查询指定会议室在时间段内的冲突事件
     * 冲突条件: (StartTime < end) AND (EndTime > start)
     */
    List<SysScheduleEvent> checkConflict(@Param("roomId") Long roomId, 
                                       @Param("startTime") LocalDateTime startTime, 
                                       @Param("endTime") LocalDateTime endTime);
    
    /**
     * 查询我的日程 (包括我创建的 OR 我是参与人的)
     */
    List<SysScheduleEvent> getMyEvents(@Param("userId") Long userId, 
                                     @Param("startDate") LocalDateTime startDate, 
                                     @Param("endDate") LocalDateTime endDate);

    /**
     * 查询指定会议室在时间段内的所有日程（所有人可见）
     */
    List<SysScheduleEvent> getRoomEvents(@Param("roomId") Long roomId,
                                        @Param("dayStart") LocalDateTime dayStart,
                                        @Param("dayEnd") LocalDateTime dayEnd);

    /**
     * 获取我的待开始预订
     */
    List<SysScheduleEvent> getMyUpcomingBookings(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * 获取我的已结束预订
     */
    List<SysScheduleEvent> getMyPastBookings(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * 获取我的所有会议室预订
     */
    List<SysScheduleEvent> getMyAllBookings(@Param("userId") Long userId);

    /**
     * 会议室使用统计
     */
    List<java.util.Map<String, Object>> getRoomUsageStats(@Param("startDate") LocalDateTime startDate, @Param("endDate") LocalDateTime endDate);
}
