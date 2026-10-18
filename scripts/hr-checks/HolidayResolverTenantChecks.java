package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import java.io.InputStream;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.LocalCacheScope;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.Objects;

public final class HolidayResolverTenantChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 5) throw new IllegalArgumentException("Expected JDBC URL, tenant, employee, department and calendar IDs");
        long tenantId = Long.parseLong(arguments[1]);
        long employeeId = Long.parseLong(arguments[2]);
        long departmentId = Long.parseLong(arguments[3]);
        long calendarId = Long.parseLong(arguments[4]);
        DriverManagerDataSource dataSource = new DriverManagerDataSource(arguments[0], System.getenv("DB_USERNAME"), System.getenv("DB_PASSWORD"));
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setEnvironment(new Environment("holiday-tenant-read-only", new JdbcTransactionFactory(), dataSource));
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        String resource = "mapper/holiday/HolidayResolverMapper.xml";
        try (InputStream input = HolidayResolverTenantChecks.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) throw new IllegalStateException("Missing production holiday mapper XML");
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        SqlSessionFactory factory = new MybatisSqlSessionFactoryBuilder().build(configuration);
        try (SqlSession session = factory.openSession()) {
            session.getConnection().setReadOnly(true);
            HolidayResolverMapper mapper = session.getMapper(HolidayResolverMapper.class);
            TenantContext.setTenantId(tenantId);
            equal(true, mapper.hasShiftCalendarColumn(), "HR column metadata readable with tenant interception enabled");
            equal(true, mapper.hasCrmSlaCalendarColumn(), "CRM column metadata readable with tenant interception enabled");
            equal(departmentId, mapper.selectEmployeeDeptId(employeeId, tenantId), "same-tenant employee department readable");
            equal(calendarId, mapper.selectDeptCalendarId(departmentId, tenantId), "same-tenant department calendar readable");
            TenantContext.setTenantId(Math.addExact(tenantId, 1L));
            equal(null, mapper.selectEmployeeDeptId(employeeId, tenantId), "forged tenant argument cannot read employee");
            equal(null, mapper.selectDeptCalendarId(departmentId, tenantId), "forged tenant argument cannot read department calendar");
            equal(true, mapper.hasShiftCalendarColumn(), "HR metadata is tenant independent");
            equal(true, mapper.hasCrmSlaCalendarColumn(), "CRM metadata is tenant independent");
        } finally {
            TenantContext.clear();
        }
        System.out.println("PASS: " + checks + " production holiday tenant read-only checks");
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected " + expected + ", found " + actual);
        checks++;
    }
}
