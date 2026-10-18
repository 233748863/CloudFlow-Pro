package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.dto.HrSeveranceRuleRequests;
import com.cloudflow.hr.domain.vo.settlement.HrSeveranceRuleView;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.BeanUtils;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.multipart.MultipartFile;

public final class HrSeveranceRuleChecks {
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private static final ThreadLocal<Boolean> PERMITTED = ThreadLocal.withInitial(() -> true);
    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule());

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        Path run = Path.of(arguments[1]).toRealPath().getParent();
        Path directory = run.resolve("severance-files-" + UUID.randomUUID().toString().replace("-", "")).toAbsolutePath().normalize();
        if (!directory.startsWith(run) || !run.getFileName().toString().matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Owned run required");
        Files.createDirectory(directory);
        try (HikariDataSource source = new HikariDataSource(); ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(4);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "database ownership");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setBanner(false);
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapper : List.of(HrSeveranceRuleMapper.class, HrSeveranceRuleSlabMapper.class, HrEmployeeMapper.class,
                    HrHMapper.class, HrFileStorageMapper.class, HrAuditLogMapper.class, HrPositionMapper.class, HrSalarySlipMapper.class, TenantQuotaMapper.class)) configuration.addMapper(mapper);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            List<FileSystemResource> resources = new ArrayList<>();
            for (String mapper : List.of("HrSeveranceRule", "HrSeveranceRuleSlab", "HrH", "HrFileStorage", "HrAuditLog")) {
                resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + mapper + "Mapper.xml"));
            }
            resources.add(new FileSystemResource("cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/TenantQuotaMapper.xml"));
            factory.setMapperLocations(resources.toArray(FileSystemResource[]::new));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            HrRuleSupport support = new HrRuleSupport(new DataSourceTransactionManager(source), null, sessions.getMapper(HrEmployeeMapper.class),
                    sessions.getMapper(HrAuditLogMapper.class), JSON, sessions.getMapper(HrPositionMapper.class));
            HrHSupport access = new HrHSupport(support, sessions.getMapper(HrHMapper.class), sessions.getMapper(HrEmployeeMapper.class),
                    null, null, null, null, null, null, JSON, validators.getValidator()) {
                @Override public boolean permitted(String permission) { return PERMITTED.get() && List.of("hr:severance:manage", "hr:settlement:calculate").contains(permission); }
            };
            TenantQuotaService quotas = new TenantQuotaService(sessions.getMapper(TenantQuotaMapper.class));
            HrFileStorage storage = new HrFileStorage(sessions.getMapper(HrFileStorageMapper.class), quotas);
            Field base = HrFileStorage.class.getDeclaredField("baseDir"); base.setAccessible(true); base.set(storage, directory.toString());
            HrSeveranceRuleService service = new HrSeveranceRuleService(sessions.getMapper(HrSeveranceRuleMapper.class), sessions.getMapper(HrSeveranceRuleSlabMapper.class), access, support, storage, quotas, JSON);
            jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,password,status,deleted) VALUES (991801,100000,100,'severance_hr','政策HR','unused','0',0),(991802,100001,100,'severance_foreign','外租户','unused','0',0)");
            jdbc.update("INSERT INTO hr_comp_component (id,tenant_id,component_code,component_name,component_type,status,version) VALUES (991801,100000,'POLICY_FIXED','政策固定工资','FIXED',1,0),(991802,100001,'POLICY_FOREIGN','外租户工资','FIXED',1,0),(991803,100000,'POLICY_DEDUCTION','扣款','DEDUCTION',1,0)");
            actor(100000L, true); business(service, storage, jdbc, directory); concurrency(service);
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_SEVERANCE_POLICY' AND after_data LIKE '%private-policy-content%'", Integer.class), "audit omits file contents");
            System.out.println("H2_SEVERANCE_POLICY_DATABASE: checks=" + CHECKS.get() + "; failed=0; mysql=true; actual_service=true; actual_file_storage=true; actual_quota=true; permission_fixture=true; http=false; concurrency_groups=1");
        } finally {
            UserContext.clear(); TenantContext.clear(); PERMITTED.remove();
            try (Stream<Path> paths = Files.walk(directory)) {
                for (Path target : paths.sorted(Comparator.reverseOrder()).toList()) {
                    if (!target.toAbsolutePath().normalize().startsWith(directory)) throw new IllegalStateException("Unsafe file cleanup");
                    Files.delete(target);
                }
            }
        }
    }

    private static HrSeveranceRuleRequests.Create draft(String code) {
        HrSeveranceRuleRequests.Create input = new HrSeveranceRuleRequests.Create();
        input.setRuleCode(code); input.setRuleName("测试补偿政策"); input.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        input.setSalaryComponentIds(List.of(991801L)); input.setAveragingMonths(12); input.setServiceRounding("ACTUAL_MONTHS");
        input.setNoticeMonths(BigDecimal.ZERO); input.setRemark("核定依据");
        HrSeveranceRuleRequests.Slab slab = new HrSeveranceRuleRequests.Slab(); slab.setSortNo(0); slab.setMinServiceYears(BigDecimal.ZERO);
        slab.setCalculationMode("PER_YEAR"); slab.setCompensationMonths(BigDecimal.ONE); input.setSlabs(List.of(slab)); return input;
    }
    private static HrSeveranceRuleRequests.Update update(HrSeveranceRuleView row) {
        HrSeveranceRuleRequests.Update input = new HrSeveranceRuleRequests.Update(); BeanUtils.copyProperties(row.settings(), input); input.setVersion(row.version()); return input;
    }
    private static HrHRequests.VersionDTO version(int value) { HrHRequests.VersionDTO input = new HrHRequests.VersionDTO(); input.setVersion(value); return input; }

    private static void business(HrSeveranceRuleService service, HrFileStorage storage, JdbcTemplate jdbc, Path directory) throws Exception {
        HrSeveranceRuleRequests.Create incomplete = draft("incomplete"); incomplete.setSalaryComponentIds(List.of()); incomplete.setSlabs(List.of());
        Long incompleteId = service.create(incomplete); equal(3, service.detail(incompleteId).missingRequirements().size(), "incomplete draft lists three missing requirements");
        reject(() -> service.confirm(incompleteId, version(0)), "SEVERANCE_POLICY_INCOMPLETE");
        HrSeveranceRuleRequests.Create input = draft("policy-main"); Long identifier = service.create(input);
        reject(() -> service.create(input), "SEVERANCE_CODE_EXISTS");
        equal("DRAFT", service.detail(identifier).status(), "create is only draft");
        reject(() -> service.forSettlement(identifier, LocalDate.of(2026, 9, 30)), "SEVERANCE_POLICY_UNCONFIRMED");
        equal(List.of(991801L), service.detail(identifier).settings().getSalaryComponentIds(), "component IDs round trip");
        equal(true, service.components().stream().anyMatch(row -> row.value().equals(991801L)), "actual income option");
        equal(false, service.components().stream().anyMatch(row -> List.of(991802L,991803L).contains(row.value())), "foreign and deduction excluded");
        input.setRuleCode("foreign-component"); input.setSalaryComponentIds(List.of(991802L)); reject(() -> service.create(input), "INVALID_PARAMETER");
        input.setSalaryComponentIds(List.of(991801L,991801L)); reject(() -> service.create(input), "INVALID_PARAMETER");
        actor(100000L, false); reject(() -> service.detail(identifier), "FORBIDDEN"); reject(() -> service.create(draft("no-permission")), "FORBIDDEN");
        actor(100001L, true); reject(() -> service.detail(identifier), "SEVERANCE_RULE_NOT_FOUND"); equal(0L, service.list(new HrSeveranceRuleRequests.Query()).getTotal(), "foreign tenant list empty");
        actor(100000L, true);
        byte[] pdf = "%PDF-1.4\nprivate-policy-content\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        MemoryFile file = new MemoryFile("核定政策.pdf", pdf);
        HrSeveranceRuleView uploaded = service.uploadPolicy(identifier, 0, file);
        equal(1, uploaded.version(), "upload advances version"); equal(0, uploaded.missingRequirements().size(), "complete policy ready");
        equal(uploaded.policyFile().fileId(), service.uploadPolicy(identifier, 1, file).policyFile().fileId(), "same file replay uses current binding");
        reject(() -> service.uploadPolicy(identifier, 0, file), "VERSION_CONFLICT");
        reject(() -> storage.load(uploaded.policyFile().fileId()), null);
        equal(true, java.util.Arrays.equals(pdf, service.download(identifier).getBody()), "private download exact bytes");
        equal("no-store", service.download(identifier).getHeaders().getFirst("Cache-Control"), "policy is not cached");
        actor(100001L, true); reject(() -> service.download(identifier), "SEVERANCE_RULE_NOT_FOUND"); actor(100000L, true);
        jdbc.update("UPDATE sys_file SET file_hash='tampered' WHERE file_id=?", uploaded.policyFile().fileId());
        reject(() -> service.confirm(identifier, version(1)), "SEVERANCE_POLICY_CHANGED");
        jdbc.update("UPDATE sys_file SET file_hash=SHA2(?,256) WHERE file_id=?", pdf, uploaded.policyFile().fileId());
        HrSeveranceRuleRequests.Update changed = update(service.detail(identifier)); changed.setBaseCapMultiplier(new BigDecimal("3.0000"));
        service.update(identifier, changed); reject(() -> service.confirm(identifier, version(2)), "SEVERANCE_POLICY_INCOMPLETE");
        changed = update(service.detail(identifier)); changed.setSocialMonthlySalary(new BigDecimal("12345.67")); changed.setMaxCompensationMonths(new BigDecimal("12.0000"));
        service.update(identifier, changed); equal("12345.67", service.detail(identifier).settings().getSocialMonthlySalary().toPlainString(), "salary cap exact storage");
        HrSeveranceRuleRequests.Update clearing = update(service.detail(identifier)); clearing.setSocialMonthlySalary(null); clearing.setBaseCapMultiplier(null); clearing.setMaxCompensationMonths(null); clearing.setRemark(null);
        service.update(identifier, clearing); equal(null, service.detail(identifier).settings().getSocialMonthlySalary(), "optional money clears"); equal(null, service.detail(identifier).settings().getRemark(), "remark clears");
        reject(() -> service.update(identifier, clearing), "VERSION_CONFLICT");
        HrSeveranceRuleRequests.Update gap = update(service.detail(identifier)); gap.getSlabs().get(0).setMinServiceYears(BigDecimal.ONE); service.update(identifier, gap);
        reject(() -> service.confirm(identifier, version(5)), "SEVERANCE_POLICY_INCOMPLETE");
        HrSeveranceRuleRequests.Update fixed = update(service.detail(identifier)); fixed.getSlabs().get(0).setMinServiceYears(BigDecimal.ZERO); service.update(identifier, fixed);
        jdbc.update("UPDATE hr_comp_component SET status=0 WHERE id=991801"); reject(() -> service.confirm(identifier, version(6)), "SEVERANCE_POLICY_INCOMPLETE");
        jdbc.update("UPDATE hr_comp_component SET status=1 WHERE id=991801");
        long before = countFiles(directory);
        jdbc.execute("CREATE TRIGGER severance_bad_file BEFORE INSERT ON sys_file FOR EACH ROW SET NEW.biz_type='wrong-fixture'");
        try { reject(() -> service.uploadPolicy(identifier, 6, new MemoryFile("替换政策.pdf", "%PDF-1.4\nchanged\n%%EOF".getBytes(StandardCharsets.US_ASCII))), "SEVERANCE_POLICY_BIND_FAILED"); }
        finally { jdbc.execute("DROP TRIGGER severance_bad_file"); }
        equal(before, countFiles(directory), "failed upload removes new physical file");
        equal(uploaded.policyFile().fileId(), service.detail(identifier).policyFile().fileId(), "failed replacement restores prior file");
        equal(6, service.detail(identifier).version(), "failed replacement restores version");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_file WHERE biz_type='wrong-fixture'", Integer.class), "failed metadata rolled back");
        service.confirm(identifier, version(6)); HrSeveranceRuleView confirmed = service.detail(identifier);
        equal("CONFIRMED", confirmed.status(), "confirmed policy saved"); equal(false, confirmed.editable(), "confirmed read only"); equal(991801L, confirmed.confirmedBy(), "actual confirmer recorded");
        HrSeveranceRuleService.SettlementPolicy resolved = service.forSettlement(identifier, LocalDate.of(2026, 9, 30));
        equal(java.util.Set.of(991801L), resolved.componentIds(), "settlement reads confirmed project IDs");
        equal(12, resolved.policy().averagingMonths(), "policy default remains separate from per-case sampling");
        equal("991801", resolved.evidence().path("confirmedBy").asText(), "policy confirmer retained");
        equal(true, resolved.evidence().path("policyFileHash").asText().matches("[a-f0-9]{64}"), "verified actual policy file digest retained");
        reject(() -> service.forSettlement(identifier, LocalDate.of(2025, 12, 31)), "SEVERANCE_POLICY_EXPIRED");
        actor(100001L, true); reject(() -> service.forSettlement(identifier, LocalDate.of(2026, 9, 30)), "SEVERANCE_POLICY_NOT_FOUND");
        actor(100000L, false); reject(() -> service.forSettlement(identifier, LocalDate.of(2026, 9, 30)), "FORBIDDEN"); actor(100000L, true);
        jdbc.update("UPDATE sys_file SET file_hash='tampered' WHERE file_id=?", uploaded.policyFile().fileId());
        reject(() -> service.forSettlement(identifier, LocalDate.of(2026, 9, 30)), "SEVERANCE_POLICY_CHANGED");
        jdbc.update("UPDATE sys_file SET file_hash=SHA2(?,256) WHERE file_id=?", pdf, uploaded.policyFile().fileId());
        reject(() -> service.update(identifier, update(confirmed)), "SEVERANCE_RULE_READ_ONLY"); reject(() -> service.uploadPolicy(identifier, 7, file), "SEVERANCE_RULE_READ_ONLY");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_SEVERANCE_POLICY' AND business_id=? AND operation_type='CONFIRM' AND after_data LIKE '%HALF_UP%'", Integer.class, identifier), "rounding saved in confirmation audit");
        Long referenced = service.create(draft("referenced-draft"));
        jdbc.update("INSERT INTO hr_final_settlement (tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,rule_id) VALUES (100000,'policy-reference',991801,991801,'2020-01-01','2026-01-01',?)", referenced);
        reject(() -> service.update(referenced, update(service.detail(referenced))), "SEVERANCE_RULE_READ_ONLY");
        for (String injected : List.of("tenantId", "status", "confirmedBy", "policyFileId", "ruleId")) {
            try { JSON.readValue("{\"" + injected + "\":1}", HrSeveranceRuleRequests.Create.class); throw new AssertionError("injected field accepted"); }
            catch (com.fasterxml.jackson.core.JsonProcessingException expected) { CHECKS.incrementAndGet(); }
        }
    }

    private static void concurrency(HrSeveranceRuleService service) throws Exception {
        Long identifier = service.create(draft("policy-race")); HrSeveranceRuleRequests.Update input = update(service.detail(identifier));
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<Boolean> action = () -> {
                actor(100000L, true); ready.countDown();
                try { if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("race timeout"); service.update(identifier, input); return true; }
                catch (HrHException failure) { if (!"VERSION_CONFLICT".equals(failure.getCode())) throw failure; return false; }
                finally { UserContext.clear(); TenantContext.clear(); PERMITTED.remove(); }
            };
            List<Future<Boolean>> futures = List.of(workers.submit(action), workers.submit(action)); equal(true, ready.await(10, TimeUnit.SECONDS), "writers ready"); start.countDown();
            int winners = 0; for (Future<Boolean> result : futures) if (result.get(30, TimeUnit.SECONDS)) winners++;
            equal(1, winners, "only one version wins"); equal(1, service.detail(identifier).version(), "one persisted version");
        } finally { workers.shutdownNow(); equal(true, workers.awaitTermination(10, TimeUnit.SECONDS), "workers stopped"); }
    }
    private static void actor(Long tenant, boolean permitted) {
        TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(tenant == 100000L ? 991801L : 991802L);
        UserContext.setUserName("severance-check"); UserContext.setDeptId(100L); UserContext.setDsType(0); PERMITTED.set(permitted);
    }
    private static long countFiles(Path directory) throws Exception { try (Stream<Path> files = Files.walk(directory)) { return files.filter(Files::isRegularFile).count(); } }
    private static void equal(Object expected, Object actual, String message) { if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual); CHECKS.incrementAndGet(); }
    private static void reject(Runnable action, String code) {
        try { action.run(); }
        catch (HrHException failure) { if (code != null && !code.equals(failure.getCode())) throw failure; CHECKS.incrementAndGet(); return; }
        catch (com.cloudflow.hr.exception.HrBusinessException failure) { if (code != null) throw failure; CHECKS.incrementAndGet(); return; }
        throw new AssertionError("Expected rejection: " + code);
    }
    private record MemoryFile(String name, byte[] bytes) implements MultipartFile {
        @Override public String getName() { return "file"; }
        @Override public String getOriginalFilename() { return name; }
        @Override public String getContentType() { return "application/pdf"; }
        @Override public boolean isEmpty() { return bytes.length == 0; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes.clone(); }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        @Override public void transferTo(File destination) throws java.io.IOException { Files.write(destination.toPath(), bytes); }
    }
}
