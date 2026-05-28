package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import com.cloudflow.oa.service.ISysScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SysScheduleServiceImpl extends ServiceImpl<SysScheduleEventMapper, SysScheduleEvent> implements ISysScheduleService {

    private static final String WORKPLACE_SUMMARY_CACHE = "oa_workplace_summary#120s";

    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_ONLY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private OaProperties oaProperties;

    @Override
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#event.creatorId", condition = "#event != null && #event.creatorId != null")
    public boolean createEvent(SysScheduleEvent event) {
        // 1. 业务配置校验
        validateBookingConstraints(event);

        // 2. 如果关联了会议室，进行冲突检测
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
    @Transactional
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#event.creatorId", condition = "#event != null && #event.creatorId != null")
    public boolean updateEvent(SysScheduleEvent event) {
        // 1. 业务配置校验
        validateBookingConstraints(event);

        // 2. 如果关联了会议室，进行冲突检测（排除自身）
        if (event.getRoomId() != null && event.getEventId() != null) {
            boolean conflict = checkConflictExcluding(
                    event.getRoomId(), event.getStartTime(), event.getEndTime(), event.getEventId());
            if (conflict) {
                throw new ServiceException("该会议室在指定时间段已被预订");
            }
        }

        event.setUpdateTime(LocalDateTime.now());
        return updateById(event);
    }

    /**
     * 业务配置校验：预订时长上限 + 不能预订过去的时间
     */
    private void validateBookingConstraints(SysScheduleEvent event) {
        if (event.getStartTime() == null || event.getEndTime() == null) {
            return;
        }

        OaProperties.MeetingRoomConfig config = oaProperties.getMeetingRoom();

        // 校验预订时长
        long hours = ChronoUnit.MINUTES.between(event.getStartTime(), event.getEndTime()) / 60.0 > 0
                ? ChronoUnit.HOURS.between(event.getStartTime(), event.getEndTime())
                : 0;
        long minutes = ChronoUnit.MINUTES.between(event.getStartTime(), event.getEndTime());
        if (minutes > config.getMaxBookingHours() * 60L) {
            throw new ServiceException("预订时长不能超过 " + config.getMaxBookingHours() + " 小时");
        }

        // 校验不能预订已过去的时间
        if (event.getStartTime().isBefore(LocalDateTime.now().minusMinutes(1))) {
            throw new ServiceException("不能预订已过去的时间");
        }
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
    public boolean checkConflictExcluding(Long roomId, LocalDateTime start, LocalDateTime end, Long excludeEventId) {
        List<SysScheduleEvent> conflicts = baseMapper.checkConflictExcluding(roomId, start, end, excludeEventId);
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
    public List<DynamicMapVO> getRoomUsageStats(String startDate, String endDate) {
        LocalDateTime start = StringUtils.hasText(startDate) ? parseDate(startDate) :
            LocalDate.now().withDayOfMonth(1).atStartOfDay();
        LocalDateTime end = StringUtils.hasText(endDate) ? parseDate(endDate) : LocalDateTime.now();
        return baseMapper.getRoomUsageStats(start, end).stream().map(DynamicMapVO::from).toList();
    }

    @Override
    public List<Map<String, String>> getFreeSlots(Long roomId, String date) {
        // 工作时间 8:00 - 21:00
        int businessStart = 8;
        int businessEnd = 21;

        LocalDate targetDate = LocalDate.parse(date, DATE_ONLY);
        LocalDateTime dayStart = targetDate.atTime(businessStart, 0);
        LocalDateTime dayEnd = targetDate.atTime(businessEnd, 0);
        LocalDateTime now = LocalDateTime.now();

        // 如果查询的是今天，起始时间从当前时间开始
        if (targetDate.equals(LocalDate.now()) && now.isAfter(dayStart)) {
            dayStart = now.withMinute(0).withSecond(0).withNano(0).plusHours(1);
        }

        // 获取当日所有预订，按开始时间排序
        List<SysScheduleEvent> bookings = baseMapper.getRoomEvents(roomId, dayStart, dayEnd);
        bookings.sort((a, b) -> a.getStartTime().compareTo(b.getStartTime()));

        List<Map<String, String>> freeSlots = new ArrayList<>();
        LocalDateTime cursor = dayStart;

        for (SysScheduleEvent booking : bookings) {
            LocalDateTime bookingStart = booking.getStartTime().isBefore(dayStart) ? dayStart : booking.getStartTime();
            LocalDateTime bookingEnd = booking.getEndTime().isAfter(dayEnd) ? dayEnd : booking.getEndTime();

            // cursor 到 bookingStart 之间是空闲时段
            if (cursor.isBefore(bookingStart)) {
                Map<String, String> slot = new LinkedHashMap<>();
                slot.put("start", cursor.format(DTF));
                slot.put("end", bookingStart.format(DTF));
                freeSlots.add(slot);
            }
            // cursor 移到 bookingEnd
            if (bookingEnd.isAfter(cursor)) {
                cursor = bookingEnd;
            }
        }

        // cursor 到 dayEnd 之间是空闲时段
        if (cursor.isBefore(dayEnd)) {
            Map<String, String> slot = new LinkedHashMap<>();
            slot.put("start", cursor.format(DTF));
            slot.put("end", dayEnd.format(DTF));
            freeSlots.add(slot);
        }

        return freeSlots;
    }
}
