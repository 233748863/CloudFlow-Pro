package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrPayrollComponentSnapshot;
import com.cloudflow.hr.service.HrSettlementPayrollSource;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

public final class HrPayrollComponentSourceChecks {
    private static int checks;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            MybatisConfiguration configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true); configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            configuration.addMapper(HrCompComponentMapper.class); configuration.addMapper(HrSalarySlipMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            Constructor<?> constructor = HrEssServiceImpl.class.getConstructors()[0];
            Class<?>[] types = constructor.getParameterTypes(); Object[] parameters = new Object[types.length];
            for (int index = 0; index < types.length; index++) {
                if (types[index] == HrCompComponentMapper.class) parameters[index] = sessions.getMapper(HrCompComponentMapper.class);
                if (types[index] == ObjectMapper.class) parameters[index] = JSON;
            }
            HrEssServiceImpl service = (HrEssServiceImpl) constructor.newInstance(parameters);
            UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
            jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,status,version) VALUES (991910,100000,'SOURCE_BASE','同名工资','FIXED',1,3),(991911,100000,'SOURCE_ALLOWANCE','同名工资','FIXED',1,7),(991912,100001,'SOURCE_BASE','外租户工资','FIXED',1,0),(991913,100001,'FOREIGN_ONLY','外租户独有工资','FIXED',1,0),(9007199254740993,100000,'SOURCE_LARGE','大编号工资','FIXED',1,0)");
            HrEmployeeComp comp = new HrEmployeeComp(); comp.setId(991920L); comp.setTenantId(100000L);
            comp.setEmployeeId(991921L); comp.setStructureId(991922L); comp.setVersion(4);
            comp.setTotalSalary(new BigDecimal("1500.00"));
            LinkedHashMap<String, Object> values = new LinkedHashMap<>();
            values.put("SOURCE_BASE", "1000.00"); values.put("991911", new BigDecimal("500.00")); comp.setComponentValues(values);
            List<Map<String, Object>> rows = build(service, comp);
            equal(4, rows.size(), "two wages and existing tax/benefit deductions");
            equal("991910", rows.get(0).get("salaryComponentId"), "code identifies local project");
            equal("991911", rows.get(1).get("salaryComponentId"), "numeric key identifies project");
            equal("1000.00", rows.get(0).get("amount"), "amount representation unchanged");
            equal(new BigDecimal("500.00"), rows.get(1).get("amount"), "decimal amount unchanged");
            equal("991920", rows.get(0).get("employeeCompId"), "employee salary source saved");
            equal(4, rows.get(0).get("employeeCompVersion"), "salary source version saved");
            equal(3, rows.get(0).get("salaryComponentVersion"), "project version saved");
            equal("VERIFIED", rows.get(1).get("salaryComponentIdentity"), "duplicate names cannot confuse identity");
            equal(BigDecimal.TEN, rows.get(2).get("amount"), "tax preserved");
            equal(BigDecimal.ONE, rows.get(3).get("amount"), "benefit preserved");
            HrSalarySlip slip = new HrSalarySlip(); slip.setTenantId(100000L); slip.setEmployeeId(comp.getEmployeeId());
            slip.setPeriodMonth("2026-01"); slip.setStatus("SUBMITTED"); slip.setComponents(rows); slip.setPayDate(LocalDate.of(2026, 1, 31));
            slip.setGrossTotal(new BigDecimal("1500.00")); slip.setDeductionTotal(new BigDecimal("11.00")); slip.setNetTotal(new BigDecimal("1489.00"));
            service.sealSalarySlip(slip); String digest = slip.getDigestSha256();
            jdbc.update("UPDATE hr_comp_component SET component_code='SOURCE_RENAMED',component_name='已更名',version=version+1 WHERE id=991910");
            service.verifySalarySlip(slip);
            equal("SOURCE_BASE", rows.get(0).get("salaryComponentCode"), "historical code preserved after master change");
            equal("同名工资", rows.get(0).get("salaryComponentName"), "historical name preserved");
            equal(digest, slip.getDigestSha256(), "historical digest preserved");
            rows.get(0).put("salaryComponentId", "991911");
            boolean rejected = false;
            try { service.verifySalarySlip(slip); } catch (com.cloudflow.hr.exception.HrBusinessException expected) { rejected = true; }
            equal(true, rejected, "project identity participates in wage digest");
            comp.setComponentValues(Map.of("SOURCE_RENAMED", "1000.00", "991910", "500.00"));
            List<Map<String, Object>> duplicate = build(service, comp);
            for (Map<String, Object> row : duplicate.subList(0, 2)) {
                equal("DUPLICATE", row.get("salaryComponentIdentity"), "duplicate code/id same project flagged");
                equal(false, row.containsKey("salaryComponentId"), "duplicate cannot be sampled as verified");
            }
            for (String key : List.of("同名工资", "FOREIGN_ONLY", "991913", "MISSING", "' OR 1=1 --")) {
                comp.setComponentValues(Map.of(key, "1500.00"));
                Map<String, Object> row = build(service, comp).get(0);
                equal("UNRESOLVED", row.get("salaryComponentIdentity"), "no name/foreign/fuzzy matching: " + key);
                equal(false, row.containsKey("salaryComponentId"), "unresolved project omits identity");
            }
            jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,status,version) VALUES(991914,100000,'991911','数字编码工资','FIXED',1,0)");
            comp.setComponentValues(Map.of("991911", "1500.00"));
            equal("AMBIGUOUS", build(service, comp).get(0).get("salaryComponentIdentity"), "numeric code/id collision cannot guess");
            comp.setComponentValues(Map.of("9007199254740993", "1500.00"));
            equal("9007199254740993", build(service, comp).get(0).get("salaryComponentId"), "large ID serialized as exact string");
            equal(List.of(9007199254740993L), HrPayrollComponentSnapshot.numericKeys(comp.getComponentValues()), "large numeric key preserved");
            equal(List.of(), HrPayrollComponentSnapshot.numericKeys(Map.of("9223372036854775808", "1", "01", "2")), "overflow and noncanonical numeric keys are not ID candidates");
            comp.setComponentValues(null);
            equal("UNASSIGNED", build(service, comp).get(0).get("salaryComponentIdentity"), "total wage never impersonates selected project");
            comp.setComponentValues(Map.of());
            equal("UNASSIGNED", build(service, comp).get(0).get("salaryComponentIdentity"), "empty breakdown remains explicitly unassigned");
            settlementSources(sessions.getMapper(HrSalarySlipMapper.class), service, jdbc);
            System.out.println("H2_PAYROLL_COMPONENT_SOURCE_DATABASE: checks=" + checks + "; failed=0; mysql=true; actual_payroll_component_builder=true; actual_mapper=true; actual_digest=true; full_payroll=false; settlement=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void settlementSources(HrSalarySlipMapper salaries, HrEssServiceImpl service, JdbcTemplate jdbc) throws Exception {
        boolean[] permitted = { true };
        HrHSupport access = new HrHSupport(null, null, null, null, null, null, null, null, null, JSON, null) {
            @Override public void permission(String permission) {
                if (!permitted[0] || !"hr:settlement:calculate".equals(permission)) throw HrHException.forbidden();
            }
            @Override public void scope(Long employeeId) { if (!Long.valueOf(991921L).equals(employeeId)) throw HrHException.forbidden(); }
        };
        HrSettlementPayrollSource sources = new HrSettlementPayrollSource(salaries, service, access, JSON);
        HrSalarySlip paid = sourceSlip(service, 991940L, "PAID", "100.00"); salaries.insert(paid);
        HrSalarySlip unpaid = sourceSlip(service, 991941L, "SUBMITTED", "89.00"); salaries.insert(unpaid);
        HrSalarySlip negative = sourceSlip(service, 991942L, "CONFIRMED", "-11.00"); salaries.insert(negative);
        HrSalarySlip zero = sourceSlip(service, 991943L, "SUBMITTED", "0.00"); salaries.insert(zero);
        HrSalarySlip foreign = sourceSlip(service, 991944L, "SUBMITTED", "999.00"); foreign.setTenantId(100001L); service.sealSalarySlip(foreign);
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L); salaries.insert(foreign);
        UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
        HrSalarySlip other = sourceSlip(service, 991945L, "SUBMITTED", "888.00"); other.setEmployeeId(991922L); service.sealSalarySlip(other); salaries.insert(other);
        HrSettlementPayrollSource.Inspection result = sources.inspect(991921L, LocalDate.of(2026, 1, 31), 991950L);
        equal(3, result.unpaid().size(), "paid/other tenant/other employee wages excluded; issues=" + result.issues().stream().map(HrSettlementPayrollSource.Issue::code).toList()); equal(0, result.issues().size(), "valid unpaid source ready");
        equal("89.00", result.unpaid().get(0).amount(), "net imported without repeating existing deductions");
        equal("RECEIVABLE", result.unpaid().get(1).itemType(), "negative net is receivable"); equal("11.00", result.unpaid().get(1).amount(), "receivable stores absolute original net");
        equal("0.00", result.unpaid().get(2).amount(), "zero net retained for source posting");
        equal("-11.00", result.unpaid().get(1).evidence().path("netTotal").asText(), "negative sign preserved in evidence");
        equal(unpaid.getDigestSha256(), result.unpaid().get(0).evidence().path("digestSha256").asText(), "immutable wage digest saved");
        String before = jdbc.queryForObject("SELECT SHA2(GROUP_CONCAT(CONCAT(id,':',status,':',COALESCE(digest_sha256,''),':',version) ORDER BY id),256) FROM hr_salary_slip WHERE id BETWEEN 991940 AND 991949", String.class);
        sources.inspect(991921L, LocalDate.of(2026, 1, 31), 991950L);
        equal(before, jdbc.queryForObject("SELECT SHA2(GROUP_CONCAT(CONCAT(id,':',status,':',COALESCE(digest_sha256,''),':',version) ORDER BY id),256) FROM hr_salary_slip WHERE id BETWEEN 991940 AND 991949", String.class), "source inspection does not rewrite wages");
        jdbc.update("UPDATE hr_salary_slip SET reserved_settlement_id=991951 WHERE id=991941");
        equal("SETTLEMENT_SALARY_RESERVED", sources.inspect(991921L, LocalDate.of(2026, 1, 31), 991950L).issues().get(0).code(), "another settlement reservation reported");
        equal(3, sources.inspect(991921L, LocalDate.of(2026, 1, 31), 991951L).unpaid().size(), "same settlement may refresh reserved source");
        jdbc.update("UPDATE hr_salary_slip SET reserved_settlement_id=NULL,digest_sha256=NULL WHERE id=991941");
        equal("SETTLEMENT_SALARY_EVIDENCE_MISSING", sources.inspect(991921L, LocalDate.of(2026, 1, 31), null).issues().get(0).code(), "unsigned wage blocked without synthesizing digest");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_salary_slip WHERE id=991941 AND digest_sha256 IS NULL", Integer.class), "unsigned historical wage untouched");
        jdbc.update("UPDATE hr_salary_slip SET digest_sha256=?,net_total=88 WHERE id=991941", unpaid.getDigestSha256());
        equal("SETTLEMENT_SALARY_TAMPERED", sources.inspect(991921L, LocalDate.of(2026, 1, 31), null).issues().get(0).code(), "tampered net blocked");
        jdbc.update("UPDATE hr_salary_slip SET net_total=89 WHERE id=991941");
        equal(3, sources.inspect(991921L, LocalDate.of(2026, 1, 30), null).issues().size(), "period after leaving date blocked");
        HrSalarySlip pending = sourceSlip(service, 991946L, "DRAFT", "1.00"); salaries.insert(pending);
        equal("SETTLEMENT_SALARY_PENDING", sources.inspect(991921L, LocalDate.of(2026, 1, 31), null).issues().get(0).code(), "unfinished wage requires explicit resolution");
        HrSalarySlip overflow = sourceSlip(service, 991947L, "SUBMITTED", "1000000000000.00"); salaries.insert(overflow);
        HrSalarySlip mismatch = sourceSlip(service, 991948L, "SUBMITTED", "1.00"); mismatch.setGrossTotal(new BigDecimal("999.00")); service.sealSalarySlip(mismatch); salaries.insert(mismatch);
        HrSalarySlip noPeriod = sourceSlip(service, 991949L, "SUBMITTED", "1.00"); noPeriod.setComponents(List.of(Map.of("type", "TAX_SNAPSHOT", "amount", BigDecimal.ZERO))); service.sealSalarySlip(noPeriod); salaries.insert(noPeriod);
        List<String> issues = sources.inspect(991921L, LocalDate.of(2026, 1, 31), null).issues().stream().map(HrSettlementPayrollSource.Issue::code).toList();
        equal(List.of("SETTLEMENT_SALARY_PENDING", "SETTLEMENT_SALARY_AMOUNT_INVALID", "SETTLEMENT_SALARY_AMOUNT_INVALID", "SETTLEMENT_SALARY_PERIOD_MISSING"), issues, "source problems remain visible without fabricating amounts");
        permitted[0] = false; boolean forbidden = false;
        try { sources.inspect(991921L, LocalDate.of(2026, 1, 31), null); } catch (HrHException expected) { forbidden = true; }
        equal(true, forbidden, "permission checked before source query");
        permitted[0] = true; forbidden = false;
        try { sources.inspect(991922L, LocalDate.of(2026, 1, 31), null); } catch (HrHException expected) { forbidden = true; }
        equal(true, forbidden, "employee data scope checked before query");
        System.out.println("H2_SETTLEMENT_UNPAID_SALARY_SOURCE: actual_mapper=true; actual_digest=true; read_only=true; permission_scope_fixture=true; posting=false; http=false");
    }

    private static HrSalarySlip sourceSlip(HrEssServiceImpl service, Long id, String status, String net) {
        HrSalarySlip slip = new HrSalarySlip(); slip.setId(id); slip.setTenantId(100000L); slip.setEmployeeId(991921L);
        slip.setPeriodMonth("2026-01"); slip.setStatus(status); slip.setVersion(0); slip.setDeleted(0);
        slip.setPayDate(LocalDate.of(2026, 1, 31)); slip.setEmployeeConfirmed(false);
        slip.setTaxAmount(BigDecimal.ZERO); slip.setBenefitAmount(BigDecimal.ZERO); slip.setCurrentTax(BigDecimal.ZERO);
        slip.setCumulativeTaxableIncome(BigDecimal.ZERO); slip.setCumulativeDeduction(BigDecimal.ZERO);
        slip.setCumulativeTaxPayable(BigDecimal.ZERO); slip.setCumulativeTaxPaid(BigDecimal.ZERO);
        slip.setNetTotal(new BigDecimal(net)); slip.setDeductionTotal(new BigDecimal("11.00")); slip.setGrossTotal(slip.getNetTotal().add(slip.getDeductionTotal()));
        slip.setComponents(List.of(Map.of("type", "TAX_SNAPSHOT", "amount", BigDecimal.ZERO, "periodStart", "2026-01-01", "periodEnd", "2026-01-31")));
        service.sealSalarySlip(slip); return slip;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> build(HrEssServiceImpl service, HrEmployeeComp comp) throws Exception {
        Method method = HrEssServiceImpl.class.getDeclaredMethod("buildSlipComponents", HrEmployeeComp.class, BigDecimal.class, BigDecimal.class, BigDecimal.class);
        method.setAccessible(true);
        return (List<Map<String, Object>>) method.invoke(service, comp, comp.getTotalSalary(), BigDecimal.TEN, BigDecimal.ONE);
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label);
        checks++;
    }
}
