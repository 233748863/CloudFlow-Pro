package com.cloudflow.common.holiday.service;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.api.HolidayCalendarCalculation;
import com.cloudflow.common.holiday.api.EmployeeCalendarCalculationBatch;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.holiday.domain.EmployeeCalendarDay;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.support.RuntimeContextBridge;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 节假日日历计算实现。
 */
@Service
public class HolidayCalendarServiceImpl implements HolidayCalendarService, SmartInitializingSingleton {
    private static final Duration YEAR_CACHE_TTL = Duration.ofHours(24);
    private static final Duration EMPLOYEE_CACHE_TTL = Duration.ofHours(1);

    private final HolidayCalendarMapper calendarMapper;
    private final HolidayDateMapper dateMapper;
    private final HolidayResolverMapper resolverMapper;
    private final RedisCache redisCache;
    private final HolidayCacheEpoch cacheEpoch;
    private volatile Boolean shiftCalendarColumnAvailable;

    public HolidayCalendarServiceImpl(HolidayCalendarMapper calendarMapper, HolidayDateMapper dateMapper,
                                      HolidayResolverMapper resolverMapper, RedisCache redisCache) {
        this.calendarMapper = calendarMapper;
        this.dateMapper = dateMapper;
        this.resolverMapper = resolverMapper;
        this.redisCache = redisCache;
        this.cacheEpoch = new HolidayCacheEpoch(redisCache);
    }

    @Override
    public void afterSingletonsInstantiated() {
        initializeSchemaMetadata();
    }

    public void initializeSchemaMetadata() {
        hasShiftCalendarColumn();
    }

    private boolean hasShiftCalendarColumn() {
        Boolean available = shiftCalendarColumnAvailable;
        if (available != null) return available;
        synchronized (this) {
            if (shiftCalendarColumnAvailable == null) {
                shiftCalendarColumnAvailable = resolverMapper.hasShiftCalendarColumn();
            }
            return shiftCalendarColumnAvailable;
        }
    }

    @Override
    public Long resolveCalendarId(Long employeeId, LocalDate date) {
        if (employeeId == null || date == null) {
            throw new ServiceException("员工和日期不能为空");
        }
        String revision = cacheEpoch.current("assignments");
        String remoteKey = "holiday:emp:v2:" + revision + ":" + employeeId + ":" + date;
        try {
            Object remote = revision == null ? null : redisCache.getCacheObject(remoteKey);
            Long remoteId = remote instanceof Number number ? number.longValue() : remote == null ? null : Long.valueOf(String.valueOf(remote));
            if (remoteId != null) {
                return remoteId;
            }
        } catch (RuntimeException ignored) {
        }

        Long calendarId = null;
        if (hasShiftCalendarColumn()) {
            Long shiftId = resolverMapper.selectAssignedShiftId(employeeId, date, tenantId());
            if (shiftId != null) calendarId = resolverMapper.selectShiftCalendarId(shiftId, tenantId());
        }
        if (calendarId == null) {
            Long deptId = resolverMapper.selectEmployeeDeptId(employeeId, tenantId());
            if (deptId != null) calendarId = resolverMapper.selectDeptCalendarId(deptId, tenantId());
        }
        if (calendarId == null) {
            HolidayCalendar defaultCalendar = calendarMapper.selectDefaultEnabled(tenantId());
            if (defaultCalendar != null) calendarId = defaultCalendar.getCalendarId();
        }
        if (calendarId == null) {
            throw new ServiceException("未配置节假日日历，请联系管理员");
        }
        try {
            if (revision != null) redisCache.setCacheObject(remoteKey,
                    calendarId, EMPLOYEE_CACHE_TTL.toSeconds(), java.util.concurrent.TimeUnit.SECONDS);
        } catch (RuntimeException ignored) {
        }
        return calendarId;
    }

    @Override
    public boolean isWorkday(Long calendarId, LocalDate date) {
        return "WORKDAY".equalsIgnoreCase(getDateType(calendarId, date).getDateType());
    }

    @Override
    public int countWorkdays(Long calendarId, LocalDate start, LocalDate end) {
        if (start == null || end == null) throw new ServiceException("日期范围不能为空");
        LocalDate from = start.isAfter(end) ? end : start;
        LocalDate to = start.isAfter(end) ? start : end;
        CalendarDates dates = new CalendarDates(calendarId, from);
        int count = 0;
        for (LocalDate cursor = from; !cursor.isAfter(to); cursor = cursor.plusDays(1)) {
            if (dates.isWorkday(cursor)) count++;
        }
        return start.isAfter(end) ? -count : count;
    }

    @Override
    public BigDecimal calcLeaveDays(Long calendarId, LocalDateTime start, LocalDateTime end, boolean includeHoliday) {
        if (start == null || end == null) throw new ServiceException("请假时间不能为空");
        if (end.isBefore(start)) return calcLeaveDays(calendarId, end, start, includeHoliday).negate();
        return calcLeaveDays(new CalendarDates(calendarId, start.toLocalDate()), start, end, includeHoliday);
    }

    private BigDecimal calcLeaveDays(CalendarDates dates, LocalDateTime start, LocalDateTime end, boolean includeHoliday) {
        if (start == null || end == null) throw new ServiceException("请假时间不能为空");
        if (end.isBefore(start)) return calcLeaveDays(dates, end, start, includeHoliday).negate();
        LocalDate first = start.toLocalDate();
        LocalDate last = end.toLocalDate();
        HolidayCalendar calendar = dates.calendar;
        BigDecimal total = BigDecimal.ZERO;
        for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
            boolean workday = dates.isWorkday(date);
            if (!workday && !includeHoliday) continue;
            LocalTime dayStart = date.equals(first) ? start.toLocalTime() : calendar.getWorkStartTime();
            LocalTime dayEnd = date.equals(last) ? end.toLocalTime() : calendar.getWorkEndTime();
            LocalTime effectiveStart = max(dayStart, calendar.getWorkStartTime());
            LocalTime effectiveEnd = min(dayEnd, calendar.getWorkEndTime());
            if (!effectiveEnd.isAfter(effectiveStart)) continue;
            // 半天规则以午休开始时间为分界：跨过分界计全天，同侧计半天。
            LocalTime lunchBoundary = calendar.getLunchStartTime() == null
                    ? LocalTime.NOON : calendar.getLunchStartTime();
            boolean crossesLunch = effectiveStart.isBefore(lunchBoundary)
                    && effectiveEnd.isAfter(lunchBoundary);
            total = total.add(crossesLunch ? BigDecimal.ONE : new BigDecimal("0.5"));
        }
        return total.setScale(1, RoundingMode.UNNECESSARY);
    }

    @Override
    public long calcWorkMinutes(Long calendarId, LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) throw new ServiceException("工作时间不能为空");
        if (end.isBefore(start)) return -calcWorkMinutes(calendarId, end, start);
        return calcWorkMinutes(new CalendarDates(calendarId, start.toLocalDate()), start, end);
    }

    private long calcWorkMinutes(CalendarDates dates, LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) throw new ServiceException("工作时间不能为空");
        if (end.isBefore(start)) return -calcWorkMinutes(dates, end, start);
        HolidayCalendar calendar = dates.calendar;
        long total = 0;
        for (LocalDate date = start.toLocalDate(); !date.isAfter(end.toLocalDate()); date = date.plusDays(1)) {
            if (!dates.isWorkday(date)) continue;
            LocalDateTime dayStart = LocalDateTime.of(date, calendar.getWorkStartTime());
            LocalDateTime dayEnd = LocalDateTime.of(date, calendar.getWorkEndTime());
            LocalDateTime actualStart = start.isAfter(dayStart) ? start : dayStart;
            LocalDateTime actualEnd = end.isBefore(dayEnd) ? end : dayEnd;
            if (!actualEnd.isAfter(actualStart)) continue;
            long minutes = ChronoUnit.MINUTES.between(actualStart, actualEnd);
            LocalDateTime lunchStart = LocalDateTime.of(date, calendar.getLunchStartTime());
            LocalDateTime lunchEnd = LocalDateTime.of(date, calendar.getLunchEndTime());
            LocalDateTime overlapStart = actualStart.isAfter(lunchStart) ? actualStart : lunchStart;
            LocalDateTime overlapEnd = actualEnd.isBefore(lunchEnd) ? actualEnd : lunchEnd;
            if (overlapEnd.isAfter(overlapStart)) minutes -= ChronoUnit.MINUTES.between(overlapStart, overlapEnd);
            total += Math.max(0, minutes);
        }
        return total;
    }

    @Override
    public LocalDate nextWorkday(Long calendarId, LocalDate from, int n) {
        if (from == null) throw new ServiceException("起始日期不能为空");
        if (n == 0) return from;
        CalendarDates dates = new CalendarDates(calendarId, from);
        int direction = n > 0 ? 1 : -1;
        int remain = Math.abs(n);
        LocalDate cursor = from;
        while (remain > 0) {
            cursor = cursor.plusDays(direction);
            if (dates.isWorkday(cursor)) remain--;
        }
        return cursor;
    }

    @Override
    public DayTypeInfo getDateType(Long calendarId, LocalDate date) {
        if (date == null) throw new ServiceException("日期不能为空");
        return new CalendarDates(calendarId, date).get(date);
    }

    @Override
    public Map<LocalDate, DayTypeInfo> getEmployeeDateTypes(Long employeeId, List<LocalDate> dates) {
        Map<LocalDate, DayTypeInfo> result = new LinkedHashMap<>();
        getEmployeeCalculations(employeeId, dates).forEach((date, calculation) -> result.put(date, calculation.getDateType(date)));
        return result;
    }

    @Override
    public Map<LocalDate, HolidayCalendarCalculation> getEmployeeCalculations(Long employeeId, List<LocalDate> dates) {
        return getEmployeeCalculationBatch(employeeId, dates).calculations();
    }

    @Override
    public EmployeeCalendarCalculationBatch getEmployeeCalculationBatch(Long employeeId, List<LocalDate> dates) {
        if (employeeId == null || dates == null || dates.stream().anyMatch(Objects::isNull)) {
            throw new ServiceException("员工和日期不能为空");
        }
        if (dates.isEmpty()) return new EmployeeCalendarCalculationBatch(List.of(), Map.of());
        // Read within the caller's transaction. Do not share this snapshot across requests or tenants.
        List<EmployeeCalendarDay> assigned = hasShiftCalendarColumn()
                ? resolverMapper.selectEmployeeCalendarDays(employeeId, dates, tenantId())
                : dates.stream().map(date -> new EmployeeCalendarDay(date, null, null)).toList();
        Long fallback = null;
        if (assigned.stream().anyMatch(day -> day.calendarId() == null)) {
            Long department = resolverMapper.selectEmployeeDeptId(employeeId, tenantId());
            if (department != null) fallback = resolverMapper.selectDeptCalendarId(department, tenantId());
            if (fallback == null) {
                HolidayCalendar calendar = calendarMapper.selectDefaultEnabled(tenantId());
                if (calendar != null) fallback = calendar.getCalendarId();
            }
            if (fallback == null) throw new ServiceException("未配置节假日日历，请联系管理员");
        }
        Map<Long, CalendarDates> calendars = new HashMap<>();
        Map<LocalDate, HolidayCalendarCalculation> result = new LinkedHashMap<>();
        for (EmployeeCalendarDay day : assigned) {
            Long calendarId = day.calendarId() == null ? fallback : day.calendarId();
            CalendarDates calendar = calendars.computeIfAbsent(calendarId, key -> new CalendarDates(key, day.attendanceDate()));
            result.put(day.attendanceDate(), calendar);
        }
        if (result.size() != new java.util.HashSet<>(dates).size()) throw new ServiceException("员工日历日期解析不完整");
        return new EmployeeCalendarCalculationBatch(assigned, result);
    }

    public void evictCalendar(Long calendarId, Integer year) {
        if (calendarId == null) return;
        if (year == null) {
            cacheEpoch.invalidate("calendar:" + calendarId, "assignments");
        } else {
            cacheEpoch.invalidate("year:" + calendarId + ":" + year);
        }
    }

    @Override
    public void invalidateAssignments() {
        cacheEpoch.invalidate("assignments");
    }

    private YearCalendar yearDetails(Long calendarId, int year) {
        if (calendarId == null) throw new ServiceException("节假日日历ID不能为空");
        String revision = cacheEpoch.current("calendar:" + calendarId, "year:" + calendarId + ":" + year);
        String remoteKey = "holiday:cal:v3:" + calendarId + ":" + year + ":" + revision;
        try {
            Object remote = revision == null ? null : redisCache.getCacheObject(remoteKey);
            if (remote instanceof Map<?, ?> remoteMap && remoteMap.get("calendar") instanceof HolidayCalendar cachedCalendar
                    && remoteMap.get("dates") instanceof Map<?, ?> remoteDates) {
                if (!Objects.equals(cachedCalendar.getCalendarId(), calendarId) || !Objects.equals(cachedCalendar.getTenantId(), tenantId())
                        || !"ENABLED".equals(cachedCalendar.getStatus()) || !Integer.valueOf(0).equals(cachedCalendar.getDeleted())
                        || cachedCalendar.getWorkStartTime() == null || cachedCalendar.getWorkEndTime() == null
                        || cachedCalendar.getLunchStartTime() == null || cachedCalendar.getLunchEndTime() == null) {
                    throw new IllegalArgumentException("节假日日历缓存内容无效");
                }
                Map<LocalDate, DayTypeInfo> restored = new HashMap<>();
                for (Map.Entry<?, ?> entry : remoteDates.entrySet()) {
                    LocalDate date = LocalDate.parse(String.valueOf(entry.getKey()));
                    String[] parts = String.valueOf(entry.getValue()).split("\\|", -1);
                    int triplePay = "HOLIDAY".equalsIgnoreCase(parts[0]) ? 1 : 0;
                    String name = parts.length > 1 ? parts[1] : null;
                    if (parts.length > 2) {
                        triplePay = Integer.parseInt(parts[parts.length - 1]);
                        name = String.join("|", Arrays.copyOfRange(parts, 1, parts.length - 1));
                    }
                    if (!List.of("WORKDAY", "HOLIDAY", "REST").contains(parts[0]) || (triplePay != 0 && triplePay != 1)
                            || date.getYear() != year) throw new IllegalArgumentException("节假日缓存内容无效");
                    restored.put(date, new DayTypeInfo(date, parts[0], name == null || name.isEmpty() ? null : name, triplePay));
                }
                return new YearCalendar(cachedCalendar, Collections.unmodifiableMap(restored));
            }
        } catch (RuntimeException ignored) {
        }
        HolidayCalendar calendar = getCalendar(calendarId);
        List<HolidayDate> rows = dateMapper.selectCalendarYear(tenantId(), calendarId, year);
        Map<LocalDate, DayTypeInfo> result = new HashMap<>();
        for (HolidayDate row : rows) {
            Integer triplePay = row.getTriplePayFlag();
            if (triplePay == null) {
                triplePay = "HOLIDAY".equalsIgnoreCase(row.getDateType()) ? 1 : 0;
            }
            result.put(row.getHolidayDate(), new DayTypeInfo(row.getHolidayDate(), row.getDateType(), row.getHolidayName(), triplePay));
        }
        Map<LocalDate, DayTypeInfo> immutable = Collections.unmodifiableMap(result);
        try {
            Map<String, String> remoteValue = new LinkedHashMap<>();
            for (DayTypeInfo info : immutable.values()) {
                remoteValue.put(info.getDate().toString(), info.getDateType() + "|"
                        + (info.getHolidayName() == null ? "" : info.getHolidayName()) + "|"
                        + (info.getTriplePayFlag() == null ? 0 : info.getTriplePayFlag()));
            }
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("calendar", calendar);
            snapshot.put("dates", remoteValue);
            if (revision != null) redisCache.setCacheObject(remoteKey, snapshot,
                    YEAR_CACHE_TTL.toSeconds(), java.util.concurrent.TimeUnit.SECONDS);
        } catch (RuntimeException ignored) {
        }
        return new YearCalendar(calendar, immutable);
    }

    private HolidayCalendar getCalendar(Long id) {
        if (id == null) throw new ServiceException("节假日日历ID不能为空");
        HolidayCalendar calendar = calendarMapper.selectEnabledById(tenantId(), id);
        if (calendar == null) throw new ServiceException("节假日日历不存在或已停用", 404);
        if (calendar.getWorkStartTime() == null) calendar.setWorkStartTime(LocalTime.of(9, 0));
        if (calendar.getWorkEndTime() == null) calendar.setWorkEndTime(LocalTime.of(18, 0));
        if (calendar.getLunchStartTime() == null) calendar.setLunchStartTime(LocalTime.of(12, 0));
        if (calendar.getLunchEndTime() == null) calendar.setLunchEndTime(LocalTime.of(13, 0));
        return calendar;
    }

    private LocalTime max(LocalTime left, LocalTime right) {
        return left.isAfter(right) ? left : right;
    }

    private LocalTime min(LocalTime left, LocalTime right) {
        return left.isBefore(right) ? left : right;
    }

    private Long tenantId() { return RuntimeContextBridge.getTenantId() == null ? 100000L : RuntimeContextBridge.getTenantId(); }

    private final class CalendarDates implements HolidayCalendarCalculation {
        private final Long ownerTenant = tenantId();
        private final HolidayCalendar calendar;
        private final Set<String> restDays;
        private final Map<Integer, Map<LocalDate, DayTypeInfo>> years = new HashMap<>();

        private CalendarDates(Long calendarId, LocalDate firstDate) {
            YearCalendar snapshot = yearDetails(calendarId, firstDate.getYear());
            calendar = snapshot.calendar();
            years.put(firstDate.getYear(), snapshot.dates());
            restDays = Arrays.stream((calendar.getWeeklyRestDays() == null ? "6,7" : calendar.getWeeklyRestDays()).split(","))
                    .map(String::trim).filter(StringUtils::hasText).collect(Collectors.toSet());
        }

        private void assertTenant() {
            if (!Objects.equals(ownerTenant, tenantId())) throw new ServiceException("日历计算上下文不属于当前租户", 403);
        }

        @Override
        public DayTypeInfo getDateType(LocalDate date) {
            assertTenant();
            if (date == null) throw new ServiceException("日期不能为空");
            return get(date);
        }

        @Override
        public BigDecimal calcLeaveDays(LocalDateTime start, LocalDateTime end, boolean includeHoliday) {
            assertTenant();
            return HolidayCalendarServiceImpl.this.calcLeaveDays(this, start, end, includeHoliday);
        }

        @Override
        public long calcWorkMinutes(LocalDateTime start, LocalDateTime end) {
            assertTenant();
            return HolidayCalendarServiceImpl.this.calcWorkMinutes(this, start, end);
        }

        private boolean isWorkday(LocalDate date) {
            return "WORKDAY".equalsIgnoreCase(get(date).getDateType());
        }

        private DayTypeInfo get(LocalDate date) {
            DayTypeInfo exception = years.computeIfAbsent(date.getYear(), year -> yearDetails(calendar.getCalendarId(), year).dates()).get(date);
            if (exception != null) return exception;
            boolean rest = restDays.contains(String.valueOf(date.getDayOfWeek().getValue()));
            return new DayTypeInfo(date, rest ? "REST" : "WORKDAY", null, 0);
        }
    }

    private record YearCalendar(HolidayCalendar calendar, Map<LocalDate, DayTypeInfo> dates) { }
}
