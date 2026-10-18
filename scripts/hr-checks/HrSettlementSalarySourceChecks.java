package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrCompChangeMapper;
import com.cloudflow.hr.mapper.HrCompStructureMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrPayrollCorrectionMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrCommissionService;
import com.cloudflow.hr.service.HrPayrollCalculationService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrSettlementCalculation;
import com.cloudflow.hr.service.HrSettlementCalculation.SamplingSelection;
import com.cloudflow.hr.service.HrSettlementSalarySource;
import com.cloudflow.hr.service.HrSettlementCompensationSource;
import com.cloudflow.hr.service.HrSeveranceRuleService;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

public final class HrSettlementSalarySourceChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int checks;
    private static long nextId = 992100L;
    private static final boolean[] CALENDAR_AVAILABLE = { true };
    private static HrEssServiceImpl ess;
    private static HrPayrollCalculationService payroll;
    private static HrSalarySlipMapper salaries;
    private static JdbcTemplate jdbc;
    private static HrSettlementSalarySource source;
    private static HrEmployeeComp compensation;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        try (HikariDataSource data = new HikariDataSource()) {
            data.setJdbcUrl(arguments[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(2); jdbc = new JdbcTemplate(data);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            MybatisConfiguration config = new MybatisConfiguration(); config.setMapUnderscoreToCamelCase(true); config.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            config.addMapper(HrSalarySlipMapper.class); config.addMapper(HrCompComponentMapper.class); config.addMapper(HrCompStructureMapper.class);
            config.addMapper(HrEmployeeMapper.class); config.addMapper(HrPayrollCorrectionMapper.class); config.addMapper(HrCompChangeMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(data); factory.setConfiguration(config);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,deleted) VALUES(992001,100000,'SAMPLE_FIXTURE','工资取样测试','UNKNOWN',100,'REGULAR','2026-01-01',0)");
            jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,status,version) VALUES(992010,100000,'SAMPLE_A','同名工资','FIXED',1,2),(992011,100000,'SAMPLE_B','同名工资','FIXED',1,3)");
            jdbc.update("INSERT INTO hr_comp_structure(id,tenant_id,structure_code,structure_name,component_config,status) VALUES(992020,100000,'SAMPLE_STRUCTURE','取样结构',JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')),1)");
            Map<Class<?>, Object> dependencies = new HashMap<>(); dependencies.put(ObjectMapper.class, JSON);
            dependencies.put(HrCompComponentMapper.class, sessions.getMapper(HrCompComponentMapper.class)); dependencies.put(HrCompStructureMapper.class, sessions.getMapper(HrCompStructureMapper.class));
            dependencies.put(HrEmployeeMapper.class, sessions.getMapper(HrEmployeeMapper.class));
            salaries = sessions.getMapper(HrSalarySlipMapper.class); dependencies.put(HrSalarySlipMapper.class, salaries);
            HrRuleSupport support = construct(HrRuleSupport.class, dependencies); dependencies.put(HrRuleSupport.class, support);
            HrCommissionService commissions = new HrCommissionService(null, sessions.getMapper(HrCompChangeMapper.class),
                    sessions.getMapper(HrCompComponentMapper.class), null, salaries, null, null, support, JSON);
            dependencies.put(HrCommissionService.class, commissions);
            HolidayCalendarService calendar = (HolidayCalendarService) Proxy.newProxyInstance(HolidayCalendarService.class.getClassLoader(), new Class<?>[]{HolidayCalendarService.class}, (proxy, method, values) -> {
                if (!CALENDAR_AVAILABLE[0]) throw new AssertionError("Sampling must never recalculate historical work calendars");
                if ("resolveCalendarId".equals(method.getName())) return 1L;
                if ("isWorkday".equals(method.getName())) return ((LocalDate) values[1]).getDayOfWeek().getValue() <= 5;
                throw new AssertionError("Unexpected calendar method " + method.getName());
            });
            dependencies.put(HolidayCalendarService.class, calendar);
            payroll = construct(HrPayrollCalculationService.class, dependencies); dependencies.put(HrPayrollCalculationService.class, payroll);
            ess = construct(HrEssServiceImpl.class, dependencies);
            boolean[] allowed = { true };
            HrHSupport access = new HrHSupport(null, null, null, null, null, null, null, null, null, JSON, null) {
                @Override public void permission(String permission) { if (!allowed[0] || !"hr:settlement:calculate".equals(permission)) throw HrHException.forbidden(); }
                @Override public void scope(Long id) { if (!Long.valueOf(992001).equals(id)) throw HrHException.forbidden(); }
                @Override public HrEmployee employee(Long id) { return support.employee(id); }
            };
            source = new HrSettlementSalarySource(salaries, sessions.getMapper(HrPayrollCorrectionMapper.class), ess, access, JSON, commissions);
            compensation = new HrEmployeeComp(); compensation.setId(992030L); compensation.setTenantId(100000L); compensation.setEmployeeId(992001L);
            compensation.setStructureId(992020L); compensation.setVersion(4); compensation.setEffectiveDate(LocalDate.of(2025, 1, 1));
            configured("0.01", "0.02");
            HrSalarySlip first = wage("2026-01-01", "2026-01-15"); HrSalarySlip last = wage("2026-01-16", "2026-01-31");
            money("0.01", first.getGrossTotal(), "first half cumulative rounded"); money("0.02", last.getGrossTotal(), "second half preserves wage tail cent");
            HrSettlementSalarySource.Inspection valid = inspect("2026-01-31", "1", "2026-01"); ready(valid, "two installments cover month");
            equal(BigInteger.ONE, valid.samples().get(0).amountNumerator(), "selected component exact numerator"); equal(BigInteger.valueOf(100), valid.samples().get(0).amountDenominator(), "attributed installments sum to original selected component");
            HrSalarySlip foreign = wage("2026-01-01", "2026-01-31"); jdbc.update("UPDATE hr_salary_slip SET tenant_id=100001 WHERE id=?", foreign.getId());
            HrSalarySlip peer = wage("2026-01-01", "2026-01-31"); jdbc.update("UPDATE hr_salary_slip SET employee_id=992002 WHERE id=?", peer.getId());
            ready(inspect("2026-01-31", "1", "2026-01"), "other tenant and employee cannot affect sampling");
            HrSeveranceRuleService policyFixture = new HrSeveranceRuleService(null, null, null, null, null, null, JSON) {
                @Override public SettlementPolicy forSettlement(Long id, LocalDate date) {
                    HrSettlementCalculation.Policy policy = new HrSettlementCalculation.Policy("CONFIRMED", LocalDate.of(2020, 1, 1), null, 12,
                            "ACTUAL_MONTHS", List.of(new HrSettlementCalculation.Slab(0, BigDecimal.ZERO, null, "FIXED", new BigDecimal("3"))),
                            null, null, null, BigDecimal.ZERO, new BigDecimal("21.75"), new BigDecimal("8"), BigDecimal.ONE, java.math.RoundingMode.HALF_UP);
                    return new SettlementPolicy(policy, Set.of(992010L), JSON.createObjectNode().put("fixturePolicyId", id.toString()));
                }
            };
            HrSettlementCompensationSource aggregate = new HrSettlementCompensationSource(policyFixture, source, access, JSON);
            HrSettlementCompensationSource.Inspection result = aggregate.inspect(992001L, LocalDate.of(2026, 1, 31), 1L, selection("1", "2026-01"));
            equal(List.of(), result.issues(), "policy and actual wages aggregate without missing sources"); money("0.03", result.result().severanceAmount(), "aggregate exact selected amount times confirmed factor");
            money("0.01", result.leaveCash("DAY", new BigDecimal("21.75")), "leave calculation reuses reviewed sample and denominator");
            equal("SUM_POSTED_ITEMS", result.evidence().path("rounding").path("totalMethod").asText(), "aggregate preserves approved rounding rules");
            equal(null, aggregate.inspect(992001L, LocalDate.of(2026, 1, 31), null, selection("1", "2026-01")).result(), "missing policy cannot invent compensation");
            String originalDigest = first.getDigestSha256();
            jdbc.update("UPDATE hr_comp_component SET component_name='已更名',component_code='RENAMED',version=version+1 WHERE id=992010");
            ready(inspect("2026-01-31", "1", "2026-01"), "current project name does not replace sealed identity");
            equal(originalDigest, salaries.selectById(first.getId()).getDigestSha256(), "sampling never changes wage digest");
            jdbc.update("UPDATE hr_comp_component SET component_code='SAMPLE_A' WHERE id=992010");
            jdbc.update("UPDATE hr_salary_slip SET digest_sha256=NULL WHERE id=?", first.getId());
            incomplete(inspect("2026-01-31", "1", "2026-01"), "missing seal");
            equal(null, salaries.selectById(first.getId()).getDigestSha256(), "missing historical digest is not backfilled");
            jdbc.update("UPDATE hr_salary_slip SET digest_sha256=? WHERE id=?", originalDigest, first.getId());
            jdbc.update("UPDATE hr_salary_slip SET gross_total=7 WHERE id=?", first.getId()); incomplete(inspect("2026-01-31", "1", "2026-01"), "tampered wage");
            jdbc.update("UPDATE hr_salary_slip SET gross_total=? WHERE id=?", first.getGrossTotal(), first.getId());
            jdbc.update("UPDATE hr_salary_slip SET status='CANCELLED' WHERE id=?", last.getId()); incomplete(inspect("2026-01-31", "1", "2026-01"), "missing half month is not zero");
            jdbc.update("UPDATE hr_salary_slip SET status='PAID' WHERE id=?", last.getId());
            HrSalarySlip overlap = wage("2026-01-01", "2026-01-31"); incomplete(inspect("2026-01-31", "1", "2026-01"), "overlapping sealed wages"); cancel(overlap);
            incomplete(inspect("2026-02-28", "2", "2026-01", "2026-02"), "missing entire month");
            incomplete(inspect("2026-01-30", "1", "2026-01"), "payroll period after exit");
            allowed[0] = false; forbidden(() -> inspect("2026-01-31", "1", "2026-01")); allowed[0] = true;
            forbidden(() -> source.inspect(992002L, LocalDate.of(2026, 1, 31), selection("1", "2026-01"), Set.of(992010L)));
            cancel(first); cancel(last);
            crossMonth(); malformed(); correction();
            System.out.println("H2_SETTLEMENT_SALARY_SAMPLING_DATABASE: checks=" + checks + "; failed=0; mysql=true; actual_mappers=true; actual_base_proration=true; actual_component_builder=true; actual_digest=true; calendar_fixture=true; permissions_fixture=true; aggregate_policy_fixture=true; real_http=false; settlement_posting=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void crossMonth() throws Exception {
        jdbc.update("UPDATE hr_employee SET hire_date='2026-01-16' WHERE id=992001"); configured("1000", "2100");
        jdbc.update("UPDATE hr_comp_structure SET component_config=JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','PER_PERIOD','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')) WHERE id=992020");
        HrSalarySlip cross = wage("2026-01-16", "2026-02-15"); money("3100", cross.getGrossTotal(), "per-period total preserved across month boundary");
        HrSettlementSalarySource.Inspection result = inspect("2026-02-15", "1", "2026-01", "2026-02"); ready(result, "partial service month covered through exit");
        equal(BigInteger.valueOf(16000), result.samples().get(0).amountNumerator(), "January component numerator from 16 of 31 days");
        equal(BigInteger.valueOf(31), result.samples().get(0).amountDenominator(), "January exact denominator");
        equal("1", result.evidence().path("averagingMonths").asText(), "reviewed divisor independent of sampled month count"); cancel(cross);
        jdbc.update("UPDATE hr_comp_structure SET component_config=JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')) WHERE id=992020");
        HrSalarySlip monthly = wage("2026-01-16", "2026-02-15"); money("3260.71", monthly.getGrossTotal(), "monthly amounts retain original cumulative rounding"); ready(inspect("2026-02-15", "1", "2026-01", "2026-02"), "cross month monthly basis"); cancel(monthly);
        jdbc.update("UPDATE hr_employee SET hire_date='2026-01-01' WHERE id=992001");
        jdbc.update("UPDATE hr_comp_structure SET component_config=JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','WORKDAYS','benefitTiming','FIRST_PAYROLL')) WHERE id=992020");
        HrSalarySlip a = wage("2026-01-01", "2026-01-15"); HrSalarySlip b = wage("2026-01-16", "2026-01-31");
        CALENDAR_AVAILABLE[0] = false; ready(inspect("2026-01-31", "1", "2026-01"), "sealed workday quantities do not read current calendar"); CALENDAR_AVAILABLE[0] = true;
        cancel(a); cancel(b);
        jdbc.update("UPDATE hr_comp_structure SET component_config=JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')) WHERE id=992020");
    }

    private static void malformed() throws Exception {
        configured("1000", "2100");
        HrSalarySlip original = wage("2026-01-01", "2026-01-31");
        Map<String, Object> basis = find(original, "type", "PAYROLL_BASIS"); basis.remove("monthlyPortions"); persist(original); incomplete(inspect("2026-01-31", "1", "2026-01"), "legacy missing allocation evidence"); cancel(original);
        HrSalarySlip duplicate = wage("2026-01-01", "2026-01-31"); find(duplicate, "salaryComponentId", "992010").put("salaryComponentIdentity", "DUPLICATE"); persist(duplicate); incomplete(inspect("2026-01-31", "1", "2026-01"), "duplicate identity"); cancel(duplicate);
        HrSalarySlip unknown = wage("2026-01-01", "2026-01-31"); find(unknown, "salaryComponentId", "992010").remove("salaryComponentId"); persist(unknown); incomplete(inspect("2026-01-31", "1", "2026-01"), "unknown identity not guessed from matching name"); cancel(unknown);
        HrSalarySlip changed = wage("2026-01-01", "2026-01-31"); find(changed, "type", "PAYROLL_BASIS").put("configuredSalary", new BigDecimal("9999")); persist(changed); incomplete(inspect("2026-01-31", "1", "2026-01"), "component sum inconsistent with sealed basis"); cancel(changed);
        HrSalarySlip pending = wage("2026-01-01", "2026-01-31"); pending.setStatus("DRAFT"); persist(pending); incomplete(inspect("2026-01-31", "1", "2026-01"), "draft not sampleable"); cancel(pending);
        HrSalarySlip variable = wage("2026-01-01", "2026-01-31"); variable.getComponents().add(new HashMap<>(Map.of("type", "EARNING", "name", "普通奖金", "amount", BigDecimal.ONE, "changeId", 55L)));
        variable.setGrossTotal(variable.getGrossTotal().add(BigDecimal.ONE)); variable.setNetTotal(variable.getGrossTotal()); persist(variable); incomplete(inspect("2026-01-31", "1", "2026-01"), "unattributed variable cannot silently disappear"); cancel(variable);
        configured("0", "0"); HrSalarySlip zero = wage("2026-01-01", "2026-01-31"); ready(inspect("2026-01-31", "1", "2026-01"), "verified real zero wage is retained"); cancel(zero);
    }

    private static void correction() throws Exception {
        configured("1000", "2100"); HrSalarySlip original = wage("2026-01-01", "2026-01-31");
        HrSalarySlip delta = wage("2026-02-01", "2026-02-28"); delta.setComponents(new ArrayList<>());
        delta.getComponents().add(new HashMap<>(Map.of("type", "EARNING", "name", "应发补正差额", "amount", new BigDecimal("10"))));
        delta.getComponents().add(new HashMap<>(Map.of("type", "TAX_SNAPSHOT", "periodStart", "2026-02-01", "periodEnd", "2026-02-28", "correction", true, "originalSlipId", original.getId())));
        delta.setGrossTotal(new BigDecimal("10")); delta.setDeductionTotal(BigDecimal.ZERO); delta.setNetTotal(new BigDecimal("10")); persist(delta);
        jdbc.update("INSERT INTO hr_payroll_correction(tenant_id,original_slip_id,correction_slip_id,reason,status,version,deleted) VALUES(100000,?,?,'核实原月份收入归属','APPLIED',0,0)", original.getId(), delta.getId());
        incomplete(inspect("2026-02-28", "1", "2026-01"), "later correction affects selected original month");
        find(delta, "type", "EARNING").put("amount", BigDecimal.ZERO); delta.setGrossTotal(BigDecimal.ZERO); delta.setNetTotal(BigDecimal.ZERO); persist(delta);
        ready(inspect("2026-02-28", "1", "2026-01"), "verified deduction-only correction does not invent income");
        jdbc.update("UPDATE hr_payroll_correction SET status='PENDING' WHERE correction_slip_id=?", delta.getId()); incomplete(inspect("2026-02-28", "1", "2026-01"), "pending original correction blocks sampling");
        jdbc.update("UPDATE hr_payroll_correction SET status='APPLIED' WHERE correction_slip_id=?", delta.getId());
        jdbc.update("UPDATE hr_payroll_correction SET status='REJECTED' WHERE correction_slip_id=?", delta.getId());
        jdbc.update("UPDATE hr_salary_slip SET status='CANCELLED' WHERE id=?", delta.getId());
        ready(inspect("2026-02-28", "1", "2026-01"), "cancelled rejected correction preserves original wage source");
        jdbc.update("UPDATE hr_salary_slip SET status='PAID' WHERE id=?", delta.getId());
        jdbc.update("UPDATE hr_payroll_correction SET status='APPLIED' WHERE correction_slip_id=?", delta.getId());
        jdbc.update("UPDATE hr_salary_slip SET deleted=1 WHERE id=?", delta.getId()); incomplete(inspect("2026-02-28", "1", "2026-01"), "deleted linked correction cannot disappear");
    }

    private static void configured(String a, String b) { compensation.setComponentValues(Map.of("SAMPLE_A", a, "SAMPLE_B", b)); compensation.setTotalSalary(new BigDecimal(a).add(new BigDecimal(b))); }
    private static HrSalarySlip wage(String from, String to) throws Exception {
        HrPayrollPeriod period = new HrPayrollPeriod(); period.setStartDate(LocalDate.parse(from)); period.setEndDate(LocalDate.parse(to));
        HrPayrollCalculationService.PayrollBase base = payroll.baseCompensation(compensation, period);
        Method builder = HrEssServiceImpl.class.getDeclaredMethod("buildSlipComponents", HrEmployeeComp.class, BigDecimal.class, BigDecimal.class, BigDecimal.class); builder.setAccessible(true);
        Object built = builder.invoke(ess, compensation, compensation.getTotalSalary(), BigDecimal.ZERO, BigDecimal.ZERO);
        List<Map<String, Object>> components = JSON.convertValue(built, new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() { });
        components.add(base.snapshot()); components.add(new HashMap<>(Map.of("type", "EARNING", "sourceType", "PAYROLL_PRORATION_ADJUSTMENT", "amount", base.gross().subtract(compensation.getTotalSalary()))));
        components.add(new HashMap<>(Map.of("type", "TAX_SNAPSHOT", "periodStart", from, "periodEnd", to, "correction", false)));
        HrSalarySlip slip = new HrSalarySlip(); slip.setId(nextId++); slip.setTenantId(100000L); slip.setEmployeeId(992001L); slip.setPeriodMonth(to.substring(0, 7));
        slip.setStatus("PAID"); slip.setVersion(0); slip.setDeleted(0); slip.setGrossTotal(base.gross()); slip.setDeductionTotal(BigDecimal.ZERO); slip.setNetTotal(base.gross());
        slip.setTaxAmount(BigDecimal.ZERO); slip.setBenefitAmount(BigDecimal.ZERO); slip.setCurrentTax(BigDecimal.ZERO);
        slip.setCumulativeTaxableIncome(BigDecimal.ZERO); slip.setCumulativeDeduction(BigDecimal.ZERO);
        slip.setCumulativeTaxPayable(BigDecimal.ZERO); slip.setCumulativeTaxPaid(BigDecimal.ZERO);
        slip.setComponents(components); slip.setPayDate(LocalDate.parse(to)); ess.sealSalarySlip(slip); salaries.insert(slip); return slip;
    }
    private static void persist(HrSalarySlip row) { ess.sealSalarySlip(row); salaries.updateById(row); }
    private static void cancel(HrSalarySlip row) { jdbc.update("UPDATE hr_salary_slip SET status='CANCELLED' WHERE id=?", row.getId()); }
    private static Map<String, Object> find(HrSalarySlip row, String key, String value) { return row.getComponents().stream().filter(part -> value.equals(String.valueOf(part.get(key)))).findFirst().orElseThrow(); }
    private static SamplingSelection selection(String divisor, String... months) { return new SamplingSelection(java.util.Arrays.stream(months).map(YearMonth::parse).toList(), new BigDecimal(divisor), "按适用测试政策逐单核定"); }
    private static HrSettlementSalarySource.Inspection inspect(String exit, String divisor, String... months) { return source.inspect(992001L, LocalDate.parse(exit), selection(divisor, months), Set.of(992010L)); }
    private static void ready(HrSettlementSalarySource.Inspection value, String label) { equal(List.of(), value.issues(), label); equal(true, !value.samples().isEmpty(), label + " samples exist"); }
    private static void incomplete(HrSettlementSalarySource.Inspection value, String label) { equal(true, !value.issues().isEmpty(), label + " explicit issues"); equal(List.of(), value.samples(), label + " cannot calculate partial result"); }
    private static void forbidden(Runnable action) { try { action.run(); } catch (HrHException expected) { checks++; return; } throw new AssertionError("Access must reject"); }
    private static void money(String expected, BigDecimal actual, String label) { equal(0, new BigDecimal(expected).compareTo(actual), label); }
    private static void equal(Object expected, Object actual, String label) { checks++; if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); }
    private static <T> T construct(Class<T> type, Map<Class<?>, Object> dependencies) throws Exception { Constructor<?> constructor = type.getConstructors()[0]; Object[] arguments = java.util.Arrays.stream(constructor.getParameterTypes()).map(dependencies::get).toArray(); return type.cast(constructor.newInstance(arguments)); }
}
