package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysScheduleEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Date;

@Mapper
public interface SysScheduleEventMapper extends BaseMapper<SysScheduleEvent> {
    
    /**
     * 查询指定会议室在时间段内的冲突事件
     * 冲突条件: (StartTime < end) AND (EndTime > start)
     */
    List<SysScheduleEvent> checkConflict(@Param("roomId") Long roomId, 
                                       @Param("startTime") Date startTime, 
                                       @Param("endTime") Date endTime);
    
    /**
     * 查询我的日程 (包括我创建的 OR 我是参与人的)
     */
    List<SysScheduleEvent> getMyEvents(@Param("userId") Long userId, 
                                     @Param("startDate") Date startDate, 
                                     @Param("endDate") Date endDate);
}
