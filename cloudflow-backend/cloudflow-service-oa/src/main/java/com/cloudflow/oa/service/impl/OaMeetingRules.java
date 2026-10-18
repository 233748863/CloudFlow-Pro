package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiFunction;

public final class OaMeetingRules {
    public static final Set<String> STATUSES = Set.of("PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NOT_HELD");
    public static final Set<String> RESPONSES = Set.of("NONE", "ACCEPTED", "DECLINED", "TENTATIVE");
    private static final ObjectMapper JSON = new ObjectMapper();

    private OaMeetingRules() { }

    public record Window(LocalDateTime start, LocalDateTime end) { }

    public static void room(MeetingRoom room) {
        require(room != null, "ROOM_UNAVAILABLE", "会议室不存在或不可核实");
        require(room.getCapacity() == null || room.getCapacity() > 0, "ROOM_RULE_INVALID", "会议室容量须大于0");
        require((room.getOpenTime() == null && room.getCloseTime() == null)
                        || room.getOpenTime() != null && room.getCloseTime() != null && room.getOpenTime().isBefore(room.getCloseTime()),
                "ROOM_RULE_INVALID", "开放时间须成对填写，结束须晚于开始");
        int minimum = minimum(room);
        require(minimum > 0 && (room.getMaxBookingMinutes() == null || room.getMaxBookingMinutes() >= minimum),
                "ROOM_RULE_INVALID", "预约最长分钟数须不小于最短分钟数");
        require(room.getAdvanceBookingDays() == null || room.getAdvanceBookingDays() >= 0, "ROOM_RULE_INVALID", "提前天数须为非负整数");
        require(buffer(room) >= 0, "ROOM_RULE_INVALID", "会后间隔须为非负分钟数");
        flag(room.getHolidayBookableFlag());
        flag(room.getNeedApprovalFlag());
        require(!Integer.valueOf(1).equals(room.getNeedApprovalFlag()) || room.getApproverId() != null && room.getApproverId() > 0,
                "ROOM_APPROVER_REQUIRED", "需要审批的会议室须配置审批人");
        require(room.getHolidayCalendarId() == null || room.getHolidayCalendarId() > 0, "ROOM_RULE_INVALID", "节假日日历标识无效");
        weekdays(room.getBookableWeekdays());
        tags(room.getEquipmentTags());
    }

    public static void booking(MeetingRoom room, LocalDateTime start, LocalDateTime end, int participants,
                               LocalDateTime now, Integer legacyMaximumMinutes,
                               BiFunction<Long, LocalDate, DayTypeInfo> calendar) {
        room(room);
        interval(start, end);
        require("1".equals(room.getStatus()) && !Integer.valueOf(1).equals(room.getDeleted()), "ROOM_UNAVAILABLE", "会议室已停用或不可用");
        require(participants > 0 && (room.getCapacity() == null || participants <= room.getCapacity()), "ROOM_CAPACITY_EXCEEDED", "预计人数超过会议室容量或人数无效");
        if (now != null) {
            require(!start.isBefore(now.minusMinutes(1)), "MEETING_IN_PAST", "不能预订已过去的时间");
            require(room.getAdvanceBookingDays() == null || !start.toLocalDate().isAfter(now.toLocalDate().plusDays(room.getAdvanceBookingDays())),
                    "ROOM_ADVANCE_EXCEEDED", "预约日期超过会议室允许的提前天数");
        }
        Duration duration = Duration.between(start, end);
        require(duration.compareTo(Duration.ofMinutes(minimum(room))) >= 0, "ROOM_DURATION_TOO_SHORT", "预约时长短于会议室最短时长");
        Integer maximum = room.getMaxBookingMinutes() == null ? legacyMaximumMinutes : room.getMaxBookingMinutes();
        require(maximum == null || duration.compareTo(Duration.ofMinutes(maximum)) <= 0, "ROOM_DURATION_TOO_LONG", "预约时长超过会议室最长时长");
        for (LocalDate date = start.toLocalDate(); date.atStartOfDay().isBefore(end); date = date.plusDays(1)) {
            Window window = dayWindow(room, date, calendar);
            require(window != null, "ROOM_DAY_CLOSED", date + "不允许预约");
            LocalDateTime requiredStart = later(start, date.atStartOfDay());
            LocalDateTime requiredEnd = earlier(end, date.plusDays(1).atStartOfDay());
            require(!requiredStart.isBefore(window.start()) && !requiredEnd.isAfter(window.end()), "ROOM_OUTSIDE_OPENING", date + "的预约超出会议室开放时间");
        }
    }

    public static List<Window> windows(MeetingRoom room, LocalDateTime start, LocalDateTime end,
                                       BiFunction<Long, LocalDate, DayTypeInfo> calendar) {
        room(room);
        interval(start, end);
        List<Window> result = new ArrayList<>();
        for (LocalDate date = start.toLocalDate(); date.atStartOfDay().isBefore(end); date = date.plusDays(1)) {
            Window available = dayWindow(room, date, calendar);
            if (available == null) continue;
            LocalDateTime from = later(start, available.start());
            LocalDateTime to = earlier(end, available.end());
            if (from.isBefore(to)) result.add(new Window(from, to));
        }
        return List.copyOf(result);
    }

    private static Window dayWindow(MeetingRoom room, LocalDate date, BiFunction<Long, LocalDate, DayTypeInfo> calendar) {
        DayTypeInfo fact = null;
        if (room.getHolidayCalendarId() != null) {
            require(calendar != null, "ROOM_CALENDAR_UNVERIFIED", "会议室绑定的节假日日历不可核实");
            fact = calendar.apply(room.getHolidayCalendarId(), date);
            require(fact != null && date.equals(fact.getDate()) && fact.getDateType() != null && Set.of("WORKDAY", "REST", "HOLIDAY").contains(fact.getDateType()),
                    "ROOM_CALENDAR_UNVERIFIED", date + "尚未核定节假日日历");
        }
        Set<Integer> allowed = weekdays(room.getBookableWeekdays());
        if (!allowed.isEmpty() && !allowed.contains(date.getDayOfWeek().getValue())) return null;
        if (fact != null && "HOLIDAY".equals(fact.getDateType()) && Integer.valueOf(0).equals(room.getHolidayBookableFlag())) return null;
        LocalDateTime from = date.atTime(room.getOpenTime() == null ? LocalTime.MIDNIGHT : room.getOpenTime());
        LocalDateTime to = room.getCloseTime() == null ? date.plusDays(1).atStartOfDay() : date.atTime(room.getCloseTime());
        return new Window(from, to);
    }

    public static boolean occupied(SysScheduleEvent event) {
        return event != null && !Integer.valueOf(1).equals(event.getDeleted()) && !"SERIES".equals(event.getRecurrenceRole())
                && !Set.of("DRAFT", "REJECTED", "CANCELLED").contains(Objects.toString(event.getApprovalStatus(), "NOT_REQUIRED"))
                && Set.of("PLANNED", "IN_PROGRESS", "COMPLETED").contains(Objects.toString(event.getStatus(), "PLANNED"));
    }

    public static boolean overlaps(LocalDateTime start, LocalDateTime end, int afterMinutes, SysScheduleEvent existing) {
        interval(start, end);
        require(afterMinutes >= 0, "ROOM_RULE_INVALID", "会后间隔无效");
        if (!occupied(existing)) return false;
        return start.isBefore(existing.getEndTime().plusMinutes(existing.getBufferMinutesSnapshot() == null ? 0 : existing.getBufferMinutesSnapshot()))
                && existing.getStartTime().isBefore(end.plusMinutes(afterMinutes));
    }

    public static long intersectSeconds(List<Window> windows, LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || !start.isBefore(end)) return 0;
        long seconds = 0;
        for (Window window : windows) {
            LocalDateTime from = later(start, window.start());
            LocalDateTime to = earlier(end, window.end());
            if (from.isBefore(to)) seconds = Math.addExact(seconds, Duration.between(from, to).getSeconds());
        }
        return seconds;
    }

    public static void transition(SysScheduleEvent event, String target, boolean manager, String reason, LocalDateTime now) {
        require(event != null && !"SERIES".equals(event.getRecurrenceRole()), "MEETING_STATE_INVALID", "周期主记录不能操作实际会议状态");
        String current = event.getStatus();
        require(current != null && STATUSES.contains(current) && target != null && STATUSES.contains(target), "MEETING_STATE_INVALID", "会议状态无效");
        boolean allowed = switch (current) {
            case "PLANNED" -> Set.of("IN_PROGRESS", "CANCELLED", "NOT_HELD").contains(target);
            case "IN_PROGRESS" -> "COMPLETED".equals(target) || manager && "CANCELLED".equals(target);
            default -> false;
        };
        require(allowed, "MEETING_STATE_INVALID", "当前会议状态不允许该操作");
        if ("IN_PROGRESS".equals(target)) {
            require(Set.of("NOT_REQUIRED", "APPROVED").contains(Objects.toString(event.getApprovalStatus(), "")), "MEETING_APPROVAL_REQUIRED", "预约未获批准，不能开始会议");
            require(!now.isBefore(event.getStartTime()) && now.isBefore(event.getEndTime()), "MEETING_START_WINDOW", "只能在预约时段内开始会议");
        }
        if ("CANCELLED".equals(target) || "NOT_HELD".equals(target)) {
            require(reason != null && !reason.isBlank() && reason.trim().length() <= 500, "MEETING_REASON_REQUIRED", "须填写1至500字的原因");
        }
    }

    public static List<MeetingCommands.Reminder> reminders(List<MeetingCommands.Reminder> supplied) {
        List<MeetingCommands.Reminder> values = supplied == null ? List.of() : new ArrayList<>(supplied);
        require(values.size() <= 10, "MEETING_REMINDER_LIMIT", "一场会议最多配置10组提醒");
        Set<String> unique = new HashSet<>();
        for (MeetingCommands.Reminder reminder : values) {
            require(reminder != null && reminder.remindMinutesBefore() != null && reminder.remindMinutesBefore() >= 0 && reminder.remindMinutesBefore() <= 43200,
                    "MEETING_REMINDER_INVALID", "提醒提前分钟数须在0至43200之间");
            try { MessageChannelType.valueOf(reminder.channelType()); }
            catch (RuntimeException failure) { throw error("MEETING_REMINDER_INVALID", "提醒渠道无效"); }
            require(unique.add(reminder.remindMinutesBefore() + ":" + reminder.channelType()), "MEETING_REMINDER_DUPLICATE", "不能重复配置相同渠道和提前时间");
        }
        return List.copyOf(values);
    }

    public static String joinUrl(String value) {
        if (value == null || value.isBlank()) return null;
        require(value.length() <= 1000 && value.chars().noneMatch(character -> Character.isWhitespace(character) || Character.isISOControl(character))
                && value.indexOf('\\') < 0 && value.indexOf('<') < 0 && value.indexOf('>') < 0 && value.indexOf('"') < 0,
                "MEETING_LINK_INVALID", "会议链接须为不超过1000字符的安全HTTPS地址");
        try {
            URI uri = new URI(value);
            require("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null
                            && (uri.getPort() == -1 || uri.getPort() >= 1 && uri.getPort() <= 65535),
                    "MEETING_LINK_INVALID", "会议链接仅允许无账号密码的HTTPS地址");
        } catch (java.net.URISyntaxException failure) { throw error("MEETING_LINK_INVALID", "会议链接格式无效"); }
        return value;
    }

    public static Set<Integer> weekdays(String value) {
        JsonNode values = array(value, "可预约星期");
        Set<Integer> result = new LinkedHashSet<>();
        for (JsonNode day : values) {
            require(day.isIntegralNumber() && day.canConvertToInt() && day.intValue() >= 1 && day.intValue() <= 7 && result.add(day.intValue()),
                    "ROOM_RULE_INVALID", "可预约星期须为互异的1至7整数");
        }
        return Set.copyOf(result);
    }

    public static Set<String> tags(String value) {
        Set<String> result = new LinkedHashSet<>();
        for (JsonNode tag : array(value, "设备标签")) {
            require(tag.isTextual() && !tag.textValue().isBlank() && tag.textValue().length() <= 100 && result.add(tag.textValue().trim()),
                    "ROOM_RULE_INVALID", "设备标签须为互异的1至100字文本");
        }
        return Set.copyOf(result);
    }

    private static JsonNode array(String value, String label) {
        if (value == null || value.isBlank()) return JSON.createArrayNode();
        try {
            JsonNode parsed = JSON.readTree(value);
            require(parsed != null && parsed.isArray(), "ROOM_RULE_INVALID", label + "须为数组");
            return parsed;
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw error("ROOM_RULE_INVALID", label + "格式无效"); }
    }

    public static void interval(LocalDateTime start, LocalDateTime end) {
        require(start != null && end != null && start.isBefore(end), "MEETING_TIME_INVALID", "结束时间须晚于开始时间");
        require(start.getYear() >= 1000 && end.getYear() <= 9999 && start.getNano() == 0 && end.getNano() == 0,
                "MEETING_TIME_INVALID", "会议时间须在1000至9999年内，精度为秒");
    }

    public static int minimum(MeetingRoom room) { return room.getMinBookingMinutes() == null ? 1 : room.getMinBookingMinutes(); }
    public static int buffer(MeetingRoom room) { return room.getBufferMinutes() == null ? 0 : room.getBufferMinutes(); }
    private static void flag(Integer value) { require(value == null || value == 0 || value == 1, "ROOM_RULE_INVALID", "开关须为0或1"); }
    private static LocalDateTime later(LocalDateTime first, LocalDateTime second) { return first.isAfter(second) ? first : second; }
    private static LocalDateTime earlier(LocalDateTime first, LocalDateTime second) { return first.isBefore(second) ? first : second; }
    public static void require(boolean valid, String code, String message) { if (!valid) throw error(code, message); }
    public static ServiceException error(String code, String message) { return new ServiceException(code + ": " + message, 400); }
}
