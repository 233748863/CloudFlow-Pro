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
        Date end = StringUtils.hasText(endDateStr) ? parseDate(endDateStr) : new Date(System.currentTimeMillis() + 86400000L * 30);
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
    public boolean checkConflict(Long roomId, Date start, Date end) {
        List<SysScheduleEvent> conflicts = baseMapper.checkConflict(roomId, start, end);
        return !conflicts.isEmpty();
    }
}
