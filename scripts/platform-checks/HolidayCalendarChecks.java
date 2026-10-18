package com.cloudflow.common.holiday.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.redis.core.RedisCache;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.HashSet;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class HolidayCalendarChecks {
    private static int checks;
    private static int failures;

    public static void main(String[] arguments) throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "holiday-calendar-checks");
        TableInfoHelper.initTableInfo(assistant, HolidayCalendar.class);
        TableInfoHelper.initTableInfo(assistant, HolidayDate.class);
        UserContext.setTenantId(100001L);
        try {
            calculations();
            crossInstanceInvalidation();
            defaultInvalidation();
            cacheRoundTrip();
            rangeQueryBudget();
            missingCalendar();
            redisFixtureDeletion();
            staleYearRead();
            pendingInvalidations();
            failedInvalidation();
            transactionalRead();
            assignmentFallbacks();
            tenantIsolation();
            calendarMetadataInvalidation();
            unknownTransactionOutcome();
            System.out.println("HOLIDAY_CALENDAR_CHECKS: assertions=" + checks + "; passed=" + (checks - failures)
                    + "; failed=" + failures + "; real_service=true; database_fixture=true; redis_fixture=true");
            if (failures != 0) throw new AssertionError("Holiday calendar checks failed: " + failures);
        } finally {
            UserContext.clear();
        }
    }

    private static void calculations() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl service = fixture.service();
        equal(true, service.isWorkday(77L, date("2027-01-11")), "ordinary weekday");
        equal(false, service.isWorkday(77L, date("2027-01-09")), "ordinary weekend");
        equal(false, service.isWorkday(77L, date("2027-01-04")), "configured holiday");
        equal(true, service.isWorkday(77L, date("2027-01-02")), "configured Saturday workday");
        equal(5, service.countWorkdays(77L, date("2027-01-01"), date("2027-01-07")), "inclusive interval");
        equal(-5, service.countWorkdays(77L, date("2027-01-07"), date("2027-01-01")), "reverse interval");
        equal(new BigDecimal("2.5"), service.calcLeaveDays(77L, time("2027-01-01T09:00"), time("2027-01-05T12:00"), false), "leave skips configured days off");
        equal(new BigDecimal("4.5"), service.calcLeaveDays(77L, time("2027-01-01T09:00"), time("2027-01-05T12:00"), true), "leave includes configured days off");
        equal(new BigDecimal("0.5"), service.calcLeaveDays(77L, time("2027-01-11T09:00"), time("2027-01-11T12:00"), false), "morning half day");
        equal(new BigDecimal("0.5"), service.calcLeaveDays(77L, time("2027-01-11T13:00"), time("2027-01-11T18:00"), false), "afternoon half day");
        equal(new BigDecimal("1.0"), service.calcLeaveDays(77L, time("2027-01-11T11:00"), time("2027-01-11T14:00"), false), "approved noon boundary");
        equal(600L, service.calcWorkMinutes(77L, time("2027-01-01T17:00"), time("2027-01-05T10:00")), "work minutes exclude nights holiday and lunch");
        equal(-600L, service.calcWorkMinutes(77L, time("2027-01-05T10:00"), time("2027-01-01T17:00")), "reverse work minutes");
        equal(date("2027-01-06"), service.nextWorkday(77L, date("2027-01-01"), 3), "third working day");
        equal(date("2027-01-01"), service.nextWorkday(77L, date("2027-01-06"), -3), "third previous working day");
        equal(1, service.getDateType(77L, date("2027-01-04")).getTriplePayFlag(), "holiday triple flag");
        equal(0, service.getDateType(77L, date("2027-01-02")).getTriplePayFlag(), "makeup workday triple flag");
    }

    private static void crossInstanceInvalidation() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        LocalDate changed = date("2027-01-04");
        equal("HOLIDAY", writer.getDateType(77L, changed).getDateType(), "writer warms old year");
        equal("HOLIDAY", reader.getDateType(77L, changed).getDateType(), "reader warms old year");
        reader.getDateType(77L, date("2028-01-04"));
        fixture.replace(100001L, 77L, changed, "WORKDAY", "调整", 0);
        writer.evictCalendar(77L, 2027);
        equal("WORKDAY", writer.getDateType(77L, changed).getDateType(), "writer sees new date");
        equal("WORKDAY", reader.getDateType(77L, changed).getDateType(), "other instance sees new date immediately");
        int reads = fixture.dateReads;
        reader.getDateType(77L, date("2028-01-04"));
        equal(reads, fixture.dateReads, "year invalidation preserves other year cache");
        fixture.redis.available = false;
        fixture.replace(100001L, 77L, changed, "REST", "停用缓存样本", 0);
        equal("REST", reader.getDateType(77L, changed).getDateType(), "Redis outage bypasses old local data");
        fixture.redis.available = true;
    }

    private static void defaultInvalidation() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        equal(77L, reader.resolveCalendarId(21L, date("2027-01-04")), "initial tenant default");
        fixture.defaultCalendarId = 88L;
        writer.evictCalendar(77L, null);
        equal(88L, reader.resolveCalendarId(21L, date("2027-01-04")), "other instance sees changed tenant default");
    }

    private static void cacheRoundTrip() {
        Fixture fixture = new Fixture();
        fixture.replace(100001L, 77L, date("2027-01-04"), "HOLIDAY", "春节|补充", 0);
        DayTypeInfo first = fixture.service().getDateType(77L, date("2027-01-04"));
        DayTypeInfo second = fixture.service().getDateType(77L, date("2027-01-04"));
        equal(first.getHolidayName(), second.getHolidayName(), "Redis preserves full holiday name");
        equal(0, second.getTriplePayFlag(), "Redis preserves explicit non-triple holiday");
        Fixture empty = new Fixture();
        empty.service().getDateType(77L, date("2028-01-04"));
        int reads = empty.dateReads;
        empty.service().getDateType(77L, date("2028-01-04"));
        equal(reads, empty.dateReads, "empty year is a valid shared cache hit");
    }

    private static void rangeQueryBudget() {
        Fixture fixture = new Fixture();
        fixture.service().countWorkdays(77L, date("2027-01-01"), date("2027-12-31"));
        System.out.println("HOLIDAY_YEAR_RANGE: calendar_queries=" + fixture.calendarReads + "; year_queries=" + fixture.dateReads);
        equal(1, fixture.calendarReads, "one calendar lookup per yearly calculation");
        equal(1, fixture.dateReads, "one detail lookup per year on cold cache");
    }

    private static void missingCalendar() {
        Fixture fixture = new Fixture();
        fixture.defaultCalendarId = null;
        try {
            fixture.service().resolveCalendarId(21L, date("2027-01-04"));
            equal(true, false, "missing all calendars must fail");
        } catch (ServiceException expected) {
            equal("未配置节假日日历，请联系管理员", expected.getMessage(), "missing calendar is explicit");
        }
    }

    private static void redisFixtureDeletion() {
        Fixture fixture = new Fixture();
        fixture.redis.setCacheObject("holiday:test:one", 1);
        fixture.redis.setCacheObject("holiday:test:two", 2);
        equal(2L, fixture.redis.redisTemplate.delete(fixture.redis.keys("holiday:test:*")), "fixture implements raw prefixed batch deletion");
        equal(0, fixture.redis.keys("holiday:test:*").size(), "fixture deletion removes real keys without adding tenant twice");
    }

    private static void staleYearRead() throws Exception {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        CountDownLatch snapshot = new CountDownLatch(1);
        CountDownLatch resume = new CountDownLatch(1);
        fixture.dateReadHook.set(() -> {
            snapshot.countDown();
            await(resume);
        });
        CompletableFuture<String> inFlight = CompletableFuture.supplyAsync(() -> {
            UserContext.setTenantId(100001L);
            try { return reader.getDateType(77L, date("2027-01-04")).getDateType(); }
            finally { UserContext.clear(); }
        });
        try {
            equal(true, snapshot.await(10, TimeUnit.SECONDS), "concurrent reader holds the pre-change snapshot");
            fixture.replace(100001L, 77L, date("2027-01-04"), "WORKDAY", "新日期", 0);
            writer.evictCalendar(77L, 2027);
        } finally {
            resume.countDown();
        }
        equal("HOLIDAY", inFlight.get(10, TimeUnit.SECONDS), "in-flight call retains its original snapshot");
        equal("WORKDAY", reader.getDateType(77L, date("2027-01-04")).getDateType(), "old reader cannot refill the current cache generation");
        equal("WORKDAY", writer.getDateType(77L, date("2027-01-04")).getDateType(), "other instance also ignores late stale refill");
    }

    private static void pendingInvalidations() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        reader.getDateType(77L, date("2027-01-04"));
        List<TransactionSynchronization> first = prepare(() -> writer.evictCalendar(77L, 2027));
        List<TransactionSynchronization> second = prepare(() -> writer.evictCalendar(77L, 2027));
        finish(first, TransactionSynchronization.STATUS_COMMITTED);
        int reads = fixture.dateReads;
        reader.getDateType(77L, date("2027-01-04"));
        reader.getDateType(77L, date("2027-01-04"));
        equal(reads + 2, fixture.dateReads, "first writer cannot clear another transaction's pending marker");
        fixture.replace(100001L, 77L, date("2027-01-04"), "REST", "第二个变更", 0);
        finish(second, TransactionSynchronization.STATUS_COMMITTED);
        equal("REST", reader.getDateType(77L, date("2027-01-04")).getDateType(), "last completed writer exposes the new snapshot");
        reads = fixture.dateReads;
        writer.getDateType(77L, date("2027-01-04"));
        equal(reads, fixture.dateReads, "cache rebuild resumes after all writers complete");
    }

    private static void failedInvalidation() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        reader.getDateType(77L, date("2027-01-04"));
        fixture.redis.failBegin = true;
        try {
            prepare(() -> writer.evictCalendar(77L, 2027));
            equal(true, false, "unavailable invalidation must reject commit");
        } catch (ServiceException expected) {
            equal(true, expected.getMessage().contains("本次变更未提交"), "pre-commit invalidation failure is explicit");
        }
        fixture.redis.failBegin = false;
        List<TransactionSynchronization> pending = prepare(() -> writer.evictCalendar(77L, 2027));
        fixture.replace(100001L, 77L, date("2027-01-04"), "WORKDAY", "已提交", 0);
        fixture.redis.failEnd = true;
        finish(pending, TransactionSynchronization.STATUS_COMMITTED);
        fixture.redis.available = false;
        equal("WORKDAY", reader.getDateType(77L, date("2027-01-04")).getDateType(), "outage falls back to committed data");
        fixture.redis.available = true;
        fixture.redis.failEnd = false;
        equal("WORKDAY", reader.getDateType(77L, date("2027-01-04")).getDateType(), "recovered Redis never revives the pre-commit cache");
        equal(null, new HolidayCacheEpoch(fixture.redis).current("calendar:77", "year:77:2027"), "unfinished cleanup keeps remote readers in database fallback");
        equal("WORKDAY", writer.getDateType(77L, date("2027-01-04")).getDateType(), "writer retries completed invalidations after recovery");
        equal(true, new HolidayCacheEpoch(fixture.redis).current("calendar:77", "year:77:2027") != null, "successful retry restores cache availability");
        finish(pending, TransactionSynchronization.STATUS_COMMITTED);
        equal("WORKDAY", reader.getDateType(77L, date("2027-01-04")).getDateType(), "repeated completion remains safe");
    }

    private static void transactionalRead() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl reader = fixture.service();
        reader.getDateType(77L, date("2027-01-04"));
        fixture.replace(100001L, 77L, date("2027-01-04"), "REST", "未提交", 0);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            equal("REST", reader.getDateType(77L, date("2027-01-04")).getDateType(), "transactional reads bypass shared committed cache");
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
        fixture.replace(100001L, 77L, date("2027-01-04"), "HOLIDAY", "已回滚", 1);
        equal("HOLIDAY", fixture.service().getDateType(77L, date("2027-01-04")).getDateType(), "rolled-back transaction never publishes its snapshot");
    }

    private static void assignmentFallbacks() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl service = fixture.service();
        fixture.employeeDeptId = 31L;
        fixture.deptCalendarId = 88L;
        fixture.assignedShiftId = 41L;
        fixture.shiftCalendarId = 77L;
        equal(77L, service.resolveCalendarId(21L, date("2027-01-04")), "shift has priority over department");
        fixture.assignedShiftId = null;
        service.invalidateAssignments();
        equal(88L, fixture.service().resolveCalendarId(21L, date("2027-01-04")), "unassigned employee falls back to department");
        fixture.deptCalendarId = null;
        service.invalidateAssignments();
        equal(77L, fixture.service().resolveCalendarId(21L, date("2027-01-04")), "unconfigured department falls back to tenant default");
    }

    private static void tenantIsolation() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl service = fixture.service();
        service.getDateType(77L, date("2027-01-04"));
        fixture.replace(100002L, 77L, date("2027-01-04"), "REST", "另一租户", 0);
        UserContext.setTenantId(100002L);
        try {
            equal("REST", service.getDateType(77L, date("2027-01-04")).getDateType(), "tenant cache keys do not collide");
            service.evictCalendar(77L, 2027);
        } finally {
            UserContext.setTenantId(100001L);
        }
        int reads = fixture.dateReads;
        equal("HOLIDAY", service.getDateType(77L, date("2027-01-04")).getDateType(), "other tenant invalidation preserves this tenant's data");
        equal(reads, fixture.dateReads, "other tenant invalidation preserves this tenant's cache");
    }

    private static void calendarMetadataInvalidation() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        LocalDate saturday = date("2027-01-09");
        equal(false, reader.isWorkday(77L, saturday), "cached calendar starts with Saturday off");
        int reads = fixture.calendarReads;
        writer.isWorkday(77L, saturday);
        equal(reads, fixture.calendarReads, "shared year snapshot avoids repeated calendar SQL");
        fixture.weeklyRestDays = "7";
        writer.evictCalendar(77L, null);
        equal(true, reader.isWorkday(77L, saturday), "calendar metadata invalidation updates fixed rest days");
        fixture.enabled = false;
        writer.evictCalendar(77L, null);
        try {
            reader.getDateType(77L, saturday);
            equal(true, false, "disabled calendar must not survive in the cache");
        } catch (ServiceException expected) {
            equal("节假日日历不存在或已停用", expected.getMessage(), "calendar disabling invalidates cached metadata");
        }
    }

    private static List<TransactionSynchronization> prepare(Runnable action) {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        List<TransactionSynchronization> callbacks = List.of();
        try {
            action.run();
            callbacks = TransactionSynchronizationManager.getSynchronizations();
            for (TransactionSynchronization callback : callbacks) callback.beforeCommit(false);
            return callbacks;
        } catch (RuntimeException failure) {
            finish(callbacks, TransactionSynchronization.STATUS_ROLLED_BACK);
            throw failure;
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
    }

    private static void unknownTransactionOutcome() {
        Fixture fixture = new Fixture();
        HolidayCalendarServiceImpl writer = fixture.service();
        HolidayCalendarServiceImpl reader = fixture.service();
        reader.getDateType(77L, date("2027-01-04"));
        List<TransactionSynchronization> pending = prepare(() -> writer.evictCalendar(77L, 2027));
        finish(pending, TransactionSynchronization.STATUS_UNKNOWN);
        fixture.replace(100001L, 77L, date("2027-01-04"), "REST", "结果不确定样本", 0);
        equal("REST", reader.getDateType(77L, date("2027-01-04")).getDateType(), "unknown commit result forces authoritative reads");
        writer.getDateType(77L, date("2027-01-04"));
        equal(null, new HolidayCacheEpoch(fixture.redis).current("calendar:77", "year:77:2027"), "unknown transaction outcome is never guessed committed or rolled back");
    }

    private static void finish(List<TransactionSynchronization> callbacks, int status) {
        for (TransactionSynchronization callback : callbacks) callback.afterCompletion(status);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent cache check timed out");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    private static LocalDate date(String value) { return LocalDate.parse(value); }
    private static LocalDateTime time(String value) { return LocalDateTime.parse(value); }

    private static void equal(Object expected, Object actual, String label) {
        checks++;
        if (!Objects.equals(expected, actual)) {
            failures++;
            System.out.println("HOLIDAY_CHECK_FAILURE: " + label + "; expected=" + expected + "; actual=" + actual);
        }
    }

    @SuppressWarnings("unchecked")
    private static <Type> Type proxy(Class<Type> type, InvocationHandler handler) {
        return (Type) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler);
    }

    private static final class Fixture {
        private final MemoryRedis redis = new MemoryRedis();
        private final Map<String, List<HolidayDate>> rows = new HashMap<>();
        private Long defaultCalendarId = 77L;
        private Long assignedShiftId;
        private Long shiftCalendarId;
        private Long employeeDeptId;
        private Long deptCalendarId;
        private final AtomicReference<Runnable> dateReadHook = new AtomicReference<>();
        private int calendarReads;
        private int dateReads;
        private String weeklyRestDays = "6,7";
        private boolean enabled = true;

        private Fixture() {
            replace(100001L, 77L, date("2027-01-02"), "WORKDAY", "验证调休", 0);
            replace(100001L, 77L, date("2027-01-04"), "HOLIDAY", "验证假日", 1);
        }

        private void replace(long tenant, long calendar, LocalDate date, String type, String name, int flag) {
            List<HolidayDate> dates = rows.computeIfAbsent(tenant + ":" + calendar + ":" + date.getYear(), unused -> new ArrayList<>());
            dates.removeIf(row -> row.getHolidayDate().equals(date));
            HolidayDate row = new HolidayDate();
            row.setTenantId(tenant); row.setCalendarId(calendar); row.setYearNo(date.getYear());
            row.setHolidayDate(date); row.setDateType(type); row.setHolidayName(name); row.setTriplePayFlag(flag);
            row.setDeleted(0); row.setVersion(0);
            dates.add(row);
        }

        private HolidayCalendarServiceImpl service() {
            HolidayCalendarMapper calendars = proxy(HolidayCalendarMapper.class, (instance, method, arguments) -> {
                if (!List.of("selectEnabledById", "selectDefaultEnabled").contains(method.getName())) throw new UnsupportedOperationException(method.getName());
                calendarReads++;
                Long identifier = method.getName().equals("selectDefaultEnabled") ? defaultCalendarId : Long.class.cast(arguments[1]);
                if (identifier == null || !List.of(77L, 88L).contains(identifier) || !enabled) return null;
                HolidayCalendar calendar = new HolidayCalendar();
                calendar.setCalendarId(identifier); calendar.setTenantId(Long.class.cast(arguments[0]));
                calendar.setWeeklyRestDays(weeklyRestDays); calendar.setStatus("ENABLED"); calendar.setVersion(0); calendar.setDeleted(0);
                calendar.setWorkStartTime(LocalTime.of(9, 0)); calendar.setWorkEndTime(LocalTime.of(18, 0));
                calendar.setLunchStartTime(LocalTime.NOON); calendar.setLunchEndTime(LocalTime.of(13, 0));
                return calendar;
            });
            HolidayDateMapper dates = proxy(HolidayDateMapper.class, (instance, method, arguments) -> {
                if (!method.getName().equals("selectCalendarYear")) throw new UnsupportedOperationException(method.getName());
                dateReads++;
                Long calendar = Long.class.cast(arguments[1]);
                Integer year = Integer.class.cast(arguments[2]);
                List<HolidayDate> snapshot = new ArrayList<>(rows.getOrDefault(arguments[0] + ":" + calendar + ":" + year, List.of()));
                Runnable hook = dateReadHook.getAndSet(null);
                if (hook != null) hook.run();
                return snapshot;
            });
            HolidayResolverMapper resolver = proxy(HolidayResolverMapper.class, (instance, method, arguments) -> switch (method.getName()) {
                case "hasShiftCalendarColumn", "hasCrmSlaCalendarColumn" -> true;
                case "selectAssignedShiftId" -> assignedShiftId;
                case "selectEmployeeDeptId" -> employeeDeptId;
                case "selectDeptCalendarId" -> deptCalendarId;
                case "selectShiftCalendarId" -> shiftCalendarId;
                default -> throw new UnsupportedOperationException(method.getName());
            });
            return new HolidayCalendarServiceImpl(calendars, dates, resolver, redis);
        }
    }

    private static final class MemoryRedis extends RedisCache {
        private final Map<String, Object> values = new ConcurrentHashMap<>();
        private final Map<String, Epoch> epochs = new HashMap<>();
        private volatile boolean available = true;
        private boolean failBegin;
        private boolean failEnd;

        private MemoryRedis() {
            redisTemplate = new RedisTemplate<>() {
                @Override
                public Long delete(Collection<String> keys) {
                    checkAvailable();
                    return keys.stream().filter(name -> values.remove(name) != null).count();
                }

                @Override
                @SuppressWarnings("unchecked")
                public <Type> Type execute(RedisScript<Type> script, RedisSerializer<?> argumentSerializer,
                                           RedisSerializer<Type> resultSerializer, List<String> keys, Object... arguments) {
                    return (Type) transition(keys, arguments);
                }
            };
        }

        private synchronized String transition(List<String> keys, Object[] arguments) {
            checkAvailable();
            String operation = String.valueOf(arguments[0]);
            String marker = String.valueOf(arguments[1]);
            String generation = String.valueOf(arguments[2]);
            if ("BEGIN".equals(operation) && failBegin || "END".equals(operation) && failEnd) {
                throw new IllegalStateException("Owned invalidation failure fixture");
            }
            List<String> revisions = new ArrayList<>();
            for (String name : keys) {
                Epoch epoch = epochs.computeIfAbsent(name, unused -> new Epoch());
                if ("READ".equals(operation)) {
                    if (!epoch.pending.isEmpty()) return "";
                    if (epoch.revision == null) epoch.revision = generation;
                    revisions.add(epoch.revision);
                } else {
                    epoch.revision = generation;
                    if ("BEGIN".equals(operation)) epoch.pending.add(marker);
                    else if ("END".equals(operation)) epoch.pending.remove(marker);
                    else throw new AssertionError("Unknown cache operation");
                }
            }
            return "READ".equals(operation) ? String.join(":", revisions) : "OK";
        }

        private void checkAvailable() {
            if (!available) throw new IllegalStateException("Owned Redis outage fixture");
        }

        private String key(String name) {
            checkAvailable();
            return UserContext.getTenantId() + ":" + name;
        }

        @Override
        @SuppressWarnings("unchecked")
        public <Type> Type getCacheObject(String name) { return (Type) values.get(key(name)); }

        @Override
        public <Type> void setCacheObject(String name, Type value) { values.put(key(name), value); }

        @Override
        public <Type> void setCacheObject(String name, Type value, long timeout, TimeUnit unit) { setCacheObject(name, value); }

        @Override
        public boolean deleteObject(String name) { return values.remove(key(name)) != null; }

        @Override
        public Collection<String> keys(String pattern) {
            String prefix = key(pattern.substring(0, pattern.length() - 1));
            return values.keySet().stream().filter(name -> name.startsWith(prefix)).toList();
        }

        private static final class Epoch {
            private String revision;
            private final Set<String> pending = new HashSet<>();
        }
    }
}
