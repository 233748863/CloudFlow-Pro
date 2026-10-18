package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.oa.config.OaJacksonConfig;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Properties;
import java.util.Set;
import java.util.function.BiFunction;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

public final class OaMeetingRulesChecks {
    private static int assertions;
    private static final LocalDateTime START = LocalDateTime.of(2028, 1, 3, 9, 0);
    private static final BiFunction<Long, LocalDate, DayTypeInfo> WORKDAY = (calendarId, date) -> new DayTypeInfo(date, "WORKDAY", null, 0);

    public static void main(String[] arguments) {
        previewProjection(); configuration(); booking(); conflicts(); transitions(); invitationsAndLinks(); recurrence(); photoTransportSettings();
        System.out.println("MEETING_H4_RULES: assertions=" + assertions + "; failed=0; real_ical4j=true; database=false; http=false");
    }

    private record SecretProjection(String accessToken, String password) { }

    private static void previewProjection() {
        Jackson2ObjectMapperBuilder builder = new org.springframework.http.converter.json.Jackson2ObjectMapperBuilder();
        OaJacksonConfig configuration = new com.cloudflow.oa.config.OaJacksonConfig();
        configuration.oaJacksonCustomizer().customize(builder);
        new com.cloudflow.common.sensitive.config.SensitiveAutoConfiguration().cloudFlowSensitiveJacksonCustomizer().customize(builder);
        ObjectMapper mapper = configuration.objectMapper(builder);
        String digest = "a".repeat(64);
        JsonNode rule = mapper.valueToTree(new com.cloudflow.oa.domain.vo.MeetingViews.RulePreview(List.of(), digest, "规则预检"));
        equal(digest, rule.path("impactDigest").asText(), "真实脱敏配置保留规则预检校验值");
        JsonNode series = mapper.valueToTree(new com.cloudflow.oa.domain.vo.MeetingViews.SeriesPreview(List.of(), digest, true,
                new com.cloudflow.oa.domain.vo.MeetingViews.ParticipantConflicts(List.of(), true, null)));
        equal(digest, series.path("impactDigest").asText(), "真实脱敏配置保留周期预检校验值");
        JsonNode secrets = mapper.valueToTree(new SecretProjection("fixture-access", "fixture-password"));
        equal("******", secrets.path("accessToken").asText(), "真实访问令牌仍被隐藏");
        equal("******", secrets.path("password").asText(), "真实密码字段仍被隐藏");
    }

    private static void photoTransportSettings() {
        YamlPropertiesFactoryBean yaml = new org.springframework.beans.factory.config.YamlPropertiesFactoryBean();
        yaml.setResources(new org.springframework.core.io.ClassPathResource("application.yml"));
        Properties properties = Objects.requireNonNull(yaml.getObject());
        equal("3000", properties.getProperty("spring.cloud.openfeign.client.config.meetingRoomFiles.connect-timeout"), "照片连接时限3000毫秒");
        equal("10000", properties.getProperty("spring.cloud.openfeign.client.config.meetingRoomFiles.read-timeout"), "照片读取时限10000毫秒");
        Class<?> remote = com.cloudflow.oa.service.remote.RemoteMeetingRoomFileService.class;
        for (Method method : remote.getDeclaredMethods()) {
            String circuit = feign.Feign.configKey(remote, method).replaceAll("[^a-zA-Z0-9]", "");
            equal("15s", properties.getProperty("resilience4j.timelimiter.instances." + circuit + ".timeout-duration"), "实际Feign方法" + method.getName() + "总时限15秒，不被默认1秒截断");
        }
        equal("3000", properties.getProperty("spring.cloud.openfeign.client.config.oaRemoteWorkflowService.connect-timeout"), "会议审批连接时限3000毫秒");
        equal("10000", properties.getProperty("spring.cloud.openfeign.client.config.oaRemoteWorkflowService.read-timeout"), "会议审批读取时限10000毫秒");
        Class<?> workflow = com.cloudflow.oa.service.remote.RemoteWorkflowService.class;
        for (Method method : workflow.getDeclaredMethods()) {
            if (!Set.of("startProcessInternal", "invalidateByBusiness").contains(method.getName())) continue;
            String circuit = feign.Feign.configKey(workflow, method).replaceAll("[^a-zA-Z0-9]", "");
            equal("15s", properties.getProperty("resilience4j.timelimiter.instances." + circuit + ".timeout-duration"), "会议审批" + method.getName() + "总时限15秒");
        }
    }

    private static MeetingRoom room() {
        MeetingRoom room = new MeetingRoom();
        room.setRoomId(1L); room.setTenantId(100000L); room.setName("规则检查室"); room.setStatus("1"); room.setDeleted(0);
        room.setCapacity(10); room.setBufferMinutes(10); room.setMinBookingMinutes(15); room.setMaxBookingMinutes(120);
        room.setHolidayBookableFlag(0); room.setNeedApprovalFlag(0);
        return room;
    }

    private static void configuration() {
        MeetingRoom room = room(); OaMeetingRules.room(room); pass("有效房间规则");
        room.setOpenTime(LocalTime.of(8, 0)); reject("ROOM_RULE_INVALID", () -> OaMeetingRules.room(room), "开放时间须成对");
        room.setCloseTime(LocalTime.of(8, 0)); reject("ROOM_RULE_INVALID", () -> OaMeetingRules.room(room), "开放区间须有长度");
        room.setCloseTime(LocalTime.of(18, 0)); OaMeetingRules.room(room); pass("合法开放区间");
        room.setMinBookingMinutes(0); reject("ROOM_RULE_INVALID", () -> OaMeetingRules.room(room), "最短时长非零"); room.setMinBookingMinutes(15);
        room.setMaxBookingMinutes(10); reject("ROOM_RULE_INVALID", () -> OaMeetingRules.room(room), "最长不小于最短"); room.setMaxBookingMinutes(120);
        room.setAdvanceBookingDays(-1); reject("ROOM_RULE_INVALID", () -> OaMeetingRules.room(room), "提前天数非负"); room.setAdvanceBookingDays(null);
        room.setBufferMinutes(-1); reject("ROOM_RULE_INVALID", () -> OaMeetingRules.room(room), "缓冲非负"); room.setBufferMinutes(0);
        room.setNeedApprovalFlag(1); reject("ROOM_APPROVER_REQUIRED", () -> OaMeetingRules.room(room), "审批需负责人"); room.setApproverId(2L);
        OaMeetingRules.room(room); pass("有效审批人配置");
        equal(Set.of(1, 5), OaMeetingRules.weekdays("[1,5]"), "星期解析");
        for (String invalid : List.of("[0]", "[8]", "[1,1]", "[\"1\"]", "[1.0]", "[2147483648]", "{}", "[null]", "bad")) {
            reject("ROOM_RULE_INVALID", () -> OaMeetingRules.weekdays(invalid), "拒绝无效星期" + invalid);
        }
        equal(Set.of(), OaMeetingRules.weekdays(null), "未配置星期保留每日可用");
        equal(Set.of("投影仪", "白板"), OaMeetingRules.tags("[\"投影仪\",\"白板\"]"), "设备标签");
        for (String invalid : List.of("[\"\"]", "[\" \" ]", "[3]", "[\"白板\",\"白板\"]", "[null]")) {
            reject("ROOM_RULE_INVALID", () -> OaMeetingRules.tags(invalid), "拒绝非法设备标签");
        }
    }

    private static void booking() {
        MeetingRoom room = room();
        OaMeetingRules.booking(room, START, START.plusMinutes(15), 10, START.minusDays(1), 240, WORKDAY); pass("容量与最短边界");
        reject("ROOM_CAPACITY_EXCEEDED", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 11, null, 240, WORKDAY), "超容量");
        reject("ROOM_DURATION_TOO_SHORT", () -> OaMeetingRules.booking(room, START, START.plusMinutes(15).minusSeconds(1), 1, null, 240, WORKDAY), "时长秒级边界");
        reject("ROOM_DURATION_TOO_LONG", () -> OaMeetingRules.booking(room, START, START.plusHours(2).plusSeconds(1), 1, null, 240, WORKDAY), "最长时长边界");
        reject("MEETING_IN_PAST", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, START.plusMinutes(2), 240, WORKDAY), "禁止过去预约");
        room.setAdvanceBookingDays(7);
        OaMeetingRules.booking(room, START, START.plusHours(1), 1, START.minusDays(7), 240, WORKDAY); pass("第七天可预约");
        reject("ROOM_ADVANCE_EXCEEDED", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, START.minusDays(8), 240, WORKDAY), "第八天拒绝");
        room.setOpenTime(LocalTime.of(9, 0)); room.setCloseTime(LocalTime.of(18, 0));
        reject("ROOM_OUTSIDE_OPENING", () -> OaMeetingRules.booking(room, START.minusSeconds(1), START.plusHours(1), 1, null, null, WORKDAY), "开放前一秒");
        room.setMaxBookingMinutes(null);
        reject("ROOM_OUTSIDE_OPENING", () -> OaMeetingRules.booking(room, START, START.plusDays(1), 1, null, null, WORKDAY), "跨日不能穿越关闭时段");
        room.setOpenTime(null); room.setCloseTime(null);
        OaMeetingRules.booking(room, START, START.plusDays(1), 1, null, null, WORKDAY); pass("旧未配规则不增加默认关闭时段");
        reject("ROOM_DURATION_TOO_LONG", () -> OaMeetingRules.booking(room, START, START.plusHours(5), 1, null, 240, WORKDAY), "旧全局时长限制保留");
        room.setHolidayCalendarId(100L);
        reject("ROOM_CALENDAR_UNVERIFIED", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, null, null, (id, date) -> null), "未核定日历拒绝");
        reject("ROOM_CALENDAR_UNVERIFIED", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, null, null, (id, date) -> new DayTypeInfo(date, null, null, null)), "无类型日期拒绝");
        reject("ROOM_DAY_CLOSED", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, null, null, (id, date) -> new DayTypeInfo(date, "HOLIDAY", "测试假期", 1)), "法定假拒绝");
        room.setHolidayBookableFlag(1);
        OaMeetingRules.booking(room, START, START.plusHours(1), 1, null, null, (id, date) -> new DayTypeInfo(date, "HOLIDAY", "测试假期", 1)); pass("显式启用节假日");
        room.setBookableWeekdays("[2,3,4,5]");
        reject("ROOM_DAY_CLOSED", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, null, null, WORKDAY), "调休仍遵守开放星期");
        room.setBookableWeekdays("[1,2,3,4,5,6,7]"); room.setOpenTime(LocalTime.of(9, 0)); room.setCloseTime(LocalTime.of(17, 0));
        List<OaMeetingRules.Window> windows = OaMeetingRules.windows(room, START.minusHours(1), START.plusDays(1).plusHours(9), WORKDAY);
        equal(2, windows.size(), "跨日开放窗口数量");
        equal(16L * 3600, OaMeetingRules.intersectSeconds(windows, START.minusHours(2), START.plusDays(2)), "两天人工核算960分钟");
        equal(2L * 3600, OaMeetingRules.intersectSeconds(windows, START.plusHours(7), START.plusDays(1).plusHours(1)), "跨关闭时间仅计120分钟");
        room.setStatus("0"); reject("ROOM_UNAVAILABLE", () -> OaMeetingRules.booking(room, START, START.plusHours(1), 1, null, null, WORKDAY), "停用会议室拒绝预约");
    }

    private static SysScheduleEvent meeting() {
        SysScheduleEvent event = new SysScheduleEvent(); event.setStartTime(START); event.setEndTime(START.plusHours(1));
        event.setStatus("PLANNED"); event.setApprovalStatus("NOT_REQUIRED"); event.setRecurrenceRole("SINGLE"); event.setDeleted(0); event.setBufferMinutesSnapshot(10);
        return event;
    }

    private static void conflicts() {
        SysScheduleEvent event = meeting();
        check(!OaMeetingRules.overlaps(START.plusMinutes(70), START.plusMinutes(90), 10, event), "十分钟缓冲只扩会后一次");
        check(OaMeetingRules.overlaps(START.plusMinutes(70).minusSeconds(1), START.plusMinutes(90), 10, event), "缓冲内一秒冲突");
        check(!OaMeetingRules.overlaps(START.minusHours(1), START.minusMinutes(10), 10, event), "新预约的会后缓冲恰好接边");
        check(OaMeetingRules.overlaps(START.minusHours(1), START.minusMinutes(9), 10, event), "反向缓冲同样冲突");
        for (String excluded : List.of("CANCELLED", "NOT_HELD")) { event.setStatus(excluded); check(!OaMeetingRules.occupied(event), excluded + "释放占位"); }
        event.setStatus("PLANNED"); event.setApprovalStatus("DRAFT"); check(!OaMeetingRules.occupied(event), "草稿不占位");
        event.setApprovalStatus("PENDING"); check(OaMeetingRules.occupied(event), "待审批占位");
        event.setRecurrenceRole("SERIES"); check(!OaMeetingRules.occupied(event), "主行不占位");
        event.setRecurrenceRole("INSTANCE"); event.setStatus("COMPLETED"); check(OaMeetingRules.occupied(event), "实际已完成保留历史占用");
    }

    private static void transitions() {
        equal(Set.of("PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NOT_HELD"), OaMeetingRules.STATUSES, "会议恰好五态");
        for (String source : OaMeetingRules.STATUSES) {
            for (String target : OaMeetingRules.STATUSES) {
                SysScheduleEvent event = meeting(); event.setStatus(source);
                boolean valid = "PLANNED".equals(source) && Set.of("IN_PROGRESS", "CANCELLED", "NOT_HELD").contains(target)
                        || "IN_PROGRESS".equals(source) && "COMPLETED".equals(target);
                if (valid) { OaMeetingRules.transition(event, target, false, "测试原因", START); pass(source + "至" + target); }
                else reject("MEETING_STATE_INVALID", () -> OaMeetingRules.transition(event, target, false, "测试原因", START), "非法流转" + source + "至" + target);
            }
        }
        SysScheduleEvent event = meeting(); event.setApprovalStatus("PENDING");
        reject("MEETING_APPROVAL_REQUIRED", () -> OaMeetingRules.transition(event, "IN_PROGRESS", true, null, START), "管理员也不能跳过审批");
        event.setApprovalStatus("APPROVED");
        reject("MEETING_START_WINDOW", () -> OaMeetingRules.transition(event, "IN_PROGRESS", false, null, START.minusSeconds(1)), "禁止提前开始");
        reject("MEETING_START_WINDOW", () -> OaMeetingRules.transition(event, "IN_PROGRESS", false, null, event.getEndTime()), "禁止结束后才开始");
        event.setStatus("IN_PROGRESS");
        reject("MEETING_REASON_REQUIRED", () -> OaMeetingRules.transition(event, "CANCELLED", true, null, START), "管理者取消已开始会议须原因");
        OaMeetingRules.transition(event, "CANCELLED", true, "中途取消", START); pass("管理者取消保留已开始事实");
    }

    private static void invitationsAndLinks() {
        equal(Set.of("NONE", "ACCEPTED", "DECLINED", "TENTATIVE"), OaMeetingRules.RESPONSES, "邀请与CRM四态对齐");
        equal(2, OaMeetingRules.reminders(List.of(new MeetingCommands.Reminder(0, "INTERNAL"), new MeetingCommands.Reminder(43200, "EMAIL"))).size(), "提醒两端边界");
        for (int invalid : List.of(-1, 43201)) reject("MEETING_REMINDER_INVALID", () -> OaMeetingRules.reminders(List.of(new MeetingCommands.Reminder(invalid, "INTERNAL"))), "提醒范围");
        reject("MEETING_REMINDER_DUPLICATE", () -> OaMeetingRules.reminders(List.of(new MeetingCommands.Reminder(5, "EMAIL"), new MeetingCommands.Reminder(5, "EMAIL"))), "提醒不能重复");
        List<MeetingCommands.Reminder> many = new ArrayList<>(); for (int index = 0; index < 11; index++) many.add(new MeetingCommands.Reminder(index, "INTERNAL"));
        reject("MEETING_REMINDER_LIMIT", () -> OaMeetingRules.reminders(many), "提醒十组上限");
        List<MeetingCommands.Reminder> missing = new ArrayList<>(); missing.add(null);
        reject("MEETING_REMINDER_INVALID", () -> OaMeetingRules.reminders(missing), "空提醒须业务错误");
        equal("https://meeting.example.test/join?code=abc", OaMeetingRules.joinUrl("https://meeting.example.test/join?code=abc"), "HTTPS链接保留");
        for (String invalid : List.of("javascript:alert(1)", "http://meeting.test", "//meeting.test", "https://user:secret@meeting.test", "https://meeting.test\n", "https://meeting.test\\evil", "https://meeting.test:65536", "https://meeting.test/\"<script>")) {
            reject("MEETING_LINK_INVALID", () -> OaMeetingRules.joinUrl(invalid), "非法链接" + invalid.replace('\n', ' '));
        }
    }

    private static void recurrence() {
        try (OaMeetingRecurrence rules = new OaMeetingRecurrence()) {
            equal(3, rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;COUNT=3", null).size(), "每日三次");
            List<OaMeetingRecurrence.Occurrence> weekdays = rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", null);
            equal(START.plusDays(9), weekdays.get(3).startTime(), "周一周三交替");
            LocalDateTime monthEnd = LocalDateTime.of(2028, 1, 31, 9, 0);
            List<OaMeetingRecurrence.Occurrence> monthly = rules.expand(monthEnd, monthEnd.plusHours(1), "Asia/Shanghai", "FREQ=MONTHLY;COUNT=3", null);
            equal(monthEnd.plusMonths(2), monthly.get(1).startTime(), "每月31号跳过无效日期");
            equal(monthEnd.plusMonths(4), monthly.get(2).startTime(), "五月31号保留");
            LocalDateTime friday = LocalDateTime.of(2028, 1, 28, 9, 0);
            List<OaMeetingRecurrence.Occurrence> lastFriday = rules.expand(friday, friday.plusHours(1), "Asia/Shanghai", "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;COUNT=3", null);
            equal(LocalDateTime.of(2028, 2, 25, 9, 0), lastFriday.get(1).startTime(), "每月最后周五");
            LocalDateTime leap = LocalDateTime.of(2028, 2, 29, 9, 0);
            List<OaMeetingRecurrence.Occurrence> leapDays = rules.expand(leap, leap.plusHours(1), "Asia/Shanghai", "FREQ=YEARLY;COUNT=3", null);
            equal(LocalDateTime.of(2036, 2, 29, 9, 0), leapDays.get(2).startTime(), "闰日按真实年份跳过");
            List<OaMeetingRecurrence.Occurrence> sparse = rules.expand(leap, leap.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;COUNT=2", null);
            equal(LocalDateTime.of(2032, 2, 29, 9, 0), sparse.get(1).startTime(), "超过默认1000次空候选仍不截断");
            equal(2, rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;COUNT=999", START.toLocalDate().plusDays(1)).size(), "结束日期早于COUNT");
            equal(2, rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;UNTIL=20280104T010000Z", null).size(), "UTC UNTIL包含等值结束边界");
            equal(1, rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;UNTIL=20280104T005959Z", null).size(), "UTC UNTIL前一秒排除下一次");
            equal(500, rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;COUNT=500", null).size(), "500实例允许");
            reject("MEETING_RECURRENCE_LIMIT", () -> rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY;COUNT=501", null), "501实例明确拒绝");
            reject("MEETING_RECURRENCE_END_REQUIRED", () -> rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=DAILY", null), "无结束条件拒绝");
            reject("MEETING_RECURRENCE_HORIZON", () -> rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=YEARLY;COUNT=12", null), "3660天不足次数拒绝");
            reject("MEETING_RECURRENCE_HORIZON", () -> rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=YEARLY", START.toLocalDate().plusDays(3661)), "结束日期超上限拒绝");
            reject("MEETING_RECURRENCE_START", () -> rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=WEEKLY;BYDAY=TU;COUNT=3", null), "首次须匹配规则");
            for (String invalid : List.of("FREQ=DAILY;COUNT=0", "FREQ=DAILY;COUNT=2;COUNT=3", "FREQ=DAILY;COUNT=2;UNTIL=20280104T010000Z", "FREQ=DAILY;INTERVAL=0;COUNT=2",
                    "FREQ=DAILY;COUNT=2;X-NETWORK=https://example.test", "FREQ=DAILY;BYHOUR=24;COUNT=2", "FREQ=WEEKLY;BYMONTHDAY=1;COUNT=2",
                    "FREQ=DAILY;BYSETPOS=1;COUNT=2", "FREQ=DAILY;BYDAY=1MO;COUNT=2", "FREQ=DAILY;BYSECOND=60;COUNT=2", "FREQ=DAILY;BYMINUTE=1,1;COUNT=2",
                    "FREQ=DAILY;UNTIL=20280230T010000Z", "FREQ=DAILY;UNTIL=20280104")) {
                reject("MEETING_RECURRENCE_INVALID", () -> rules.expand(START, START.plusHours(1), "Asia/Shanghai", invalid, null), "拒绝非法RRULE " + invalid);
            }
            reject("MEETING_TIMEZONE_INVALID", () -> rules.expand(START, START.plusHours(1), "Unknown/Zone", "FREQ=DAILY;COUNT=2", null), "无效时区拒绝");
            LocalDateTime ambiguous = LocalDateTime.of(2028, 11, 5, 1, 30);
            reject("MEETING_TIMEZONE_AMBIGUOUS", () -> rules.expand(ambiguous, ambiguous.plusHours(1), "America/New_York", "FREQ=DAILY;COUNT=2", null), "夏令时重复小时不默选");
            equal(2, rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=HOURLY;INTERVAL=2;COUNT=2", null).size(), "按小时规则受同样边界保护");
            equal(START.plusHours(2), rules.expand(START, START.plusHours(1), "Asia/Shanghai", "FREQ=HOURLY;INTERVAL=2;COUNT=2", null).get(1).startTime(), "小时时间正确");
        }
    }

    private static void reject(String code, Runnable action, String label) {
        try { action.run(); throw new AssertionError(label + "未拒绝"); }
        catch (ServiceException failure) { check(failure.getMessage().startsWith(code + ":"), label + "错误码=" + failure.getMessage()); }
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); pass(label); }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + " expected=" + expected + " actual=" + actual); }
    private static void pass(String label) { assertions++; System.out.println("PASS " + label); }
}
