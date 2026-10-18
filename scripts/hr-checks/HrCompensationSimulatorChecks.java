package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.common.redis.core.SysDictHelper.DictItem;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;
import com.cloudflow.hr.domain.vo.compensation.HrCompensationSimulateVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrCompGradeMapper;
import com.cloudflow.hr.mapper.HrCompStructureMapper;
import com.cloudflow.hr.service.impl.HrCompensationSimulationServiceImpl;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

/** Actual configuration rows and production service; configuration reads are controlled inputs. */
public final class HrCompensationSimulatorChecks {
    private static int checks;
    private final JdbcTemplate jdbc;
    private final Map<String, String> configuration = new HashMap<>();
    private final List<DictItem> dictionary = new ArrayList<>();
    private final HrCompensationSimulationServiceImpl service;

    private HrCompensationSimulatorChecks(HikariDataSource source) throws Exception {
        jdbc = new JdbcTemplate(source);
        MybatisConfiguration mapping = new MybatisConfiguration();
        mapping.setMapUnderscoreToCamelCase(true);
        mapping.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        mapping.addMapper(HrCompComponentMapper.class);
        mapping.addMapper(HrCompGradeMapper.class);
        mapping.addMapper(HrCompStructureMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(mapping);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        SysConfigHelper settings = new SysConfigHelper() {
            @Override public String getConfigValue(String key, String fallback) {
                return configuration.getOrDefault(key, fallback);
            }
        };
        SysDictHelper dictionaries = new SysDictHelper() {
            @Override public List<DictItem> getDictData(String key) {
                if (!"hr_personal_income_tax".equals(key)) throw new AssertionError("Unexpected dictionary");
                return dictionary;
            }
        };
        service = new HrCompensationSimulationServiceImpl(sessions.getMapper(HrCompComponentMapper.class),
                sessions.getMapper(HrCompGradeMapper.class), sessions.getMapper(HrCompStructureMapper.class),
                null, null, settings, dictionaries);
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned scratch database required");
        }
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate ownership = new JdbcTemplate(source);
            require(Path.of(arguments[1]).toRealPath().equals(Path.of(Objects.requireNonNull(ownership.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
            UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
            HrCompensationSimulatorChecks fixture = new HrCompensationSimulatorChecks(source);
            fixture.structureBoundaries();
            fixture.gradeBoundaries();
            fixture.taxConfiguration();
            System.out.println("D3_SIMULATOR_CONFIG: checks=" + checks + "; actual_mysql=true; actual_service=true; production_tenant_interceptor=true; configuration_read_fixture=true; http=false; official_tax_policy=false");
        }
    }

    private void structureBoundaries() {
        jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,category,taxable,status) VALUES (991910,100000,'SIM_BASE','基本工资','FIXED','BASE',1,1),(991911,100000,'SIM_BONUS','不计税补贴','VARIABLE','BONUS',0,1),(991912,100000,'SIM_DEDUCT','扣减','DEDUCTION','OTHER',1,1),(991913,100000,'SIM_COMPANY','公司成本','COMPANY','BENEFIT',1,1),(991914,100001,'SIM_BASE','异租户工资','FIXED','BASE',1,1)");
        jdbc.update("INSERT INTO hr_comp_structure(id,tenant_id,structure_code,structure_name,component_config,status) VALUES(991920,100000,'SIM_CONFIG','配置边界',?,1),(991921,100001,'SIM_CONFIG','异租户结构',?,1)", "{\"itemIds\":[991910,991911,991912,991913]}", "{\"itemIds\":[991914]}");
        HrCompensationSimulateRequest mixed = request();
        mixed.setComponentOverrides(Map.of("SIM_BASE", new BigDecimal("10000.01"), "SIM_BONUS", new BigDecimal("100.02"),
                "SIM_DEDUCT", new BigDecimal("23.45"), "SIM_COMPANY", new BigDecimal("999.99")));
        HrCompensationSimulateVO value = simulate(mixed);
        money("10076.58", value.getGross(), "employee income excludes company cost");
        money("9976.56", value.getTaxableGross(), "non-taxable benefit excluded from taxable wage");
        money("287.66", value.getPersonalTax(), "independent expected monthly estimate");
        money("9788.92", value.getNetSalary(), "independent expected net");
        for (String json : List.of("{}", "{\"itemIds\":null}", "{\"itemIds\":{}}", "{\"itemIds\":[]}",
                "{\"itemIds\":[991910,991910]}", "{\"itemIds\":[\"991910\"]}", "{\"itemIds\":[991910.5]}",
                "{\"itemIds\":[0]}", "{\"itemIds\":[-1]}", "{\"itemIds\":[9223372036854775808]}",
                "{\"itemIds\":[999999999]}", "{\"itemIds\":[991910,991914]}")) {
            structure(json); denied(request(), "invalid or foreign structure member");
        }
        structure("{\"itemIds\":[991910]}");
        jdbc.update("UPDATE hr_comp_component SET status=0 WHERE id=991910");
        denied(request(), "disabled component");
        jdbc.update("UPDATE hr_comp_component SET status=1,component_type='UNKNOWN' WHERE id=991910");
        denied(request(), "unsupported component type");
        jdbc.update("UPDATE hr_comp_component SET component_type='FIXED',taxable=3 WHERE id=991910");
        denied(request(), "invalid tax flag");
        jdbc.update("UPDATE hr_comp_component SET taxable=1,component_code=' ' WHERE id=991910");
        denied(request(), "blank component code");
        jdbc.update("UPDATE hr_comp_component SET component_code='SIM_BASE' WHERE id=991910");
        jdbc.update("UPDATE hr_comp_structure SET status=0 WHERE id=991920");
        denied(request(), "disabled structure");
        jdbc.update("UPDATE hr_comp_structure SET status=1 WHERE id=991920");
        HrCompensationSimulateRequest foreign = request(); foreign.setStructureId(991921L);
        denied(foreign, "foreign structure");
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L);
        money("10000.00", simulate(foreign).getGross(), "foreign tenant own component");
        denied(request(), "reverse tenant structure");
        UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
    }

    private void gradeBoundaries() {
        jdbc.update("INSERT INTO hr_comp_grade(id,tenant_id,grade_code,grade_name,min_salary,mid_salary,max_salary,currency,status) VALUES(991930,100000,'SIM_CNY','有效薪级','0.00','5000.01','10000.00','CNY',1),(991931,100000,'SIM_OFF','停用薪级','0.00','5000.01','10000.00','CNY',0),(991932,100000,'SIM_USD','非人民币','0.00','5000.01','10000.00','USD',1),(991933,100001,'SIM_CNY','异租户','0.00','5000.01','10000.00','CNY',1)");
        HrCompensationSimulateRequest selected = request(); selected.setGradeId(991930L); selected.setComponentOverrides(Map.of());
        money("5000.01", simulate(selected).getGross(), "missing base uses selected grade");
        for (long grade : List.of(991931L, 991932L, 991933L, 999999999L)) {
            selected.setGradeId(grade); denied(selected, "inactive foreign absent or non-CNY grade");
        }
        selected.setGradeId(991930L);
        structure("{\"itemIds\":[991911]}"); denied(selected, "grade cannot invent base component");
        jdbc.update("UPDATE hr_comp_component SET category='BASE' WHERE id=991911");
        structure("{\"itemIds\":[991910,991911]}"); denied(selected, "grade cannot split between two bases");
        jdbc.update("UPDATE hr_comp_component SET category='BONUS' WHERE id=991911");
        structure("{\"itemIds\":[991910]}");
    }

    private void taxConfiguration() {
        for (String invalid : List.of("bad", "-0.01", "0.001", "10000000000000000.00")) {
            configuration.put("sys.hr.compensation.monthlyTaxThreshold", invalid); denied(request(), "invalid configured threshold");
        }
        configuration.clear();
        HrCompensationSimulateRequest defaults = request(); defaults.setSocialPersonalRate(null);
        for (String invalid : List.of("bad", "-0.01", "1.01")) {
            configuration.put("sys.hr.compensation.socialPersonalRate", invalid); denied(defaults, "invalid configured social rate");
        }
        configuration.clear();
        syntheticTax(); Collections.reverse(dictionary);
        money("150.00", simulate(request()).getPersonalTax(), "unsorted seven-tier synthetic dictionary loaded");
        require("99999999".equals(dictionary.get(0).getValue()), "input dictionary order preserved");
        configuration.put("sys.hr.compensation.monthlyTaxThreshold", "6000.00");
        configuration.put("sys.hr.compensation.socialPersonalRate", "0.20");
        HrCompensationSimulateVO configured = simulate(defaults);
        money("6000.00", configured.getThreshold(), "configured threshold applied");
        money("2000.00", configured.getSocialPersonal(), "configured social rate applied");
        money("30.00", configured.getPersonalTax(), "configured taxable two thousand");
        configuration.clear();
        syntheticTax(); dictionary.remove(6); denied(request(), "incomplete configured tax table");
        syntheticTax(); dictionary.get(1).setValue("1000"); denied(request(), "duplicate tier upper bound");
        syntheticTax(); dictionary.get(1).setValue("bad"); denied(request(), "malformed tier upper bound");
        syntheticTax(); dictionary.get(6).setValue("7000"); denied(request(), "finite final tier");
        syntheticTax(); dictionary.get(1).setListClass("1.01"); denied(request(), "invalid tax rate");
        syntheticTax(); dictionary.get(1).setCssClass("-1"); denied(request(), "negative quick deduction");
        syntheticTax(); dictionary.get(1).setCssClass("0.001"); denied(request(), "sub-cent quick deduction");
        syntheticTax(); dictionary.get(1).setCssClass("11"); denied(request(), "discontinuous quick deduction");
        dictionary.clear();
        money("290.00", simulate(request()).getPersonalTax(), "absent dictionary uses existing monthly estimate");
    }

    private void syntheticTax() {
        dictionary.clear();
        for (int tier = 1; tier <= 7; tier++) {
            dictionary.add(new DictItem(tier, "SYNTHETIC_" + tier, tier == 7 ? "99999999" : Integer.toString(tier * 1000),
                    new BigDecimal(tier).movePointLeft(2).toPlainString(), Integer.toString(5 * tier * (tier - 1))));
        }
    }

    private void structure(String json) { jdbc.update("UPDATE hr_comp_structure SET component_config=? WHERE id=991920", json); }

    private static HrCompensationSimulateRequest request() {
        HrCompensationSimulateRequest request = new HrCompensationSimulateRequest();
        request.setStructureId(991920L); request.setSocialPersonalRate(BigDecimal.ZERO);
        request.setComponentOverrides(Map.of("SIM_BASE", new BigDecimal("10000.00")));
        return request;
    }

    private List<List<Map<String, Object>>> snapshot() {
        return List.of(jdbc.queryForList("SELECT * FROM hr_comp_component ORDER BY id"),
                jdbc.queryForList("SELECT * FROM hr_comp_structure ORDER BY id"), jdbc.queryForList("SELECT * FROM hr_comp_grade ORDER BY id"),
                jdbc.queryForList("SELECT * FROM hr_employee_comp ORDER BY id"), jdbc.queryForList("SELECT * FROM hr_salary_slip ORDER BY id"));
    }

    private HrCompensationSimulateVO simulate(HrCompensationSimulateRequest request) {
        List<List<Map<String, Object>>> before = snapshot();
        try { return service.simulate(request); }
        finally { require(before.equals(snapshot()), "simulation preserves configuration and salary rows"); }
    }

    private void denied(HrCompensationSimulateRequest request, String label) {
        try { simulate(request); }
        catch (HrBusinessException expected) { require("SIMULATION_INVALID".equals(expected.getCode()), label); return; }
        throw new AssertionError("Expected rejection: " + label);
    }

    private static void money(String expected, BigDecimal actual, String label) { require(new BigDecimal(expected).compareTo(actual) == 0, label); }
    private static void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
}
