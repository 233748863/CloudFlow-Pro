package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.workflow.domain.SysScheduleEvent;
import com.cloudflow.workflow.mapper.SysScheduleEventMapper;
import com.cloudflow.workflow.service.ISysScheduleService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

@Service
public class SysScheduleServiceImpl extends ServiceImpl<SysScheduleEventMapper, SysScheduleEvent> implements ISysScheduleService {

    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    @Override
    public boolean createEvent(SysScheduleEvent event) {
        // 1. 如果关联了会议室，进行冲突检测
        if (event.getRoomId() != null) {
            boolean conflict = checkConflict(event.getRoomId(), event.getStartTime(), event.getEndTime());
            if (conflict) {
                throw new ServiceException("该会议室在指定时间段已被预订");
            }
            event.setType("MEETING");
        }
        
        event.setCreateTime(new Date());
        return save(event);
    }

    @Override
    public List<SysScheduleEvent> getMyEvents(Long userId, String startDateStr, String endDateStr) {
        try {
            Date start = StringUtils.hasText(startDateStr) ? SDF.parse(startDateStr) : new Date();
            // Default to 30 days later if not provided? Or handle in controller. 
            // For now assume frontend provides valid dates.
            Date end = StringUtils.hasText(endDateStr) ? SDF.parse(endDateStr) : new Date(System.currentTimeMillis() + 86400000L * 30);
            
            return baseMapper.getMyEvents(userId, start, end);
        } catch (ParseException e) {
            throw new ServiceException("日期格式错误");
        }
    }

    @Override
    public boolean checkConflict(Long roomId, Date start, Date end) {
        List<SysScheduleEvent> conflicts = baseMapper.checkConflict(roomId, start, end);
        return !conflicts.isEmpty();
    }
}
