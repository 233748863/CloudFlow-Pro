package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.mapper.MeetingRoomMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OaMeetingQueryService {
    private final OaMeetingMapper meetings;
    private final MeetingRoomMapper rooms;
    private final OaMeetingAccess access;
    private final OaMeetingCalendarService calendars;
    private final OaProperties properties;

    public PageResult<MeetingViews.RoomLane> board(LocalDateTime start, LocalDateTime end, Integer capacity,
                                                  List<String> tags, int pageNum, int pageSize) {
        window(start, end); paging(pageNum, pageSize); filters(capacity, tags);
        Page<MeetingRoom> page = meetings.rooms(new Page<>(pageNum, pageSize), OaRecordSupport.tenantId(), capacity, tags == null ? List.of() : tags);
        List<MeetingViews.RoomLane> rows = page.getRecords().stream().map(room -> {
            String reason = null;
            try { if (!"1".equals(room.getStatus())) reason = "会议室维护中"; else OaMeetingRules.windows(room, start, end, calendars::verified); }
            catch (ServiceException failure) { reason = failure.getMessage(); }
            return new MeetingViews.RoomLane(room, meetings.readOccupied(OaRecordSupport.tenantId(), room.getRoomId(), start, end).stream().map(this::occupancy).toList(), reason);
        }).toList();
        return new PageResult<>(rows, page.getTotal(), pageNum, pageSize);
    }

    @Transactional(readOnly = true)
    public PageResult<MeetingRoom> available(LocalDateTime start, LocalDateTime end, int capacity, List<String> tags, int pageNum, int pageSize) {
        window(start, end); paging(pageNum, pageSize); filters(capacity, tags);
        long offset = Math.multiplyExact((long) pageNum - 1, pageSize);
        long total = 0;
        List<MeetingRoom> rows = new ArrayList<>();
        for (int current = 1; ; current++) {
            Page<MeetingRoom> page = meetings.rooms(new Page<>(current, 50), OaRecordSupport.tenantId(), capacity, tags == null ? List.of() : tags);
            for (MeetingRoom room : page.getRecords()) {
                if (reason(room, start, end, capacity, Set.of(), LocalDateTime.now()) != null) continue;
                if (total >= offset && rows.size() < pageSize) rows.add(room);
                total++;
            }
            if (current >= page.getPages()) break;
        }
        return new PageResult<>(rows, total, pageNum, pageSize);
    }

    public PageResult<SysScheduleEvent> mine(LocalDateTime start, LocalDateTime end, int pageNum, int pageSize) {
        window(start, end); paging(pageNum, pageSize);
        return PageResult.build(meetings.mine(new Page<>(pageNum, pageSize), OaRecordSupport.tenantId(), OaMeetingAccess.userId(), start, end));
    }

    public MeetingViews.Detail detail(Long id) {
        SysScheduleEvent event = access.get(id);
        if (!access.visible(event)) throw OaMeetingAccess.unavailable();
        return new MeetingViews.Detail(event, meetings.attendees(event.getTenantId(), id), meetings.reminders(event.getTenantId(), id),
                Objects.equals(event.getCreatorId(), OaMeetingAccess.userId()), access.manageable(event), meetings.minutesId(event.getTenantId(), id));
    }

    public PageResult<MeetingViews.Usage> usage(LocalDateTime start, LocalDateTime end, int pageNum, int pageSize) {
        window(start, end); paging(pageNum, pageSize);
        Page<MeetingRoom> page = meetings.rooms(new Page<>(pageNum, pageSize), OaRecordSupport.tenantId(), null, List.of());
        List<MeetingViews.Usage> rows = page.getRecords().stream().map(room -> usage(room, start, end)).toList();
        return new PageResult<>(rows, page.getTotal(), pageNum, pageSize);
    }

    private MeetingViews.Usage usage(MeetingRoom room, LocalDateTime start, LocalDateTime end) {
        String basis = "按当前会议室开放规则核算；实际使用仅计已开始或已完成，剔除缓冲、取消、未举行";
        List<OaMeetingRules.Window> windows;
        try { windows = OaMeetingRules.windows(room, start, end, calendars::verified); }
        catch (ServiceException failure) { return new MeetingViews.Usage(room, null, null, null, null, null, basis, failure.getMessage()); }
        long open = windows.stream().mapToLong(value -> Duration.between(value.start(), value.end()).getSeconds()).sum();
        long used = 0; long booked = 0;
        for (SysScheduleEvent event : meetings.readOccupied(room.getTenantId(), room.getRoomId(), start, end)) {
            if (Set.of("IN_PROGRESS", "COMPLETED").contains(event.getStatus())) {
                LocalDateTime actualEnd = "IN_PROGRESS".equals(event.getStatus()) && event.getEndTime().isAfter(LocalDateTime.now()) ? LocalDateTime.now() : event.getEndTime();
                used = Math.addExact(used, OaMeetingRules.intersectSeconds(windows, event.getStartTime(), actualEnd));
            } else if ("PLANNED".equals(event.getStatus())) booked = Math.addExact(booked, OaMeetingRules.intersectSeconds(windows, event.getStartTime(), event.getEndTime()));
        }
        return new MeetingViews.Usage(room, minutes(used), minutes(booked), minutes(open), percent(used, open), percent(booked, open), basis, null);
    }

    public String reason(MeetingRoom room, LocalDateTime start, LocalDateTime end, int participants, Set<Long> excluded, LocalDateTime now) {
        try {
            OaMeetingRules.booking(room, start, end, participants, now, maximumMinutes(), calendars::verified);
            for (SysScheduleEvent occupied : meetings.readOccupied(room.getTenantId(), room.getRoomId(), start, end.plusMinutes(OaMeetingRules.buffer(room)))) {
                if (!excluded.contains(occupied.getEventId()) && OaMeetingRules.overlaps(start, end, OaMeetingRules.buffer(room), occupied)) return "MEETING_ROOM_CONFLICT: 时段或会后间隔已被占用";
            }
            return null;
        } catch (ServiceException failure) { return failure.getMessage(); }
    }

    public boolean conflict(Long roomId, LocalDateTime start, LocalDateTime end, Long excludedId) {
        window(start, end);
        Set<Long> excluded = Set.of();
        if (excludedId != null) { access.own(access.get(excludedId)); excluded = Set.of(excludedId); }
        return reason(room(roomId), start, end, 1, excluded, LocalDateTime.now()) != null;
    }

    public List<Map<String, String>> freeSlots(Long roomId, LocalDate date) {
        MeetingRoom room = room(roomId);
        if (!"1".equals(room.getStatus()) || date.isBefore(LocalDate.now())
                || room.getAdvanceBookingDays() != null && date.isAfter(LocalDate.now().plusDays(room.getAdvanceBookingDays()))) return List.of();
        LocalDateTime start = date.atStartOfDay(); LocalDateTime end = date.plusDays(1).atStartOfDay();
        if (date.equals(LocalDate.now())) start = LocalDateTime.now().withSecond(0).withNano(0).plusMinutes(1);
        if (!start.isBefore(end)) return List.of();
        List<OaMeetingRules.Window> windows = OaMeetingRules.windows(room, start, end, calendars::verified);
        List<SysScheduleEvent> occupied = meetings.readOccupied(room.getTenantId(), roomId, start, end.plusMinutes(OaMeetingRules.buffer(room)));
        List<Map<String, String>> result = new ArrayList<>();
        DateTimeFormatter format = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        for (OaMeetingRules.Window window : windows) {
            LocalDateTime cursor = window.start();
            for (SysScheduleEvent event : occupied) {
                LocalDateTime busyStart = event.getStartTime().minusMinutes(OaMeetingRules.buffer(room));
                LocalDateTime busyEnd = event.getEndTime().plusMinutes(event.getBufferMinutesSnapshot());
                if (!busyEnd.isAfter(cursor) || !busyStart.isBefore(window.end())) continue;
                if (busyStart.isAfter(cursor)) gap(result, cursor, earlier(busyStart, window.end()), room, format);
                if (busyEnd.isAfter(cursor)) cursor = busyEnd;
            }
            if (cursor.isBefore(window.end())) gap(result, cursor, window.end(), room, format);
        }
        return List.copyOf(result);
    }

    private void gap(List<Map<String, String>> result, LocalDateTime start, LocalDateTime end, MeetingRoom room, DateTimeFormatter format) {
        if (Duration.between(start, end).getSeconds() >= Math.multiplyExact((long) OaMeetingRules.minimum(room), 60)) {
            result.add(Map.of("start", start.format(format), "end", end.format(format)));
        }
    }

    public MeetingRoom room(Long id) {
        MeetingRoom room = id == null ? null : rooms.selectById(id);
        if (room == null || !Objects.equals(OaRecordSupport.tenantId(), room.getTenantId()) || Integer.valueOf(1).equals(room.getDeleted())) throw OaMeetingRules.error("ROOM_UNAVAILABLE", "会议室不存在或不可核实");
        return room;
    }

    private MeetingViews.Occupancy occupancy(SysScheduleEvent event) {
        boolean visible = access.visible(event);
        return new MeetingViews.Occupancy(visible ? event.getEventId() : null, visible ? event.getTitle() : "忙碌时段", event.getRoomId(),
                event.getStartTime(), event.getEndTime(), event.getEndTime().plusMinutes(event.getBufferMinutesSnapshot()), event.getStatus(), event.getApprovalStatus(), visible);
    }

    public int maximumMinutes() { return Math.multiplyExact(properties.getMeetingRoom().getMaxBookingHours(), 60); }
    public static void window(LocalDateTime start, LocalDateTime end) {
        OaMeetingRules.interval(start, end);
        OaMeetingRules.require(Duration.between(start, end).compareTo(Duration.ofDays(31)) <= 0, "MEETING_QUERY_WINDOW", "每次查询最多31天，请缩小日期范围");
    }
    public static void paging(int pageNum, int pageSize) { OaMeetingRules.require(pageNum > 0 && pageSize > 0 && pageSize <= 50, "MEETING_PAGE_INVALID", "页码须大于0，每页最多50条"); }
    private void filters(Integer capacity, List<String> tags) {
        OaMeetingRules.require(capacity == null || capacity > 0, "MEETING_ATTENDEES_INVALID", "人数须大于0");
        OaMeetingRules.require(tags == null || tags.size() <= 30 && tags.stream().allMatch(tag -> tag != null && !tag.isBlank() && tag.length() <= 100), "ROOM_RULE_INVALID", "设备筛选最多30个有效标签");
    }
    private static LocalDateTime earlier(LocalDateTime left, LocalDateTime right) { return left.isBefore(right) ? left : right; }
    private static BigDecimal minutes(long seconds) { return BigDecimal.valueOf(seconds).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP); }
    private static BigDecimal percent(long seconds, long open) { return open == 0 ? null : BigDecimal.valueOf(seconds).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(open), 2, RoundingMode.HALF_UP); }
}
