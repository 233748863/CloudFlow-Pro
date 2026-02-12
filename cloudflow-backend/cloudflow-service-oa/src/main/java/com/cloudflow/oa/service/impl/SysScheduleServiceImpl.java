package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import com.cloudflow.oa.service.ISysScheduleService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Date;
import java.util.List;

@Service
public class SysScheduleServiceImpl extends ServiceImpl<SysScheduleEventMapper, SysScheduleEvent> implements ISysScheduleService {

    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_ONLY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

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
        Date start = StringUtils.hasText(startDateStr) ? parseDate(startDateStr) : new Date();
        Date end;
        if (StringUtils.hasText(endDateStr)) {
            end = parseDate(endDateStr);
            // 如果传入的是纯日期格式（没有时间部分），将结束时间设为当天结束（即下一天00:00:00）
            if (!endDateStr.contains("T") && !endDateStr.contains(" ")) {
                end = new Date(end.getTime() + 86400000L);
            }
        } else {
            end = new Date(System.currentTimeMillis() + 86400000L * 30);
        }
        return baseMapper.getMyEvents(userId, start, end);
    }

    /**
     * 解析多种日期格式：
     * - ISO 8601: 2026-01-31T16:00:00.000Z
     * - 标准格式: 2026-01-31 16:00:00
     * - 仅日期: 2026-01-31
     */
    private Date parseDate(String dateStr) {
        try {
            // 1. 尝试 ISO 8601 格式 (前端默认发送的格式)
            if (dateStr.contains("T")) {
                Instant instant = Instant.parse(dateStr);
                return Date.from(instant);
            }
            // 2. 尝试 yyyy-MM-dd HH:mm:ss 格式
            if (dateStr.contains(" ")) {
                LocalDateTime ldt = LocalDateTime.parse(dateStr, DTF);
                return Date.from(ldt.atZone(ZoneId.systemDefault()).toInstant());
            }
            // 3. 尝试 yyyy-MM-dd 格式
            LocalDate ld = LocalDate.parse(dateStr, DATE_ONLY);
            return Date.from(ld.atStartOfDay(ZoneId.systemDefault()).toInstant());
        } catch (DateTimeParseException e) {
            throw new ServiceException("日期格式错误，支持的格式: ISO 8601, yyyy-MM-dd HH:mm:ss, yyyy-MM-dd");
        }
    }

    @Override
    public List<SysScheduleEvent> getRoomEvents(Long roomId, String date) {
        Date dayStart = parseDate(date);
        // 当天结束时间 = 当天开始 + 24小时
        Date dayEnd = new Date(dayStart.getTime() + 86400000L);
        return baseMapper.getRoomEvents(roomId, dayStart, dayEnd);
    }

    @Override
    public boolean checkConflict(Long roomId, Date start, Date end) {
        List<SysScheduleEvent> conflicts = baseMapper.checkConflict(roomId, start, end);
        return !conflicts.isEmpty();
    }

    @Override
    public List<SysScheduleEvent> getRoomWeekEvents(Long roomId, String weekStart) {
        Date start = parseDate(weekStart);
        // 一周 = 7天
        Date end = new Date(start.getTime() + 86400000L * 7);
        return baseMapper.getRoomEvents(roomId, start, end);
    }

    @Override
    public List<SysScheduleEvent> getMyBookings(Long userId, String status) {
        Date now = new Date();
        if ("upcoming".equals(status)) {
            // 待开始：开始时间在未来
            return baseMapper.getMyUpcomingBookings(userId, now);
        } else if ("past".equals(status)) {
            // 已结束：结束时间在过去
            return baseMapper.getMyPastBookings(userId, now);
        } else {
            // 全部：所有会议室预订
            return baseMapper.getMyAllBookings(userId);
        }
    }

    @Override
    public boolean cancelBooking(Long eventId, Long userId) {
        SysScheduleEvent event = getById(eventId);
        if (event == null) {
            throw new ServiceException("日程不存在");
        }
        if (!userId.equals(event.getCreatorId())) {
            throw new ServiceException("无权取消此预订，只有创建者可以取消");
        }
        // 检查是否已经开始
        if (event.getStartTime().before(new Date())) {
            throw new ServiceException("会议已开始，无法取消");
        }
        return removeById(eventId);
    }

    @Override
    public List<java.util.Map<String, Object>> getRoomUsageStats(String startDate, String endDate) {
        Date start = StringUtils.hasText(startDate) ? parseDate(startDate) : 
            Date.from(LocalDate.now().withDayOfMonth(1).atStartOfDay(ZoneId.systemDefault()).toInstant());
        Date end = StringUtils.hasText(endDate) ? parseDate(endDate) : new Date();
        return baseMapper.getRoomUsageStats(start, end);
    }
}
