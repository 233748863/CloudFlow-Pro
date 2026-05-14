package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import com.cloudflow.oa.service.ISysScheduleService;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.util.List;

@Service
public class SysScheduleServiceImpl extends ServiceImpl<SysScheduleEventMapper, SysScheduleEvent> implements ISysScheduleService {

    private static final String WORKPLACE_SUMMARY_CACHE = "oa_workplace_summary#120s";

    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_ONLY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Override
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#event.creatorId", condition = "#event != null && #event.creatorId != null")
    public boolean createEvent(SysScheduleEvent event) {
        // 1. 如果关联了会议室，进行冲突检测
        if (event.getRoomId() != null) {
            boolean conflict = checkConflict(event.getRoomId(), event.getStartTime(), event.getEndTime());
            if (conflict) {
                throw new ServiceException("该会议室在指定时间段已被预订");
            }
            event.setType("MEETING");
        }
        
        event.setCreateTime(LocalDateTime.now());
        return save(event);
    }

    @Override
    public List<SysScheduleEvent> getMyEvents(Long userId, String startDateStr, String endDateStr) {
        LocalDateTime start = StringUtils.hasText(startDateStr) ? parseDate(startDateStr) : LocalDateTime.now();
        LocalDateTime end;
        if (StringUtils.hasText(endDateStr)) {
            end = parseDate(endDateStr);
            // 如果传入的是纯日期格式（没有时间部分），将结束时间设为当天结束
            if (!endDateStr.contains("T") && !endDateStr.contains(" ")) {
                end = end.plusDays(1);
            }
        } else {
            end = LocalDateTime.now().plusDays(30);
        }
        return baseMapper.getMyEvents(userId, start, end);
    }

    /**
     * 解析多种日期格式：
     * - ISO 8601: 2026-01-31T16:00:00.000Z
     * - 标准格式: 2026-01-31 16:00:00
     * - 仅日期: 2026-01-31
     */
    private LocalDateTime parseDate(String dateStr) {
        try {
            // 1. 尝试 ISO 8601 格式 (前端默认发送的格式)
            if (dateStr.contains("T")) {
                Instant instant = Instant.parse(dateStr);
                return LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
            }
            // 2. 尝试 yyyy-MM-dd HH:mm:ss 格式
            if (dateStr.contains(" ")) {
                return LocalDateTime.parse(dateStr, DTF);
            }
            // 3. 尝试 yyyy-MM-dd 格式
            LocalDate ld = LocalDate.parse(dateStr, DATE_ONLY);
            return ld.atStartOfDay();
        } catch (DateTimeParseException e) {
            throw new ServiceException("日期格式错误，支持的格式: ISO 8601, yyyy-MM-dd HH:mm:ss, yyyy-MM-dd");
        }
    }

    @Override
    public List<SysScheduleEvent> getRoomEvents(Long roomId, String date) {
        LocalDateTime dayStart = parseDate(date);
        // 当天结束时间 = 当天开始 + 24小时
        LocalDateTime dayEnd = dayStart.plusDays(1);
        return baseMapper.getRoomEvents(roomId, dayStart, dayEnd);
    }

    @Override
    public boolean checkConflict(Long roomId, LocalDateTime start, LocalDateTime end) {
        List<SysScheduleEvent> conflicts = baseMapper.checkConflict(roomId, start, end);
        return !conflicts.isEmpty();
    }

    @Override
    public List<SysScheduleEvent> getRoomWeekEvents(Long roomId, String weekStart) {
        LocalDateTime start = parseDate(weekStart);
        // 一周 = 7天
        LocalDateTime end = start.plusWeeks(1);
        return baseMapper.getRoomEvents(roomId, start, end);
    }

    @Override
    public List<SysScheduleEvent> getMyBookings(Long userId, String status) {
        LocalDateTime now = LocalDateTime.now();
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
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#userId")
    public boolean cancelBooking(Long eventId, Long userId) {
        SysScheduleEvent event = getById(eventId);
        if (event == null) {
            throw new ServiceException("日程不存在");
        }
        if (!userId.equals(event.getCreatorId())) {
            throw new ServiceException("无权取消此预订，只有创建者可以取消");
        }
        // 检查是否已经开始
        if (event.getStartTime().isBefore(LocalDateTime.now())) {
            throw new ServiceException("会议已开始，无法取消");
        }
        return removeById(eventId);
    }

    @Override
    public List<java.util.Map<String, Object>> getRoomUsageStats(String startDate, String endDate) {
        LocalDateTime start = StringUtils.hasText(startDate) ? parseDate(startDate) : 
            LocalDate.now().withDayOfMonth(1).atStartOfDay();
        LocalDateTime end = StringUtils.hasText(endDate) ? parseDate(endDate) : LocalDateTime.now();
        return baseMapper.getRoomUsageStats(start, end);
    }
}
