package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.dto.HolidayDateBatchDTO;
import com.cloudflow.auth.domain.dto.HolidayDateItemDTO;
import com.cloudflow.auth.mapper.HolidayDateWriteMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import java.io.InputStream;
import java.lang.reflect.Method;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.mapping.SqlCommandType;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class HolidayDateWriteChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        mapperBindings();
        UserContext.setTenantId(100001L);
        UserContext.setUserName("H_HOLIDAY_WRITE_CHECK");
        try {
            for (boolean imported : List.of(false, true)) {
                for (String dateType : List.of("WORKDAY", "REST", "HOLIDAY")) {
                    for (Integer flag : Arrays.asList(null, 0, 1)) {
                        List<HolidayDate> written = new ArrayList<>();
                        write(service(written), imported, item(dateType, flag));
                        equal(1, written.size(), "single date write");
                        HolidayDate row = written.get(0);
                        equal(dateType, row.getDateType(), "date type preserved");
                        equal(flag == null ? ("HOLIDAY".equals(dateType) ? 1 : 0) : flag, row.getTriplePayFlag(), "explicit flag or legacy default preserved");
                        equal(100001L, row.getTenantId(), "current tenant retained");
                        equal(77L, row.getCalendarId(), "selected calendar retained");
                        equal(2026, row.getYearNo(), "date year retained");
                        equal(LocalDate.of(2026, 7, 8), row.getHolidayDate(), "date retained");
                    }
                }
                for (Integer flag : List.of(-1, 2)) {
                    List<HolidayDate> written = new ArrayList<>();
                    try {
                        write(service(written), imported, item("HOLIDAY", flag));
                        throw new AssertionError("invalid flag accepted");
                    } catch (ServiceException expected) {
                        equal("三倍工资日标记只能为0或1", expected.getMessage(), "invalid flag rejected explicitly");
                        equal(0, written.size(), "invalid flag never reaches row writer");
                    }
                }
            }
            List<HolidayDate> normalized = new ArrayList<>();
            write(service(normalized), false, item(" holiday ", 0));
            equal("HOLIDAY", normalized.get(0).getDateType(), "batch normalization retained");
            equal(0, normalized.get(0).getTriplePayFlag(), "normalization preserves explicit zero");
            System.out.println("Holiday date write checks passed: " + checks);
        } finally {
            UserContext.clear();
        }
    }

    private static void mapperBindings() throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        String resource = "mapper/HolidayDateWriteMapper.xml";
        try (InputStream input = HolidayDateWriteChecks.class.getClassLoader().getResourceAsStream(resource)) {
            equal(true, input != null, "date writer XML is packaged");
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        String namespace = HolidayDateWriteMapper.class.getName();
        BoundSql tenantLock = configuration.getMappedStatement(namespace + ".lockTenant").getBoundSql(Map.of("tenantId", 100001L));
        equal(List.of("tenantId"), tenantLock.getParameterMappings().stream().map(ParameterMapping::getProperty).toList(), "default mutation lock binds tenant");
        equal(true, tenantLock.getSql().contains("FOR UPDATE"), "tenant lock serializes concurrent default changes");
        MappedStatement defaults = configuration.getMappedStatement(namespace + ".lockDefaultCalendars");
        BoundSql currentDefaults = defaults.getBoundSql(Map.of("tenantId", 100001L, "exceptId", 77L));
        equal(List.of("tenantId", "exceptId"), currentDefaults.getParameterMappings().stream().map(ParameterMapping::getProperty).toList(), "current defaults bind tenant and exclusion");
        equal(true, currentDefaults.getSql().contains("FOR UPDATE"), "default lookup is a current read rather than an old transaction snapshot");
        equal(true, currentDefaults.getSql().contains("deleted = 0"), "default lookup excludes deleted calendars");
        equal(1, defaults.getBoundSql(Map.of("tenantId", 100001L)).getParameterMappings().size(), "first default creation does not require an exclusion identifier");
        TenantLineInnerInterceptor tenant = (TenantLineInnerInterceptor) new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor().getInterceptors().get(0);
        TenantContext.setTenantId(100001L);
        try {
            String rewritten = tenant.parserSingle(currentDefaults.getSql(), null);
            equal(true, rewritten.endsWith("FOR UPDATE"), "real tenant interceptor keeps the locking clause last");
            equal(true, rewritten.contains("tenant_id = 100001"), "current default query keeps tenant protection after parsing");
        } finally {
            TenantContext.clear();
        }
        MappedStatement lock = configuration.getMappedStatement(namespace + ".lockCalendar");
        BoundSql lockSql = lock.getBoundSql(Map.of("calendarId", 77L, "tenantId", 100001L));
        equal(SqlCommandType.SELECT, lock.getSqlCommandType(), "calendar lock remains a select");
        equal(List.of("calendarId", "tenantId"), lockSql.getParameterMappings().stream().map(ParameterMapping::getProperty).toList(), "lock binds calendar and tenant");
        equal(true, lockSql.getSql().contains("deleted = 0"), "lock excludes deleted calendars");
        equal(true, lockSql.getSql().contains("FOR UPDATE"), "calendar row lock retained");
        MappedStatement save = configuration.getMappedStatement(namespace + ".saveDate");
        BoundSql saveSql = save.getBoundSql(Map.of("row", new HolidayDate()));
        equal(SqlCommandType.INSERT, save.getSqlCommandType(), "date writer remains an upsert");
        equal(List.of("row.tenantId", "row.calendarId", "row.holidayDate", "row.dateType",
                "row.holidayName", "row.triplePayFlag", "row.yearNo", "row.remark", "row.createBy",
                "row.createTime", "row.updateBy", "row.updateTime"),
                saveSql.getParameterMappings().stream().map(ParameterMapping::getProperty).toList(), "all date values use bound parameters");
        for (String clause : List.of("ON DUPLICATE KEY UPDATE", "triple_pay_flag = VALUES(triple_pay_flag)",
                "deleted = 0", "version = version + 1")) {
            equal(true, saveSql.getSql().contains(clause), "upsert clause retained");
        }
        for (Method method : HolidayDateWriteMapper.class.getDeclaredMethods()) {
            equal(false, Arrays.stream(method.getAnnotations()).anyMatch(annotation ->
                    annotation.annotationType().getPackageName().equals("org.apache.ibatis.annotations")), "SQL lives only in XML");
        }
    }

    private static HolidayDateItemDTO item(String dateType, Integer flag) {
        HolidayDateItemDTO item = new HolidayDateItemDTO();
        item.setHolidayDate(LocalDate.of(2026, 7, 8));
        item.setDateType(dateType);
        item.setTriplePayFlag(flag);
        return item;
    }

    private static void write(HolidayManagementService service, boolean imported, HolidayDateItemDTO item) {
        if (imported) service.createImportedDate(77L, item);
        else {
            HolidayDateBatchDTO batch = new HolidayDateBatchDTO();
            batch.setCalendarId(77L);
            batch.setYearNo(2026);
            batch.setDates(List.of(item));
            service.batchSave(batch);
        }
    }

    private static HolidayManagementService service(List<HolidayDate> written) {
        HolidayCalendar calendar = new HolidayCalendar();
        calendar.setCalendarId(77L);
        calendar.setTenantId(100001L);
        calendar.setStatus("ENABLED");
        HolidayCalendarMapper calendars = proxy(HolidayCalendarMapper.class, (instance, method, arguments) -> {
            if (method.getName().equals("selectOne")) return calendar;
            throw new AssertionError(method.getName());
        });
        HolidayDateMapper dates = proxy(HolidayDateMapper.class, (instance, method, arguments) -> {
            if (method.getName().equals("delete")) return 1;
            if (method.getName().equals("insert")) { written.add((HolidayDate) arguments[0]); return 1; }
            throw new AssertionError(method.getName());
        });
        HolidayDateWriteMapper writes = proxy(HolidayDateWriteMapper.class, (instance, method, arguments) -> {
            if (method.getName().equals("lockCalendar")) return 77L;
            if (method.getName().equals("saveDate")) { written.add((HolidayDate) arguments[0]); return 1; }
            throw new AssertionError(method.getName());
        });
        return new HolidayManagementService(calendars, dates, null, null, writes);
    }

    private static <Value> Value proxy(Class<Value> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label);
        checks++;
    }
}
