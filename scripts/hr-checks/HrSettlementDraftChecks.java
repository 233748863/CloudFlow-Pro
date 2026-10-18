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
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.vo.settlement.HrSettlementView;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrSeveranceRuleMapper;
import com.cloudflow.hr.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

public final class HrSettlementDraftChecks {
    private static int checks;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static boolean allowed = true;
    private static boolean sourcePresent = true;
    private static boolean sourceFailure = false;
    private static boolean assetListed;
    private static boolean assetReleased;
    private static boolean assetFailure;
    private static boolean assetConflict;
    private static int assetVersion;
    private static int samplingWageVersion = 1;

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        try (HikariDataSource data = new HikariDataSource(); ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            data.setJdbcUrl(args[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(3);
            JdbcTemplate jdbc = new JdbcTemplate(data); equal(Path.of(args[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            MybatisConfiguration config = new MybatisConfiguration(); config.setMapUnderscoreToCamelCase(true); config.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0")); global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(config, global);
            for (Class<?> mapper : List.of(HrFinalSettlementMapper.class, HrFinalSettlementItemMapper.class, HrLifecycleApplicationMapper.class, HrEmployeeMapper.class, HrEmployeeAdvanceMapper.class, HrAuditLogMapper.class, HrPositionMapper.class, HrSalarySlipMapper.class, HrSeveranceRuleMapper.class, com.cloudflow.hr.mapper.HrHMapper.class, com.cloudflow.hr.mapper.HrSettlementApprovalMapper.class)) config.addMapper(mapper);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(data); factory.setConfiguration(config); factory.setGlobalConfig(global); factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            List<FileSystemResource> resources = new ArrayList<>();
            for (String name : List.of("HrFinalSettlement", "HrFinalSettlementItem", "HrLifecycleApplication", "HrEmployeeAdvance", "HrAuditLog", "HrSeveranceRule", "HrH", "HrSettlementApproval")) resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + name + "Mapper.xml"));
            factory.setMapperLocations(resources.toArray(FileSystemResource[]::new)); SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            HrRuleSupport support = new HrRuleSupport(new DataSourceTransactionManager(data), null, sessions.getMapper(HrEmployeeMapper.class), sessions.getMapper(HrAuditLogMapper.class), JSON, sessions.getMapper(HrPositionMapper.class));
            HrHSupport access = new HrHSupport(support, null, sessions.getMapper(HrEmployeeMapper.class), null, null, null, null, null, null, JSON, validators.getValidator()) {
                @Override public void permission(String permission) { if (!allowed || !permission.startsWith("hr:settlement:")) throw HrHException.forbidden(); }
                @Override public boolean permitted(String permission) { return allowed && permission.startsWith("hr:settlement:"); }
                @Override public void scope(Long employeeId) { if (!Long.valueOf(993001).equals(employeeId)) throw HrHException.forbidden(); }
                @Override public Long user() { return 993011L; }
                @Override public boolean owner(Long employeeId) { return false; }
                @Override public List<Long> scopedEmployees(HrHRequests.PageQuery query, boolean mine) { return List.of(993001L); }
            };
            HrSettlementAdvanceSource advance = new HrSettlementAdvanceSource(null, null, null, access, JSON) {
                @Override public Inspection inspect(Long employee, LocalDate exit, Long settlement) {
                    if (sourceFailure) throw new IllegalStateException("source outage fixture");
                    List<HrSettlementPayrollSource.Wage> wages = sourcePresent ? List.of(new HrSettlementPayrollSource.Wage(993101L, 1, "PAYABLE", "100.01", LocalDate.of(2026, 1, 1), exit, JSON.createObjectNode().put("version", 1))) : List.of();
                    return new Inspection(new HrSettlementPayrollSource.Inspection(wages, List.of()), List.of(new Loan(993102L, 2, "30.00", "10.00", JSON.createObjectNode().put("version", 2))), List.of());
                }
            };
            HrSettlementTrainingSource training = new HrSettlementTrainingSource(null, null, null, null, access, JSON) { @Override public Inspection inspect(Long employee, Long settlement) { return new Inspection(List.of(new Recovery(993103L, 3, "20.00", JSON.createObjectNode().put("version", 3))), List.of()); } };
            HrSettlementLeaveSource leave = new HrSettlementLeaveSource(null, null, null, null, null, access, JSON) { @Override public Inspection inspect(Long employee, LocalDate exit, Long settlement) { return new Inspection(List.of(), List.of()); } };
            HrSettlementAssetSource assets = new HrSettlementAssetSource(null, access) { @Override public List<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery.Asset> outstanding(Long employee) { return assetListed ? List.of(asset()) : List.of(); } };
            HrSettlementAssetAssessmentService assessments = new HrSettlementAssetAssessmentService((employee, assetId) -> {
                if (assetFailure) return com.cloudflow.common.core.domain.R.fail("fixture unavailable");
                com.cloudflow.hr.client.vo.HrEmployeeAssetDisposition.Movement movement = assetReleased ? new com.cloudflow.hr.client.vo.HrEmployeeAssetDisposition.Movement(993021L, "ASSET_RETURN", "RETURN", LocalDate.of(2026, 1, 30), 1, 993011L, null) : null;
                return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.hr.client.vo.HrEmployeeAssetDisposition(employee, 993011L, asset(), assetReleased, movement));
            }, access, JSON);
            HrSettlementCompensationSource compensation = new HrSettlementCompensationSource(null, null, access, JSON) {
                @Override public Inspection inspect(Long employee, LocalDate exit, Long rule, HrSettlementCalculation.SamplingSelection selected) {
                    return selected == null || rule == null ? new Inspection(null, List.of("缺核定取样"), JSON.createObjectNode(), null, null, selected, exit)
                            : new Inspection(new HrSettlementCalculation.Result("1", "12", new BigDecimal("0.08"), BigDecimal.ONE, new BigDecimal("50.00"), new BigDecimal("50.00"), new BigDecimal("50.00")), List.of(), compensationEvidence(), null, null, selected, exit);
                }
            };
            HrSettlementDraftService service = new HrSettlementDraftService(sessions.getMapper(HrFinalSettlementMapper.class), sessions.getMapper(HrFinalSettlementItemMapper.class), sessions.getMapper(HrLifecycleApplicationMapper.class), sessions.getMapper(HrSeveranceRuleMapper.class), sessions.getMapper(HrEmployeeAdvanceMapper.class), advance, training, leave, assets, assessments, compensation, null, access, support, JSON);
            actor(100000L);
            jdbc.update("INSERT INTO hr_severance_rule(rule_id,tenant_id,rule_code,rule_name,effective_from,salary_component_ids,averaging_months,service_rounding,status,confirmed_by,confirmed_time) VALUES(993050,100000,'DRAFT_POLICY','草稿政策前置','2026-01-01',JSON_ARRAY(1),12,'ACTUAL_MONTHS','CONFIRMED',993011,NOW()),(993051,100001,'FOREIGN_POLICY','外租户政策','2026-01-01',JSON_ARRAY(1),12,'ACTUAL_MONTHS','CONFIRMED',993011,NOW())");
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,deleted) VALUES(993001,100000,'SETTLEMENT_DRAFT_TEST','结算草稿测试','UNKNOWN',100,'REGULAR','2026-01-01',0)");
            jdbc.update("INSERT INTO hr_lifecycle_application(id,tenant_id,application_no,type,employee_id,name,effective_date,status,version,deleted) VALUES(993010,100000,'SETTLEMENT_EXIT_TEST','RESIGNATION',993001,'结算草稿测试','2026-01-31','APPROVED',0,0),(993011,100001,'FOREIGN_EXIT_TEST','RESIGNATION',993001,'其他租户','2026-01-31','APPROVED',0,0)");
            HrSettlementRequests.Create input = new HrSettlementRequests.Create(); input.setLifecycleApplicationId(993010L); input.setRemark("核定草稿");
            Long id = service.create(input); HrSettlementView draft = service.detail(id); equal("DRAFT", draft.status(), "creation remains draft"); equal(false, draft.calculated(), "new draft not calculated"); equal("0.00", draft.netAmount(), "new draft does not invent funds");
            reject(() -> service.create(input), "SETTLEMENT_ALREADY_EXISTS");
            HrSettlementRequests.Create foreign = new HrSettlementRequests.Create(); foreign.setLifecycleApplicationId(993011L); reject(() -> service.create(foreign), "INVALID_PARAMETER");
            allowed = false; reject(() -> service.detail(id), "FORBIDDEN"); allowed = true;
            actor(100001L); reject(() -> service.detail(id), "SETTLEMENT_NOT_FOUND"); actor(100000L);
            HrSettlementRequests.Update invalidRule = update(0); invalidRule.setRuleId(993051L); reject(() -> service.update(id, invalidRule), "INVALID_PARAMETER");
            equal(0, service.detail(id).version(), "foreign policy reference never persisted");
            jdbc.update("UPDATE hr_severance_rule SET status='DRAFT' WHERE rule_id=993050"); reject(() -> service.update(id, update(0)), "INVALID_PARAMETER");
            jdbc.update("UPDATE hr_severance_rule SET status='CONFIRMED',effective_from='2026-02-01' WHERE rule_id=993050"); reject(() -> service.update(id, update(0)), "INVALID_PARAMETER");
            jdbc.update("UPDATE hr_severance_rule SET effective_from='2026-01-01' WHERE rule_id=993050");
            HrSettlementRequests.Query policies = new HrSettlementRequests.Query(); policies.setKeyword("POLICY");
            equal(List.of(993050L), service.policies(id, policies).getRows().stream().map(HrSettlementView.PolicyOption::value).toList(), "policy options exclude other tenant");
            HrSettlementRequests.Update update = update(0); service.update(id, update); draft = service.detail(id);
            equal("993011", draft.sampling().path("reviewedBy").asText(), "server records reviewer"); equal("0.5", draft.sampling().path("averagingMonths").asText(), "case divisor persisted exactly");
            equal(true, !draft.sampling().path("reviewedTime").asText().isBlank(), "server records review time"); equal(false, draft.calculated(), "review changes require recalculation"); reject(() -> service.update(id, update), "VERSION_CONFLICT");
            HrSettlementView calculated = service.calculate(id, version(1)); equal("100.01", calculated.netAmount(), "net totals sum wages compensation and receivables"); equal(4, calculated.items().size(), "four unique fixture sources"); equal(List.of(), calculated.missingRequirements(), "all fixture sources present");
            equal(1, calculated.items().stream().filter(item -> "HR_SALARY_SLIP".equals(item.sourceBizType())).findFirst().orElseThrow().evidence().path("version").asInt(), "original source version stays at root for posting");
            List<Long> identities = calculated.items().stream().map(HrSettlementView.Item::itemId).toList(); HrSettlementView repeated = service.calculate(id, version(2)); equal(identities, repeated.items().stream().map(HrSettlementView.Item::itemId).toList(), "recalculation reuses source rows");
            equal(4, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=?", Integer.class, id), "no duplicate item insertion");
            submissionChecks(service, sessions, support, jdbc, id);
            sourcePresent = false; HrSettlementView reduced = service.calculate(id, version(3)); equal("0.00", reduced.netAmount(), "removed wage is excluded from totals"); equal(3, reduced.items().size(), "obsolete source no longer displayed as active");
            equal(4, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=?", Integer.class, id), "obsolete source retained in database");
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=? AND JSON_EXTRACT(source_snapshot,'$.active')=FALSE", Integer.class, id), "obsolete source explicitly marked inactive");
            sourceFailure = true; try { service.calculate(id, version(4)); throw new AssertionError("source failure must propagate"); } catch (IllegalStateException expected) { checks++; } finally { sourceFailure = false; }
            equal(4, service.detail(id).version(), "source outage rolls back draft change");
            HrSettlementRequests.Update cleared = new HrSettlementRequests.Update(); cleared.setVersion(4); service.update(id, cleared); equal(null, service.detail(id).ruleId(), "nullable rule can be cleared"); equal(null, service.detail(id).sampling(), "nullable sampling can be cleared"); equal(null, service.detail(id).remark(), "nullable remark can be cleared");
            HrSettlementView incomplete = service.calculate(id, version(5)); equal(true, !incomplete.missingRequirements().isEmpty(), "missing policy and sampling retained as draft issue");
            jdbc.update("UPDATE hr_final_settlement SET approval_status='SUBMITTED' WHERE settlement_id=?", id); reject(() -> service.update(id, update(6)), "SETTLEMENT_READ_ONLY"); jdbc.update("UPDATE hr_final_settlement SET approval_status='DRAFT' WHERE settlement_id=?", id);
            jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=1 WHERE settlement_id=? LIMIT 1", id); reject(() -> service.update(id, update(6)), "SETTLEMENT_ALREADY_POSTED"); jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=0 WHERE settlement_id=?", id);
            jdbc.update("UPDATE hr_lifecycle_application SET effective_date='2026-01-30' WHERE id=993010"); reject(() -> service.calculate(id, version(6)), "SETTLEMENT_SOURCE_CHANGED");
            HrSettlementView refreshed = service.refreshSource(id, version(6)); equal(LocalDate.of(2026, 1, 30), refreshed.relievingDate(), "explicit refresh uses actual exit date");
            equal("0.00", refreshed.netAmount(), "date refresh response keeps exact money format");
            equal(null, refreshed.sampling(), "date refresh clears previous sampling"); equal(null, refreshed.ruleId(), "date refresh clears previous policy"); equal(false, refreshed.calculated(), "date refresh invalidates old calculation");
            equal(7, service.refreshSource(id, version(7)).version(), "unchanged date refresh does not create a new revision");
            service.update(id, update(7)); equal(true, service.detail(id).sampling() != null, "administrator can review after date change");
            jdbc.update("UPDATE hr_final_settlement SET approval_status='SUBMITTED' WHERE settlement_id=?", id); reject(() -> service.refreshSource(id, version(8)), "SETTLEMENT_READ_ONLY");
            equal(false, service.detail(id).editable(), "submitted settlement hides draft operations"); jdbc.update("UPDATE hr_final_settlement SET approval_status='DRAFT' WHERE settlement_id=?", id);
            for (String field : List.of("reviewedBy", "netAmount", "employeeId", "status", "tenantId")) { try { JSON.readValue("{\"" + field + "\":1}", HrSettlementRequests.Update.class); throw new AssertionError("Injected field accepted"); } catch (com.fasterxml.jackson.core.JsonProcessingException expected) { checks++; } }
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE source_posted_flag=1 AND settlement_id=?", Integer.class, id), "draft never posts sources");
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement WHERE settlement_id=? AND status='DRAFT' AND payment_request_id IS NULL", Integer.class, id), "draft never initiates payment");
            assetChecks(service, jdbc, id);
            approvalChecks(access, sessions, jdbc);
            System.out.println("H2_SETTLEMENT_DRAFT_DATABASE: checks=" + checks + "; failed=0; mysql=true; actual_draft_service=true; actual_asset_assessment=true; actual_mappers=true; actual_transactions=true; source_fixtures=true; permission_scope_fixture=true; http=false; freezing=false; posting=false");
        } finally { TenantContext.clear(); UserContext.clear(); }
    }
    private static com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery.Asset asset() {
        Long custodian = assetReleased ? null : Long.valueOf(993011L);
        Long borrower = assetConflict ? Long.valueOf(993012L) : custodian;
        return new com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery.Asset(993020L, "ASSET_TEST", "核定测试资产", "model", assetReleased ? "IDLE" : "IN_USE", "location", assetVersion, custodian, borrower, !assetConflict);
    }
    private static void submissionChecks(HrSettlementDraftService service, SqlSessionTemplate sessions, HrRuleSupport support, JdbcTemplate jdbc, Long id) {
        for (boolean confirmationPhase : List.of(false, true)) {
        jdbc.update("UPDATE hr_final_settlement SET approval_status=? WHERE settlement_id=?", confirmationPhase ? "APPROVED" : "DRAFT", id);
        if (confirmationPhase) {
            samplingWageVersion = 2;
            com.fasterxml.jackson.databind.node.ObjectNode reservation = JSON.createObjectNode().put("state", "FROZEN");
            reservation.putObject("sources").putObject("HR_SALARY_SLIP:993101").putObject("evidence").put("version", 2).put("digestSha256", "c".repeat(64));
            jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=JSON_SET(calculation_snapshot,'$.reservation',CAST(? AS JSON)) WHERE settlement_id=?", reservation.toString(), id);
        }
        Runnable verify = () -> support.transaction(() -> {
            sessions.getMapper(HrEmployeeAdvanceMapper.class).lockEmployee(100000L, 993001L);
            sessions.getMapper(HrFinalSettlementMapper.class).lock(100000L, id);
            verifyReady(service, sessions.getMapper(HrFinalSettlementMapper.class).selectById(id), confirmationPhase); return null;
        });
        String before = jdbc.queryForObject("SELECT CAST(calculation_snapshot AS CHAR) FROM hr_final_settlement WHERE settlement_id=?", String.class, id);
        verify.run(); checks++;
        if (confirmationPhase) {
            samplingWageVersion = 3; reject(verify, "SETTLEMENT_SUBMISSION_CHANGED"); samplingWageVersion = 2;
            equal(true, service.detail(id).funds().canConfirm(), "actual approved policy and amounts enable confirmation");
        }
        equal(before, jdbc.queryForObject("SELECT CAST(calculation_snapshot AS CHAR) FROM hr_final_settlement WHERE settlement_id=?", String.class, id), "submission verification does not replace calculation evidence");
        equal(3, service.detail(id).version(), "verification alone never submits or increments version");
        reject(() -> verifyReady(service, sessions.getMapper(HrFinalSettlementMapper.class).selectById(id), confirmationPhase), "SETTLEMENT_TRANSACTION_REQUIRED");
        for (String statement : List.of(
                "UPDATE hr_final_settlement SET total_payable=total_payable+?,net_amount=net_amount+? WHERE settlement_id=?",
                "UPDATE hr_final_settlement SET total_receivable=total_receivable+?,net_amount=net_amount-? WHERE settlement_id=?",
                "UPDATE hr_final_settlement SET severance_amount=severance_amount+?,net_amount=net_amount+? WHERE settlement_id=?",
                "UPDATE hr_final_settlement SET asset_recovery_cost=asset_recovery_cost+?,net_amount=net_amount-? WHERE settlement_id=?",
                "UPDATE hr_final_settlement SET work_years=work_years+?,net_amount=net_amount+0*? WHERE settlement_id=?")) {
            jdbc.update(statement, new BigDecimal("0.01"), new BigDecimal("0.01"), id);
            reject(verify, "SETTLEMENT_SUBMISSION_CHANGED");
            jdbc.update(statement, new BigDecimal("-0.01"), new BigDecimal("-0.01"), id);
        }
        try { jdbc.update("UPDATE hr_final_settlement SET net_amount=net_amount+0.01 WHERE settlement_id=?", id); throw new AssertionError("Database net consistency must reject corruption"); }
        catch (org.springframework.dao.DataAccessException failure) { if (!failure.getMessage().contains("chk_settlement_net")) throw failure; checks++; }
        jdbc.update("UPDATE hr_final_settlement_item SET amount=amount+1 WHERE settlement_id=? AND source_biz_type='HR_SEVERANCE'", id);
        reject(verify, "SETTLEMENT_SUBMISSION_CHANGED");
        jdbc.update("UPDATE hr_final_settlement_item SET amount=amount-1 WHERE settlement_id=? AND source_biz_type='HR_SEVERANCE'", id);
        jdbc.update("UPDATE hr_final_settlement_item SET confirmed_flag=0 WHERE settlement_id=? AND source_biz_type='HR_ADVANCE'", id);
        reject(verify, "SETTLEMENT_SUBMISSION_CHANGED");
        jdbc.update("UPDATE hr_final_settlement_item SET confirmed_flag=1 WHERE settlement_id=?", id);
        jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=1 WHERE settlement_id=? AND source_biz_type='HR_ADVANCE'", id);
        reject(verify, "SETTLEMENT_SUBMISSION_CHANGED");
        jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=0 WHERE settlement_id=?", id);
        jdbc.update("UPDATE hr_final_settlement_item SET source_snapshot=JSON_SET(source_snapshot,'$.active',FALSE) WHERE settlement_id=? AND source_biz_type='HR_SEVERANCE'", id);
        reject(verify, "SETTLEMENT_SUBMISSION_CHANGED");
        jdbc.update("UPDATE hr_final_settlement_item SET source_snapshot=JSON_SET(source_snapshot,'$.active',TRUE) WHERE settlement_id=? AND source_biz_type='HR_SEVERANCE'", id);
        sourcePresent = false; reject(verify, "SETTLEMENT_SUBMISSION_CHANGED"); sourcePresent = true;
        assetListed = true; reject(verify, "SETTLEMENT_SUBMISSION_CHANGED"); assetListed = false;
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=JSON_SET(calculation_snapshot,'$.rounding.mode','DOWN') WHERE settlement_id=?", id);
        reject(verify, "SETTLEMENT_SUBMISSION_CHANGED");
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=? WHERE settlement_id=?", before, id);
        jdbc.update("UPDATE hr_lifecycle_application SET effective_date='2026-01-30' WHERE id=993010");
        reject(verify, "SETTLEMENT_SOURCE_CHANGED");
        jdbc.update("UPDATE hr_lifecycle_application SET effective_date='2026-01-31' WHERE id=993010");
        allowed = false; reject(verify, "FORBIDDEN"); allowed = true;
        verify.run(); checks++;
        equal(before, jdbc.queryForObject("SELECT CAST(calculation_snapshot AS CHAR) FROM hr_final_settlement WHERE settlement_id=?", String.class, id), "failed verification preserves original reviewed evidence");
        }
        samplingWageVersion = 1;
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=JSON_REMOVE(calculation_snapshot,'$.reservation') WHERE settlement_id=?", id);
        jdbc.update("UPDATE hr_final_settlement SET approval_status='DRAFT' WHERE settlement_id=?", id);
    }
    private static com.fasterxml.jackson.databind.node.ObjectNode compensationEvidence() {
        com.fasterxml.jackson.databind.node.ObjectNode evidence = JSON.createObjectNode().put("fixture", true);
        evidence.putObject("salarySampling").putArray("wages").addObject().put("salarySlipId", "993101").put("version", samplingWageVersion).put("digestSha256", "c".repeat(64));
        return evidence;
    }
    private static void verifyReady(HrSettlementDraftService service, com.cloudflow.hr.domain.entity.HrFinalSettlement row, boolean confirmationPhase) {
        try {
            java.lang.reflect.Method method = HrSettlementDraftService.class.getDeclaredMethod(confirmationPhase ? "verifyConfirmationLocked" : "verifySubmissionLocked", com.cloudflow.hr.domain.entity.HrFinalSettlement.class);
            method.setAccessible(true); method.invoke(service, row);
        } catch (java.lang.reflect.InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException(failure.getCause());
        } catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
    }
    private static void approvalChecks(HrHSupport access, SqlSessionTemplate sessions, JdbcTemplate jdbc) {
        int before = checks;
        actor(100777L);
        try {
            jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,dept_name,ancestors) VALUES(993800,100777,'结算审批验证','0')");
            jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,ds_type,status,deleted) VALUES(993801,100777,'财务验证','finance',1,3,'0',0)");
            for (long user : List.of(993811L, 993812L, 993813L, 993814L)) {
                jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES(?,100777,993800,?,?,'0',0)", user, "settlement" + user, "审批验证" + user);
                jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,993801,100777)", user);
            }
            jdbc.update("INSERT INTO sys_menu(menu_id,menu_name,menu_type,perms,status) VALUES(993801,'结算读取验证','F','hr:settlement:list','0'),(993802,'任务办理验证','F','workflow:task:complete','0')");
            jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES(993801,993801,100777),(993801,993802,100777)");
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,user_id,employee_no,name,gender,dept_id,employee_status,hire_date,deleted) VALUES(993800,100777,993812,'SETTLEMENT_APPROVAL','离职审批验证','UNKNOWN',993800,'RESIGNED','2025-01-01',0)");
            com.fasterxml.jackson.databind.node.ObjectNode model = JSON.createObjectNode();
            com.fasterxml.jackson.databind.node.ArrayNode nodes = model.putArray("nodes");
            nodes.addObject().put("id", "start").put("type", "START");
            nodes.addObject().put("id", "finance").put("type", "APPROVAL").put("approverType", "VARIABLE_USER").put("approverValue", "financeApproverIds")
                    .put("signType", "ANY").put("allowDelegate", false).put("allowAddSign", false).put("allowAgent", false);
            nodes.addObject().put("id", "end").put("type", "END");
            com.fasterxml.jackson.databind.node.ArrayNode edges = model.putArray("edges");
            edges.addObject().put("source", "start").put("target", "finance"); edges.addObject().put("source", "finance").put("target", "end");
            jdbc.update("INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,model_json,status) VALUES('settlement-approval-test',100777,'财务复核验证','settlement_test',?,'PUBLISHED')", model.toString());
            HrSettlementApprovalSupport approvals = new HrSettlementApprovalSupport(sessions.getMapper(com.cloudflow.hr.mapper.HrSettlementApprovalMapper.class), sessions.getMapper(com.cloudflow.hr.mapper.HrHMapper.class), access,
                    new com.cloudflow.common.redis.config.RuntimeSysConfigService(null) { @Override public String getString(String key, String fallback) { return "settlement_test"; } });
            HrEmployee employee = sessions.getMapper(HrEmployeeMapper.class).selectById(993800L);
            Map<String, Object> snapshot = approvals.snapshot(employee, 993811L);
            equal(List.of("993813", "993814"), snapshot.get("financeApproverIds"), "actual role and permissions exclude submitter and exiting employee");
            equal(List.of("993811", "993812"), snapshot.get(HrHSupport.EXCLUDED_USERS), "both identities frozen even when both finance");
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=993812");
            equal(snapshot, approvals.snapshot(employee, 993811L), "disabled exiting account allowed by actual database identity lookup");
            reject(() -> approvals.snapshot(employee, 993812L), "FORBIDDEN");
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=993811"); reject(() -> approvals.snapshot(employee, 993811L), "FORBIDDEN");
            jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=993811");
            for (String statement : List.of("UPDATE sys_user SET deleted=1 WHERE user_id=993812", "UPDATE sys_user SET tenant_id=100778 WHERE user_id=993812")) {
                jdbc.update(statement);
                reject(() -> approvals.snapshot(employee, 993811L), "SETTLEMENT_EMPLOYEE_LINK_INVALID");
                jdbc.update("UPDATE sys_user SET deleted=0,tenant_id=100777 WHERE user_id=993812");
            }
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,user_id,employee_no,name,gender,dept_id,employee_status,hire_date,deleted) VALUES(993801,100777,993812,'SETTLEMENT_DUPLICATE','重复关联验证','UNKNOWN',993800,'RESIGNED','2025-01-01',0)");
            reject(() -> approvals.snapshot(employee, 993811L), "SETTLEMENT_EMPLOYEE_LINK_INVALID");
            jdbc.update("UPDATE hr_employee SET user_id=NULL WHERE id=993801");
            jdbc.update("UPDATE sys_user SET dept_id=100 WHERE user_id IN (993813,993814)");
            reject(() -> approvals.snapshot(employee, 993811L), "SETTLEMENT_FINANCE_MISSING");
            jdbc.update("UPDATE sys_user SET dept_id=993800 WHERE user_id IN (993813,993814)");
            for (long menu : List.of(993801L, 993802L)) {
                jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=?", menu);
                reject(() -> approvals.snapshot(employee, 993811L), "SETTLEMENT_FINANCE_MISSING");
                jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=?", menu);
            }
            jdbc.update("UPDATE sys_role SET status='1' WHERE role_id=993801"); reject(() -> approvals.snapshot(employee, 993811L), "SETTLEMENT_FINANCE_MISSING");
            jdbc.update("UPDATE sys_role SET status='0' WHERE role_id=993801");
            com.fasterxml.jackson.databind.node.ObjectNode frozen = JSON.valueToTree(snapshot);
            approvals.verifyCurrent(employee, frozen); checks++;
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=993814");
            reject(() -> approvals.verifyCurrent(employee, frozen), "SETTLEMENT_APPROVAL_CHANGED");
            approvals.verifyRecordedActor(frozen, 993814L); checks++;
            for (Long invalidActor : List.of(993811L, 993812L, 999999L)) reject(() -> approvals.verifyRecordedActor(frozen, invalidActor), "FORBIDDEN");
            jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=993814");
            jdbc.update("UPDATE wf_process_definition SET status='DRAFT' WHERE definition_id='settlement-approval-test'");
            reject(() -> approvals.snapshot(employee, 993811L), "WORKFLOW_NOT_CONFIGURED");
            jdbc.update("UPDATE wf_process_definition SET status='PUBLISHED' WHERE definition_id='settlement-approval-test'");
            for (String flag : List.of("allowDelegate", "allowAddSign", "allowAgent", "allowEdit")) {
                com.fasterxml.jackson.databind.node.ObjectNode unsafe = model.deepCopy(); ((com.fasterxml.jackson.databind.node.ObjectNode) unsafe.path("nodes").get(1)).putObject("props").put(flag, true);
                reject(() -> access.validateSettlementModel(unsafe), "WORKFLOW_MODEL_UNSAFE");
            }
            System.out.println("H2_SETTLEMENT_APPROVAL_SUPPORT_DATABASE: checks=" + (checks - before) + "; failed=0; actual_employee_binding=true; actual_role_permission_scope=true; model_registry=true; runtime_setting_fixture=true; workflow_http=false");
        } finally { actor(100000L); }
    }
    private static void assetChecks(HrSettlementDraftService service, JdbcTemplate jdbc, Long id) {
        jdbc.update("UPDATE hr_employee SET user_id=993011 WHERE id=993001"); assetListed = true;
        HrSettlementView collected = service.calculate(id, version(service.detail(id).version()));
        HrSettlementView.Item source = collected.items().stream().filter(item -> "OA_ASSET".equals(item.sourceBizType())).findFirst().orElseThrow(); Long itemId = source.itemId();
        equal(false, source.confirmed(), "outstanding custody is never an automatic loss"); equal("0.00", source.amount(), "unassessed asset does not invent a deduction");
        String fingerprint = service.assetObservation(id, itemId).path("sourceFingerprint").asText();
        HrSettlementRequests.AssetReview noLoss = review(collected.version(), fingerprint, "RELEASED_NO_LOSS", "0"); reject(() -> service.reviewAsset(id, itemId, noLoss), "INVALID_PARAMETER");
        reject(() -> service.reviewAsset(id, 99999999L, noLoss), "INVALID_PARAMETER");
        HrSettlementRequests.AssetReview loss = review(collected.version(), fingerprint, "LOSS_ASSESSED", "12.345");
        HrSettlementView assessed = service.reviewAsset(id, itemId, loss);
        equal(false, assessed.calculated(), "assessment invalidates totals");
        equal("12.35", assessed.items().get(0).amount(), "loss rounded at line boundary");
        equal("12.345", assessed.items().get(0).evidence().path("assetReview").path("rawAmount").asText(), "raw assessment retained");
        equal("993011", assessed.items().get(0).evidence().path("assetReview").path("reviewedBy").asText(), "reviewer comes from server identity");
        reject(() -> service.reviewAsset(id, itemId, loss), "VERSION_CONFLICT");
        HrSettlementView same = service.calculate(id, version(assessed.version())); equal("12.35", same.assetRecoveryCost(), "recalculation includes exactly one rounded assessment");
        assetVersion++;
        HrSettlementView changed = service.calculate(id, version(same.version())); HrSettlementView.Item changedItem = assetItem(changed);
        equal(false, changedItem.confirmed(), "asset version change requires reassessment"); equal("12.35", changedItem.amount(), "old assessed deduction retained on source change");
        reject(() -> service.reviewAsset(id, itemId, review(changed.version(), fingerprint, "LOSS_ASSESSED", "9")), "SETTLEMENT_ASSET_CHANGED");
        assetListed = false; assetFailure = true;
        HrSettlementView unavailable = service.calculate(id, version(changed.version()));
        equal(itemId, assetItem(unavailable).itemId(), "disappeared source retained with original identity"); equal("12.35", unavailable.assetRecoveryCost(), "source outage does not erase assessed loss"); equal(false, assetItem(unavailable).confirmed(), "unverified source blocks confirmation");
        assetFailure = false; assetReleased = true; assetVersion++;
        HrSettlementView returned = service.calculate(id, version(unavailable.version())); equal("12.35", returned.assetRecoveryCost(), "actual return cannot silently waive an assessed loss"); equal(false, assetItem(returned).confirmed(), "return still requires explicit review");
        String returnedFingerprint = service.assetObservation(id, itemId).path("sourceFingerprint").asText();
        HrSettlementView released = service.reviewAsset(id, itemId, review(returned.version(), returnedFingerprint, "RELEASED_NO_LOSS", "0"));
        equal("0.00", assetItem(released).amount(), "explicit no-loss review removes deduction"); equal(1, assetItem(released).evidence().path("assetReviewHistory").size(), "old loss assessment is retained in history");
        HrSettlementView zero = service.calculate(id, version(released.version())); equal("0.00", zero.assetRecoveryCost(), "released reviewed asset contributes zero"); equal(true, assetItem(zero).confirmed(), "actual release and explicit review permit confirmation");
        jdbc.update("UPDATE hr_lifecycle_application SET effective_date='2026-01-29' WHERE id=993010");
        HrSettlementView refreshed = service.refreshSource(id, version(zero.version()));
        equal(false, assetItem(refreshed).confirmed(), "date refresh immediately marks asset assessment pending");
        equal(false, assetItem(refreshed).evidence().path("assessmentCurrent").asBoolean(), "date refresh response explicitly preserves invalidated review");
        HrSettlementView dateChanged = service.calculate(id, version(refreshed.version())); equal(false, assetItem(dateChanged).confirmed(), "changed exit date invalidates asset review");
        HrSettlementView cleared = service.reviewAsset(id, itemId, review(dateChanged.version(), returnedFingerprint, "CLEAR", "0")); equal(2, assetItem(cleared).evidence().path("assetReviewHistory").size(), "explicit clear retains prior review history"); equal(false, assetItem(cleared).confirmed(), "cleared assessment remains pending");
        assetReleased = false; assetListed = true; assetConflict = true; assetVersion++;
        String disputed = service.assetObservation(id, itemId).path("sourceFingerprint").asText();
        reject(() -> service.reviewAsset(id, itemId, review(cleared.version(), disputed, "LOSS_ASSESSED", "1")), "INVALID_PARAMETER");
        allowed = false; reject(() -> service.assetObservation(id, itemId), "FORBIDDEN"); allowed = true;
        jdbc.update("UPDATE hr_final_settlement SET approval_status='SUBMITTED' WHERE settlement_id=?", id);
        reject(() -> service.reviewAsset(id, itemId, review(cleared.version(), disputed, "CLEAR", "0")), "SETTLEMENT_READ_ONLY");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE source_posted_flag=1 AND settlement_id=?", Integer.class, id), "asset assessment never posts sources");
    }
    private static HrSettlementView.Item assetItem(HrSettlementView row) { return row.items().stream().filter(item -> "OA_ASSET".equals(item.sourceBizType())).findFirst().orElseThrow(); }
    private static HrSettlementRequests.AssetReview review(int version, String fingerprint, String resolution, String amount) { HrSettlementRequests.AssetReview input = new HrSettlementRequests.AssetReview(); input.setVersion(version); input.setSourceFingerprint(fingerprint); input.setResolution(resolution); input.setAmount(new BigDecimal(amount)); input.setReason("核定来源及处理原因"); return input; }
    private static HrSettlementRequests.Update update(int version) { HrSettlementRequests.Update input = new HrSettlementRequests.Update(); input.setVersion(version); input.setRuleId(993050L); input.setRemark("更新核定"); HrSettlementRequests.Sampling sampling = new HrSettlementRequests.Sampling(); sampling.setMonths(List.of("2026-01")); sampling.setAveragingMonths(new BigDecimal("0.5")); sampling.setReason("适用政策核定不足月"); input.setSampling(sampling); return input; }
    private static HrHRequests.VersionDTO version(int value) { HrHRequests.VersionDTO input = new HrHRequests.VersionDTO(); input.setVersion(value); return input; }
    private static void actor(long tenant) { UserContext.setTenantId(tenant); TenantContext.setTenantId(tenant); UserContext.setUserId(993011L); UserContext.setUserName("draft-check"); UserContext.setDeptId(100L); UserContext.setDsType(0); }
    private static void reject(Runnable action, String code) { try { action.run(); } catch (HrHException failure) { equal(code, failure.getCode(), "expected rejection"); return; } throw new AssertionError("Expected " + code); }
    private static void equal(Object expected, Object actual, String label) { checks++; if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); }
}
