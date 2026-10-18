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
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.domain.entity.HrSeveranceRule;
import com.cloudflow.hr.mapper.HrExitInterviewMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrSeveranceRuleMapper;
import com.cloudflow.hr.mapper.HrSeveranceRuleSlabMapper;
import com.cloudflow.hr.mapper.HrTrainingRecoveryMapper;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.cloudflow.oa.domain.vo.OaEmployeeAssetRecovery;
import com.cloudflow.oa.service.impl.OaEmployeeAssetRecoveryService;
import com.cloudflow.oa.service.impl.PaymentRequestServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.io.Serializable;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

public final class HrSettlementFoundationChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned scratch database required");
        }
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned data directory");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setBanner(false);
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapper : List.of(HrSeveranceRuleMapper.class, HrSeveranceRuleSlabMapper.class, HrFinalSettlementMapper.class,
                    HrFinalSettlementItemMapper.class, HrTrainingRecoveryMapper.class, HrExitInterviewMapper.class, BizPaymentRequestMapper.class,
                    OaIdentityReferenceMapper.class, SysAssetMapper.class, com.cloudflow.oa.mapper.OaAssetMovementMapper.class)) configuration.addMapper(mapper);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            java.util.ArrayList<FileSystemResource> resources = new java.util.ArrayList<>(List.of("HrSeveranceRule", "HrSeveranceRuleSlab", "HrFinalSettlement", "HrFinalSettlementItem", "HrTrainingRecovery", "HrExitInterview")
                    .stream().map(name -> new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + name + "Mapper.xml")).toList());
            resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaIdentityReferenceMapper.xml"));
            factory.setMapperLocations(resources.toArray(FileSystemResource[]::new));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            context(100000L);
            mapping(sessions, jdbc);
            payments(sessions.getMapper(BizPaymentRequestMapper.class), jdbc);
            int beforeAssets = checks;
            assets(sessions, jdbc);
            System.out.println("H2_SETTLEMENT_ASSET_SOURCE_DATABASE: checks=" + (checks - beforeAssets)
                    + "; failed=0; actual_oa_service=true; hr_identity_permission_fixture=true; http=false");
            System.out.println("H2_SETTLEMENT_FOUNDATION_DATABASE: checks=" + checks
                    + "; failed=0; mysql=true; formal_schema=true; actual_mappers=true; actual_ordinary_payment_service=true; settlement_service_tested=false; http=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void mapping(SqlSessionTemplate sessions, JdbcTemplate jdbc) {
        ObjectMapper json = new ObjectMapper();
        HrSeveranceRuleMapper rules = sessions.getMapper(HrSeveranceRuleMapper.class);
        HrSeveranceRule rule = new HrSeveranceRule(); rule.setTenantId(100000L); rule.setRuleCode("settlement-fixture"); rule.setRuleName("结算数据库核验规则");
        rule.setEffectiveFrom(LocalDate.of(2026, 1, 1)); rule.setSalaryComponentIds(json.createArrayNode().add(123));
        rule.setAveragingMonths(12); rule.setServiceRounding("ACTUAL_MONTHS"); rule.setVersion(0);
        equal(1, rules.insert(rule), "rule persisted through actual mapper");
        equal(123, rules.selectById(rule.getRuleId()).getSalaryComponentIds().get(0).intValue(), "rule JSON round trip");
        equal("DRAFT", rules.selectById(rule.getRuleId()).getStatus(), "new rule is unconfirmed");
        equal(rule.getRuleId(), rules.lock(100000L, rule.getRuleId()), "rule lock maps identifier");
        equal(null, rules.lock(100001L, rule.getRuleId()), "rule lock refuses other tenant");
        HrFinalSettlementMapper settlements = sessions.getMapper(HrFinalSettlementMapper.class);
        HrFinalSettlement normal = settlement("normal", 990001L); normal.setActiveLifecycleId(777L);
        equal(1, settlements.insert(normal), "settlement mapper insert");
        HrFinalSettlement persisted = settlements.selectById(normal.getSettlementId());
        equal(990001L, persisted.getActiveLifecycleId(), "generated lifecycle ignores caller value");
        equal("DRAFT", persisted.getStatus(), "new settlement stays draft");
        normal.setSettlementId(null); normal.setSettlementNo("duplicate");
        rejects(DuplicateKeyException.class, () -> settlements.insert(normal));
        context(100001L);
        try { equal(null, settlements.selectById(persisted.getSettlementId()), "cross tenant settlement read refused"); }
        finally { context(100000L); }
        persisted.setCalculationSnapshot(json.createObjectNode().put("numerator", "61").put("denominator", "372"));
        persisted.setActiveLifecycleId(888L);
        HrFinalSettlement stale = settlements.selectById(persisted.getSettlementId());
        equal(1, settlements.updateById(persisted), "settlement updates with current version");
        stale.setRemark("stale"); equal(0, settlements.updateById(stale), "stale settlement version refused");
        equal(990001L, settlements.selectById(persisted.getSettlementId()).getActiveLifecycleId(), "generated lifecycle ignores update");
        equal("61", settlements.selectById(persisted.getSettlementId()).getCalculationSnapshot().path("numerator").asText(), "exact snapshot survives JSON mapping");
        HrFinalSettlement reversal = settlement("reversal", 990001L); reversal.setSettlementKind("REVERSAL"); reversal.setReversalOfId(persisted.getSettlementId());
        equal(1, settlements.insert(reversal), "reversal stores linked original");
        equal(null, settlements.selectById(reversal.getSettlementId()).getActiveLifecycleId(), "reversal has no active normal lifecycle");
        HrFinalSettlementItemMapper items = sessions.getMapper(HrFinalSettlementItemMapper.class);
        HrFinalSettlementItem item = new HrFinalSettlementItem(); item.setTenantId(100000L); item.setSettlementId(persisted.getSettlementId());
        item.setItemType("PAYABLE"); item.setItemName("工资来源核验"); item.setSourceBizType("SALARY"); item.setSourceBizId("123");
        item.setAmount(new BigDecimal("123.45")); item.setSourceSnapshot(json.createObjectNode().put("version", 2));
        equal(1, items.insert(item), "settlement item inserted"); equal(2, items.selectById(item.getItemId()).getSourceSnapshot().path("version").intValue(), "source snapshot mapped");
        item.setItemId(null); rejects(DuplicateKeyException.class, () -> items.insert(item));
        jdbc.update("INSERT INTO hr_severance_rule_slab (slab_id,tenant_id,rule_id,sort_no,min_service_years,calculation_mode,compensation_months) VALUES (990001,100000,?,1,0,'PER_YEAR',1)", rule.getRuleId());
        equal("PER_YEAR", sessions.getMapper(HrSeveranceRuleSlabMapper.class).selectById(990001L).getCalculationMode(), "slab mapper reads mode");
        jdbc.update("INSERT INTO hr_training_recovery (recovery_id,tenant_id,employee_id,enrollment_id,agreement_file_id,assessed_amount,assessment_reason) VALUES (990001,100000,1,1,1,100,'fixture')");
        equal("DRAFT", sessions.getMapper(HrTrainingRecoveryMapper.class).selectById(990001L).getStatus(), "training recovery defaults unconfirmed");
        jdbc.update("INSERT INTO hr_exit_interview (interview_id,tenant_id,employee_id,lifecycle_application_id,interviewer_id,interview_time,improvement_items,attachment_file_ids) VALUES (990001,100000,1,990001,1,NOW(),JSON_ARRAY('fixture'),JSON_ARRAY(123))");
        equal(123, sessions.getMapper(HrExitInterviewMapper.class).selectById(990001L).getAttachmentFileIds().get(0).intValue(), "interview attachments JSON mapped");
    }

    private static void payments(BizPaymentRequestMapper mapper, JdbcTemplate jdbc) {
        BoundPaymentService service = new BoundPaymentService(mapper);
        BizPaymentRequest ordinary = payment("ordinary", "999999999999.99");
        equal(true, service.createPayment(ordinary), "expanded maximum ordinary payment saved");
        equal(new BigDecimal("999999999999.99"), mapper.selectById(ordinary.getId()).getAmount(), "maximum amount kept intact");
        equal(null, mapper.selectById(ordinary.getId()).getSourceBizType(), "ordinary source stays absent");
        BizPaymentRequest invalid = payment("invalid", "1000000000000"); rejects(IllegalArgumentException.class, () -> service.createPayment(invalid));
        invalid.setAmount(new BigDecimal("0.001")); rejects(IllegalArgumentException.class, () -> service.createPayment(invalid));
        invalid.setAmount(new BigDecimal("1")); invalid.setSourceBizType("HR_SETTLEMENT"); invalid.setSourceBizId("991");
        rejects(IllegalArgumentException.class, () -> service.createPayment(invalid));
        invalid.setSourceBizType(""); invalid.setSourceBizId(null); rejects(IllegalArgumentException.class, () -> service.createPayment(invalid));
        BizPaymentRequest modification = new BizPaymentRequest(); modification.setId(ordinary.getId()); modification.setVersion(0); modification.setReason("updated");
        equal(true, service.updatePayment(modification), "ordinary editing remains supported");
        BizPaymentRequest stale = new BizPaymentRequest(); stale.setId(ordinary.getId()); stale.setVersion(0); stale.setReason("stale");
        equal(false, service.updatePayment(stale), "ordinary stale version still rejected");
        equal("updated", mapper.selectById(ordinary.getId()).getReason(), "stale edit does not alter ordinary payment");
        jdbc.update("UPDATE biz_payment_request SET source_biz_type='HR_SETTLEMENT',source_biz_id='991' WHERE id=?", ordinary.getId());
        modification.setVersion(1); rejects(IllegalArgumentException.class, () -> service.updatePayment(modification));
        BizPaymentRequest deletion = new BizPaymentRequest(); deletion.setId(ordinary.getId()); deletion.setDeleted(1);
        rejects(IllegalArgumentException.class, () -> service.updateById(deletion));
        equal(0, mapper.selectById(ordinary.getId()).getDeleted(), "ordinary delete cannot remove HR payment");
        equal("991", mapper.selectById(ordinary.getId()).getSourceBizId(), "ordinary edits preserve HR source identity");
        BizPaymentRequest raced = payment("race", "123.45"); service.createPayment(raced);
        service.afterRead = () -> jdbc.update("UPDATE biz_payment_request SET source_biz_type='HR_ADVANCE',source_biz_id='992' WHERE id=?", raced.getId());
        BizPaymentRequest racedEdit = new BizPaymentRequest(); racedEdit.setId(raced.getId()); racedEdit.setAmount(new BigDecimal("1"));
        equal(false, service.updatePayment(racedEdit), "source bound after read is protected by SQL write condition");
        equal(new BigDecimal("123.45"), mapper.selectById(raced.getId()).getAmount(), "raced source payment amount unchanged");
        context(100001L);
        try { equal(false, service.updatePayment(racedEdit), "cross tenant ordinary update refused"); }
        finally { context(100000L); }
    }

    private static void assets(SqlSessionTemplate sessions, JdbcTemplate jdbc) throws Exception {
        jdbc.update("INSERT INTO sys_user (user_id,tenant_id,user_name,nick_name,status,deleted) VALUES (880101,100000,'settlement-asset-account','fixture','1',0)");
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,user_id) VALUES (990101,100000,'settlement-asset-source','fixture','UNKNOWN','RESIGNED',880101)");
        jdbc.update("INSERT INTO oa_asset (asset_id,tenant_id,asset_code,name,status,custodian_id,owner_id,deleted,version) VALUES "
                + "(990101,100000,'settlement-custody','fixture','IN_USE',880101,NULL,0,2),"
                + "(990102,100000,'settlement-borrowed','fixture','REPAIR',NULL,880101,0,3),"
                + "(990103,100000,'settlement-other','fixture','IN_USE',880102,880102,0,0),"
                + "(990104,100000,'settlement-id-difference','fixture','IN_USE',990101,NULL,0,0),"
                + "(990105,100001,'settlement-foreign','fixture','IN_USE',880101,NULL,0,0),"
                + "(990106,100000,'settlement-deleted','fixture','IN_USE',880101,NULL,1,0),"
                + "(990107,100000,'settlement-disputed','fixture','IN_USE',880101,880102,0,4),"
                + "(990108,100000,'settlement-returned','fixture','IDLE',NULL,NULL,0,0)");
        OaEmployeeAssetRecoveryService service = new OaEmployeeAssetRecoveryService(sessions.getMapper(OaIdentityReferenceMapper.class), sessions.getMapper(SysAssetMapper.class));
        OaEmployeeAssetRecovery response = service.outstanding(990101L);
        equal(880101L, response.userId(), "OA converts employee identity to custodian user identity");
        equal(List.of(990101L, 990102L, 990107L), response.assets().stream().map(OaEmployeeAssetRecovery.Asset::assetId).toList(), "only current tenant custody or borrow responsibility returned");
        equal(2, response.assets().get(0).version(), "asset version retained");
        equal(false, response.assets().get(2).ownershipConsistent(), "disputed custody is reported for resolution");
        ObjectMapper json = new ObjectMapper();
        equal(false, json.valueToTree(response).path("assets").get(0).has("purchaseAmount"), "recovery list does not invent loss or expose acquisition amounts");
        rejects(IllegalArgumentException.class, () -> service.outstanding(99999999L));
        context(100001L);
        try { rejects(IllegalArgumentException.class, () -> service.outstanding(990101L)); }
        finally { context(100000L); }
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,user_id) VALUES (990102,100000,'settlement-asset-duplicate','fixture','UNKNOWN','ACTIVE',880101)");
        rejects(IllegalArgumentException.class, () -> service.outstanding(990101L));
        jdbc.update("UPDATE hr_employee SET user_id=NULL WHERE id=990102");
        rejects(IllegalArgumentException.class, () -> service.outstanding(990102L));
        jdbc.update("UPDATE hr_employee SET user_id=880199 WHERE id=990102");
        rejects(IllegalArgumentException.class, () -> service.outstanding(990102L));
        jdbc.update("UPDATE oa_asset SET custodian_id=NULL,owner_id=NULL WHERE asset_id IN (990101,990102,990107)");
        equal(List.of(), service.outstanding(990101L).assets(), "verified employee can have genuinely empty outstanding list");
        com.cloudflow.common.security.annotation.Inner protection = com.cloudflow.oa.controller.InnerAssetRecoveryController.class
                .getMethod("outstanding", Long.class).getAnnotation(com.cloudflow.common.security.annotation.Inner.class);
        equal(List.of("cloudflow-service-hr"), List.of(protection.allowedServices()), "asset endpoint permits only HR internal caller");
        com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery remote = json.convertValue(response, com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery.class);
        com.cloudflow.hr.service.HrHSupport access = new com.cloudflow.hr.service.HrHSupport(null, null, null, null, null, null, null, null, null, null, null) {
            @Override public void permission(String permission) { equal("hr:settlement:calculate", permission, "HR source requires calculation permission"); }
            @Override public void scope(Long employeeId) { equal(990101L, employeeId, "HR source checks employee scope"); }
            @Override public com.cloudflow.hr.domain.entity.HrEmployee employee(Long employeeId) {
                com.cloudflow.hr.domain.entity.HrEmployee employee = new com.cloudflow.hr.domain.entity.HrEmployee(); employee.setId(employeeId); employee.setUserId(880101L); return employee;
            }
        };
        com.cloudflow.hr.service.HrSettlementAssetSource source = new com.cloudflow.hr.service.HrSettlementAssetSource(new com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback() {
            @Override public com.cloudflow.common.core.domain.R<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery> outstanding(Long identifier) {
                return com.cloudflow.common.core.domain.R.ok(remote);
            }
        }, access);
        equal(3, source.outstanding(990101L).size(), "HR accepts matching real OA response");
        com.cloudflow.hr.service.HrSettlementAssetSource unavailable = new com.cloudflow.hr.service.HrSettlementAssetSource(new com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback(), access);
        rejects(com.cloudflow.hr.service.HrHException.class, () -> unavailable.outstanding(990101L));
        com.cloudflow.hr.service.HrSettlementAssetSource foreign = new com.cloudflow.hr.service.HrSettlementAssetSource(new com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback() {
            @Override public com.cloudflow.common.core.domain.R<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery> outstanding(Long identifier) {
                return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery(identifier, 880102L, remote.assets()));
            }
        }, access);
        rejects(com.cloudflow.hr.service.HrHException.class, () -> foreign.outstanding(990101L));
        com.cloudflow.hr.service.HrSettlementAssetSource duplicated = new com.cloudflow.hr.service.HrSettlementAssetSource(new com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback() {
            @Override public com.cloudflow.common.core.domain.R<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery> outstanding(Long identifier) {
                return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery(identifier, 880101L, List.of(remote.assets().get(0), remote.assets().get(0))));
            }
        }, access);
        rejects(com.cloudflow.hr.service.HrHException.class, () -> duplicated.outstanding(990101L));
        dispositions(sessions, jdbc);
    }

    private static void dispositions(SqlSessionTemplate sessions, JdbcTemplate jdbc) {
        com.cloudflow.oa.service.impl.OaEmployeeAssetDispositionService service = new com.cloudflow.oa.service.impl.OaEmployeeAssetDispositionService(
                sessions.getMapper(OaIdentityReferenceMapper.class), sessions.getMapper(SysAssetMapper.class), sessions.getMapper(com.cloudflow.oa.mapper.OaAssetMovementMapper.class));
        rejects(IllegalArgumentException.class, () -> service.inspect(990101L, 990101L));
        jdbc.update("INSERT INTO oa_asset_movement(movement_id,tenant_id,movement_no,asset_id,purpose,from_custodian_id,movement_date,status,version,deleted,reason) VALUES(991001,100000,'SETTLEMENT_RETURN_DRAFT',990101,'RETURN',880101,'2026-01-30','DRAFT',0,0,'处置核验前置'),(991002,100001,'FOREIGN_RETURN',990101,'RETURN',880101,'2026-01-30','COMPLETED',1,0,'其他租户前置')");
        rejects(IllegalArgumentException.class, () -> service.inspect(990101L, 990101L));
        jdbc.update("UPDATE oa_asset_movement SET status='COMPLETED',version=1 WHERE movement_id=991001");
        com.cloudflow.oa.domain.vo.OaEmployeeAssetDisposition returned = service.inspect(990101L, 990101L);
        equal(true, returned.responsibilityReleased(), "release uses actual custody and ownership"); equal(991001L, returned.movement().movementId(), "release evidence excludes foreign movement"); equal("RETURN", returned.movement().purpose(), "return purpose preserved");
        jdbc.update("UPDATE oa_asset_movement SET purpose='TRANSFER',to_custodian_id=880102,version=2 WHERE movement_id=991001");
        equal("TRANSFER", service.inspect(990101L, 990101L).movement().purpose(), "transfer is not presented as return");
        jdbc.update("UPDATE oa_asset SET custodian_id=880101,owner_id=880101,version=3 WHERE asset_id=990101");
        equal(false, service.inspect(990101L, 990101L).responsibilityReleased(), "reassigned asset is not released by old movement");
        jdbc.update("UPDATE oa_asset SET custodian_id=880101,owner_id=880102 WHERE asset_id=990101");
        equal(false, service.inspect(990101L, 990101L).asset().ownershipConsistent(), "conflicting custody remains explicit");
        rejects(IllegalArgumentException.class, () -> service.inspect(990101L, 990105L)); rejects(IllegalArgumentException.class, () -> service.inspect(990101L, 990106L)); rejects(IllegalArgumentException.class, () -> service.inspect(990101L, 990103L));
        context(100001L); try { rejects(IllegalArgumentException.class, () -> service.inspect(990101L, 990101L)); } finally { context(100000L); }
        try { equal(List.of("cloudflow-service-hr"), List.of(com.cloudflow.oa.controller.InnerAssetDispositionController.class.getMethod("inspect", Long.class, Long.class).getAnnotation(com.cloudflow.common.security.annotation.Inner.class).allowedServices()), "disposition endpoint is HR-internal only"); }
        catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
    }

    private static HrFinalSettlement settlement(String number, Long lifecycle) {
        HrFinalSettlement value = new HrFinalSettlement(); value.setTenantId(100000L); value.setSettlementNo(number);
        value.setEmployeeId(1L); value.setLifecycleApplicationId(lifecycle); value.setJoinDate(LocalDate.of(2020, 1, 1));
        value.setRelievingDate(LocalDate.of(2026, 9, 30)); value.setVersion(0); return value;
    }
    private static BizPaymentRequest payment(String number, String amount) {
        BizPaymentRequest value = new BizPaymentRequest(); value.setTenantId(100000L); value.setPaymentNo("settlement-" + number);
        value.setUserId(1L); value.setUserName("fixture"); value.setPayeeName("fixture"); value.setPaymentType("OTHER");
        value.setAmount(new BigDecimal(amount)); value.setReason("fixture"); value.setStatus("DRAFT"); value.setVersion(0); return value;
    }
    private static void context(Long tenant) { TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(1L); UserContext.setUserName("settlement-check"); UserContext.setDsType(0); }
    private static void equal(Object expected, Object actual, String label) { checks++; if (!Objects.equals(expected, actual)) throw new AssertionError(label); }
    private static void rejects(Class<? extends RuntimeException> type, Runnable action) {
        try { action.run(); } catch (RuntimeException failure) { if (!type.isInstance(failure)) throw failure; checks++; return; }
        throw new AssertionError("invalid source operation must be rejected");
    }
    private static final class BoundPaymentService extends PaymentRequestServiceImpl {
        private Runnable afterRead;
        private BoundPaymentService(BizPaymentRequestMapper mapper) { baseMapper = mapper; }
        @Override public BizPaymentRequest getById(Serializable identifier) {
            BizPaymentRequest result = super.getById(identifier);
            if (afterRead != null) { Runnable callback = afterRead; afterRead = null; callback.run(); }
            return result;
        }
    }
}
