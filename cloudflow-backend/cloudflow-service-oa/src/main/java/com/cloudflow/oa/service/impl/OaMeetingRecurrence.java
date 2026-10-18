package com.cloudflow.oa.service.impl;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Stream;
import net.fortuna.ical4j.model.Recur;
import net.fortuna.ical4j.util.Configurator;
import org.springframework.stereotype.Component;

@Component
public final class OaMeetingRecurrence implements AutoCloseable {
    public static final int MAX_INSTANCES = 500;
    public static final int MAX_DAYS = 3660;
    public static final int MAX_CANDIDATES_PER_PERIOD = 100000;
    public static final int TIMEOUT_MILLIS = 2000;
    public static final ZoneId STORAGE_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> FIELDS = Set.of("FREQ", "UNTIL", "COUNT", "INTERVAL", "BYSECOND", "BYMINUTE", "BYHOUR", "BYDAY",
            "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYMONTH", "BYSETPOS", "WKST");
    private static final DateTimeFormatter UNTIL = DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss'Z'", Locale.ROOT).withResolverStyle(ResolverStyle.STRICT);
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(0, 2, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), task -> {
        Thread worker = new Thread(task, "oa-meeting-recurrence");
        worker.setDaemon(true);
        return worker;
    });

    public record Occurrence(LocalDateTime startTime, LocalDateTime endTime) { }

    public List<Occurrence> expand(LocalDateTime start, LocalDateTime end, String timezoneId, String rule, LocalDate endDate) {
        OaMeetingRules.interval(start, end);
        Map<String, String> fields = fields(rule);
        ZoneId zone;
        try { zone = ZoneId.of(timezoneId); }
        catch (RuntimeException failure) { throw OaMeetingRules.error("MEETING_TIMEZONE_INVALID", "须指定有效的会议时区"); }
        OaMeetingRules.require(zone.getRules().getValidOffsets(start).size() == 1 && zone.getRules().getValidOffsets(end).size() == 1,
                "MEETING_TIMEZONE_AMBIGUOUS", "会议开始或结束处于夏令时跳变的缺失或重复时段");
        ZonedDateTime seed = start.atZone(zone);
        Duration duration = Duration.between(seed, end.atZone(zone));
        OaMeetingRules.require(!duration.isNegative() && !duration.isZero(), "MEETING_TIME_INVALID", "实际结束时间须晚于开始时间");
        ZonedDateTime horizon = seed.plusDays(MAX_DAYS);
        ZonedDateTime requestedEnd = endDate == null ? null : endDate.plusDays(1).atStartOfDay(zone).minusSeconds(1);
        if (fields.containsKey("UNTIL")) {
            ZonedDateTime until;
            try { until = LocalDateTime.parse(fields.get("UNTIL"), UNTIL).atZone(ZoneOffset.UTC); }
            catch (RuntimeException failure) { throw OaMeetingRules.error("MEETING_RECURRENCE_INVALID", "UNTIL须为有效的UTC时间yyyyMMddTHHmmssZ，可另填周期结束日期"); }
            if (requestedEnd == null || until.isBefore(requestedEnd)) requestedEnd = until;
        }
        Integer count = fields.containsKey("COUNT") ? positive(fields.get("COUNT"), "COUNT") : null;
        OaMeetingRules.require(count != null || requestedEnd != null, "MEETING_RECURRENCE_END_REQUIRED", "周期会议必须指定次数或结束条件");
        OaMeetingRules.require(requestedEnd == null || !requestedEnd.isBefore(seed), "MEETING_RECURRENCE_INVALID", "周期结束不能早于首次开始");
        boolean clipped = requestedEnd == null || requestedEnd.isAfter(horizon);
        OaMeetingRules.require(!clipped || count != null, "MEETING_RECURRENCE_HORIZON", "周期会议范围不能超过首次开始后的3660天");
        ZonedDateTime bound = clipped ? horizon : requestedEnd;
        Future<List<Occurrence>> work;
        try { work = workers.submit(() -> generate(seed, duration, rule, bound, clipped, count)); }
        catch (RejectedExecutionException busy) { throw OaMeetingRules.error("MEETING_RECURRENCE_BUSY", "周期计算繁忙，请稍后重试"); }
        try { return work.get(TIMEOUT_MILLIS, TimeUnit.MILLISECONDS); }
        catch (TimeoutException timeout) {
            work.cancel(true);
            throw OaMeetingRules.error("MEETING_RECURRENCE_COMPLEX", "周期规则超过2000毫秒计算时限，请缩短范围或简化规则");
        } catch (InterruptedException interrupted) {
            work.cancel(true);
            Thread.currentThread().interrupt();
            throw OaMeetingRules.error("MEETING_RECURRENCE_INTERRUPTED", "周期计算已中断，未生成预约");
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof com.cloudflow.common.core.exception.ServiceException business) throw business;
            throw OaMeetingRules.error("MEETING_RECURRENCE_INVALID", "周期规则无法展开，请检查日期与规则参数");
        }
    }

    private List<Occurrence> generate(ZonedDateTime seed, Duration duration, String rule, ZonedDateTime bound, boolean clipped, Integer count) {
        Recur<ZonedDateTime> recurrence = new Recur<>(rule.toUpperCase(Locale.ROOT), false);
        OaMeetingRules.require(Configurator.getIntProperty(Recur.KEY_MAX_INCREMENT_COUNT).orElse(1000) == -1,
                "MEETING_RECURRENCE_CONFIGURATION", "周期解析器配置不完整，禁止截断展开");
        List<ZonedDateTime> generated;
        try (Stream<ZonedDateTime> stream = recurrence.getDatesAsStream(seed, seed, bound, MAX_INSTANCES + 1)) {
            generated = stream.limit(MAX_INSTANCES + 1L).sorted().toList();
        }
        OaMeetingRules.require(generated.size() <= MAX_INSTANCES, "MEETING_RECURRENCE_LIMIT", "周期会议超过500个实例，请缩短范围");
        OaMeetingRules.require(!generated.isEmpty() && generated.get(0).isEqual(seed), "MEETING_RECURRENCE_START", "首次开始时间须符合周期规则");
        OaMeetingRules.require(!clipped || count != null && generated.size() == count, "MEETING_RECURRENCE_HORIZON", "周期会议不能在3660天内完成指定次数");
        List<Occurrence> result = new ArrayList<>();
        Set<LocalDateTime> unique = new HashSet<>();
        for (ZonedDateTime occurrence : generated) {
            LocalDateTime from = occurrence.withZoneSameInstant(STORAGE_ZONE).toLocalDateTime();
            LocalDateTime to = occurrence.plus(duration).withZoneSameInstant(STORAGE_ZONE).toLocalDateTime();
            OaMeetingRules.interval(from, to);
            OaMeetingRules.require(unique.add(from), "MEETING_RECURRENCE_DUPLICATE", "周期规则生成重复的实际会议时间");
            result.add(new Occurrence(from, to));
        }
        return List.copyOf(result);
    }

    private Map<String, String> fields(String rule) {
        OaMeetingRules.require(rule != null && !rule.isBlank() && rule.length() <= 1000 && rule.chars().noneMatch(Character::isWhitespace),
                "MEETING_RECURRENCE_INVALID", "周期规则须为不超过1000字符的RRULE内容");
        Map<String, String> values = new HashMap<>();
        for (String part : rule.toUpperCase(Locale.ROOT).split(";", -1)) {
            String[] pair = part.split("=", -1);
            OaMeetingRules.require(pair.length == 2 && FIELDS.contains(pair[0]) && !pair[1].isEmpty() && values.putIfAbsent(pair[0], pair[1]) == null,
                    "MEETING_RECURRENCE_INVALID", "周期规则含未知、空值或重复参数");
        }
        OaMeetingRules.require(Set.of("SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY").contains(values.getOrDefault("FREQ", "")),
                "MEETING_RECURRENCE_INVALID", "周期频率无效");
        OaMeetingRules.require(!(values.containsKey("COUNT") && values.containsKey("UNTIL")), "MEETING_RECURRENCE_INVALID", "RFC5545不允许COUNT和UNTIL同时出现");
        if (values.containsKey("INTERVAL")) positive(values.get("INTERVAL"), "INTERVAL");
        String frequency = values.get("FREQ");
        OaMeetingRules.require(!values.containsKey("BYWEEKNO") || "YEARLY".equals(frequency), "MEETING_RECURRENCE_INVALID", "BYWEEKNO仅适用于按年规则");
        OaMeetingRules.require(!values.containsKey("BYMONTHDAY") || !"WEEKLY".equals(frequency), "MEETING_RECURRENCE_INVALID", "按周规则不能使用BYMONTHDAY");
        OaMeetingRules.require(!values.containsKey("BYYEARDAY") || !Set.of("DAILY", "WEEKLY", "MONTHLY").contains(frequency), "MEETING_RECURRENCE_INVALID", "当前频率不能使用BYYEARDAY");
        OaMeetingRules.require(!values.containsKey("BYSETPOS") || values.keySet().stream().anyMatch(key -> key.startsWith("BY") && !key.equals("BYSETPOS")),
                "MEETING_RECURRENCE_INVALID", "BYSETPOS须与其他BY规则共同使用");
        int hours = size(values, "BYHOUR", 0, 23, false);
        int minutes = size(values, "BYMINUTE", 0, 59, false);
        int seconds = size(values, "BYSECOND", 0, 59, false);
        size(values, "BYMONTH", 1, 12, false);
        size(values, "BYMONTHDAY", 1, 31, true);
        size(values, "BYYEARDAY", 1, 366, true);
        size(values, "BYWEEKNO", 1, 53, true);
        size(values, "BYSETPOS", 1, 366, true);
        if (values.containsKey("BYDAY")) {
            for (String day : values.get("BYDAY").split(",", -1)) {
                OaMeetingRules.require(day.matches("([+-]?[1-9][0-9]?)?(MO|TU|WE|TH|FR|SA|SU)"), "MEETING_RECURRENCE_INVALID", "BYDAY格式无效");
                if (day.length() > 2) {
                    int ordinal = Integer.parseInt(day.substring(0, day.length() - 2));
                    OaMeetingRules.require(Math.abs(ordinal) <= 53 && Set.of("MONTHLY", "YEARLY").contains(frequency)
                                    && !("YEARLY".equals(frequency) && values.containsKey("BYWEEKNO")),
                            "MEETING_RECURRENCE_INVALID", "带序号的星期只能用于合法的月或年规则");
                }
            }
        }
        OaMeetingRules.require(!values.containsKey("WKST") || Set.of("MO", "TU", "WE", "TH", "FR", "SA", "SU").contains(values.get("WKST")),
                "MEETING_RECURRENCE_INVALID", "每周起始日无效");
        int days = "YEARLY".equals(frequency) ? 366 : "MONTHLY".equals(frequency) ? 31 : "WEEKLY".equals(frequency) ? 7 : 1;
        OaMeetingRules.require((long) days * hours * minutes * seconds <= MAX_CANDIDATES_PER_PERIOD,
                "MEETING_RECURRENCE_COMPLEX", "周期规则单次候选组合超过100000，请简化规则");
        return values;
    }

    private int positive(String value, String name) {
        try {
            int parsed = Integer.parseInt(value);
            OaMeetingRules.require(value.matches("[0-9]+") && parsed > 0, "MEETING_RECURRENCE_INVALID", name + "须为正整数");
            return parsed;
        } catch (NumberFormatException failure) { throw OaMeetingRules.error("MEETING_RECURRENCE_INVALID", name + "须为1至2147483647的整数"); }
    }

    private int size(Map<String, String> values, String key, int minimum, int maximum, boolean signed) {
        if (!values.containsKey(key)) return 1;
        Set<Integer> distinct = new HashSet<>();
        for (String part : values.get(key).split(",", -1)) {
            try {
                int parsed = Integer.parseInt(part);
                long magnitude = signed ? Math.abs((long) parsed) : parsed;
                OaMeetingRules.require(part.matches(signed ? "[+-]?[0-9]+" : "[0-9]+") && magnitude >= minimum && magnitude <= maximum && distinct.add(parsed),
                        "MEETING_RECURRENCE_INVALID", key + "包含重复或超范围取值");
            } catch (NumberFormatException failure) { throw OaMeetingRules.error("MEETING_RECURRENCE_INVALID", key + "取值无效"); }
        }
        return distinct.size();
    }

    @Override
    @PreDestroy
    public void close() { workers.shutdownNow(); }
}
