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
import java.util.List;

@Service
public class SysScheduleServiceImpl extends ServiceImpl<SysScheduleEventMapper, SysScheduleEvent> implements ISysScheduleService {

    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_ONLY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Override
    public boolean createEvent(SysScheduleEvent event) {
        event.setCreateTime(LocalDateTime.now());
        if (!StringUtils.hasText(event.getType())) {
            event.setType("PERSONAL");
        }
        return save(event);
    }

    @Override
    public List<SysScheduleEvent> getMyEvents(Long userId, String startDateStr, String endDateStr) {
        LocalDateTime start = StringUtils.hasText(startDateStr) ? parseDate(startDateStr) : LocalDateTime.now();
        LocalDateTime end;
        if (StringUtils.hasText(endDateStr)) {
            end = parseDate(endDateStr);
            if (!endDateStr.contains("T") && !endDateStr.contains(" ")) {
                end = end.plusDays(1);
            }
        } else {
            end = LocalDateTime.now().plusDays(30);
        }
        return baseMapper.getMyEvents(userId, start, end);
    }

    private LocalDateTime parseDate(String dateStr) {
        try {
            if (dateStr.contains("T")) {
                Instant instant = Instant.parse(dateStr);
                return LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
            }
            if (dateStr.contains(" ")) {
                return LocalDateTime.parse(dateStr, DTF);
            }
            LocalDate date = LocalDate.parse(dateStr, DATE_ONLY);
            return date.atStartOfDay();
        } catch (DateTimeParseException e) {
            throw new ServiceException("日期格式错误，支持 ISO 8601、yyyy-MM-dd HH:mm:ss、yyyy-MM-dd");
        }
    }
}
