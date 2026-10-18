package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.commission.CommissionEvents.Fact;
import com.cloudflow.common.event.commission.CommissionEvents.Progress;
import com.cloudflow.common.event.commission.CommissionEvents.Request;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.OaHrPaymentMapper;
import com.cloudflow.oa.mapper.OaSettlementPaymentMapper;
import com.cloudflow.oa.service.OaSettlementPaymentService;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/** Source reservation boundary: real SQL, Redis locks and ledgers; policy/approval and private file bytes are fixtures. */
public final class HrSettlementReservationChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final Long EMPLOYEE = 994001L;
    private static final Long SETTLEMENT = 994090L;
    private static final LocalDate EXIT = LocalDate.of(2026, 9, 30);
    private static final Long COMMISSION_PERIOD = 994450L;
    private static final Long COMMISSION_COMPONENT = 994451L;
    private static final List<Long> COMMISSION_ALLOCATIONS = List.of(994454L, 994455L);
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final HrRuleSupport support;
    private final HrHSupport access;
    private final HrSettlementReservationService service;
    private final HrSettlementAdvanceSource loans;
    private final HrSettlementLeaveSource leave;
    private final HrSettlementTrainingSource training;
    private final HrAdvanceLedgerService ledger;
    private final HrLeaveBusinessService leaveBusiness;
    private final HrEssServiceImpl ess;
    private boolean fileUnavailable;
    private boolean workflowMode;
    private boolean verificationFailure;
    private boolean outboxFailure;
    private boolean startResponseLost;
    private boolean cancelFailure;
    private boolean fundsMode;
    private boolean reversalPermission = true;
    private boolean reversalLifecycle;
    private boolean recognitionAuditFailure;
    private String commissionAuditFailureState;
    private final List<Request> commissionRequests = new ArrayList<>();
    private final List<Long> commissionChangeIds = new ArrayList<>();
    private String fundsKind = "NETTING";
    private boolean paymentResponseLost;
    private boolean paymentPermission = true;
    private boolean closureAssetPending;
    private boolean closureAssetUnavailable;
    private final Map<Long, byte[]> proofBytes = new LinkedHashMap<>();

    private HrSettlementReservationChecks(HikariDataSource data, RedissonClient redis) throws Exception {
        jdbc = new JdbcTemplate(data);
        MybatisConfiguration config = new MybatisConfiguration(); config.setMapUnderscoreToCamelCase(true); config.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0")); global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(config, global);
        List<Class<?>> mappers = List.of(HrFinalSettlementMapper.class, HrFinalSettlementItemMapper.class, HrSettlementSourceMapper.class,
                HrEmployeeMapper.class, HrEmployeeAdvanceMapper.class, HrAdvanceRepaymentMapper.class, HrSalarySlipMapper.class,
                HrAuditLogMapper.class, HrPositionMapper.class, HrLeaveTypeMapper.class, HrLeaveQuotaMapper.class, HrLeaveLedgerMapper.class,
                HrLeavePeriodMapper.class, HrEarnedLeaveScheduleMapper.class, HrTrainingRecoveryMapper.class,
                HrCompChangeMapper.class, HrCompComponentMapper.class, HrPayrollPeriodMapper.class, HrEmployeeReferralMapper.class, HrCommissionMapper.class,
                HrSettlementApprovalMapper.class, HrSettlementFundsMapper.class, WfCallbackSideEffectMapper.class, com.cloudflow.common.event.outbox.OutboxEventMapper.class,
                BizPaymentRequestMapper.class, OaHrPaymentMapper.class, OaSettlementPaymentMapper.class);
        for (Class<?> mapper : mappers) config.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(data); factory.setConfiguration(config); factory.setGlobalConfig(global); factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        List<FileSystemResource> resources = new ArrayList<>();
        for (String name : List.of("HrFinalSettlement", "HrFinalSettlementItem", "HrSettlementSource", "HrEmployeeAdvance", "HrAuditLog", "HrTrainingRecovery", "HrLeavePeriod", "HrSettlementApproval", "HrSettlementFunds", "HrEmployeeReferral", "HrCommission")) resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + name + "Mapper.xml"));
        for (String name : List.of("BizPaymentRequest", "OaHrPayment", "OaSettlementPayment")) resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/" + name + "Mapper.xml"));
        factory.setMapperLocations(resources.toArray(FileSystemResource[]::new)); sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        support = new HrRuleSupport(new DataSourceTransactionManager(data), redis, mapper(HrEmployeeMapper.class), mapper(HrAuditLogMapper.class), JSON, mapper(HrPositionMapper.class)) {
            @Override public void audit(String domain, Long businessId, String operation, Object detail) {
                super.audit(domain, businessId, operation, detail);
                if (recognitionAuditFailure && "HR_SETTLEMENT".equals(domain) && "FUNDS_RECOGNIZED".equals(operation)) throw new IllegalStateException("reverse recognition audit failure after insert");
                if (commissionAuditFailureState != null && CommissionEvents.SOURCE.equals(domain) && "COMMISSION_PROGRESS".equals(operation)
                        && !commissionChangeIds.isEmpty() && commissionChangeIds.get(commissionChangeIds.size() - 1).equals(businessId)
                        && commissionAuditFailureState.equals(JSON.valueToTree(detail).path("state").asText()))
                    throw new IllegalStateException("commission audit failure after insert");
            }
        };
        access = new HrHSupport(support, null, mapper(HrEmployeeMapper.class), null, null, null, null, null, null, JSON, null) {
            @Override public void permission(String permission) { if (!"hr:settlement:calculate".equals(permission) && !(workflowMode && "hr:settlement:submit".equals(permission)) && !(fundsMode && List.of("hr:settlement:confirm", "hr:settlement:receipt", "hr:settlement:list").contains(permission)) && !(fundsMode && reversalPermission && "hr:settlement:reverse".equals(permission))) throw HrHException.forbidden(); }
            @Override public void scope(Long employeeId) { if (!EMPLOYEE.equals(employeeId)) throw HrHException.forbidden(); }
            @Override public boolean permitted(String permission) { try { permission(permission); return true; } catch (HrHException denied) { return false; } }
            @Override public Long user() { if (UserContext.getUserId() == null) throw HrHException.forbidden(); return UserContext.getUserId(); }
            @Override public void validate(Object input) { if (input == null) throw HrHException.invalid("fixture input missing"); }
        };
        Map<Class<?>, Object> components = new LinkedHashMap<>(); components.put(ObjectMapper.class, JSON); components.put(HrRuleSupport.class, support); components.put(RedissonClient.class, redis);
        for (Class<?> type : mappers) components.put(type, sessions.getMapper(type));
        ess = construct(HrEssServiceImpl.class, components); leaveBusiness = construct(HrLeaveBusinessService.class, components);
        ledger = new HrAdvanceLedgerService(mapper(HrEmployeeAdvanceMapper.class), mapper(HrAdvanceRepaymentMapper.class), support);
        loans = new HrSettlementAdvanceSource(mapper(HrEmployeeAdvanceMapper.class), ledger, new HrSettlementPayrollSource(mapper(HrSalarySlipMapper.class), ess, access, JSON), access, JSON);
        leave = new HrSettlementLeaveSource(mapper(HrLeaveLedgerMapper.class), mapper(HrLeaveQuotaMapper.class), mapper(HrLeaveTypeMapper.class), mapper(HrLeavePeriodMapper.class), mapper(HrEarnedLeaveScheduleMapper.class), access, JSON);
        byte[] agreement = "reservation agreement fixture".getBytes(StandardCharsets.UTF_8);
        HrFileStorage storage = new HrFileStorage(null, null) {
            @Override public byte[] loadPrivate(Long fileId, String type) {
                if (fileUnavailable) throw new com.cloudflow.hr.exception.HrBusinessException("FILE_UNAVAILABLE", "fixture outage");
                if (!Long.valueOf(994073).equals(fileId) || !"HR_TRAINING_AGREEMENT".equals(type)) throw new AssertionError("unexpected file access");
                return agreement.clone();
            }
        };
        training = new HrSettlementTrainingSource(mapper(HrTrainingRecoveryMapper.class), mapper(HrFinalSettlementMapper.class), mapper(HrFinalSettlementItemMapper.class), storage, access, JSON);
        service = new HrSettlementReservationService(mapper(HrFinalSettlementMapper.class), mapper(HrFinalSettlementItemMapper.class), mapper(HrEmployeeAdvanceMapper.class), mapper(HrSettlementSourceMapper.class), loans, leave, training, ledger, leaveBusiness, reversalSources(), access, support, JSON);
        seed(agreement); prepare();
    }

    public static void main(String[] args) throws Exception {
        if ((args.length != 2 && (args.length != 3 || !List.of("--funds", "--funds-netting", "--funds-payment", "--funds-receipt", "--reversal-netting", "--reversal-payment", "--reversal-receipt").contains(args[2]))) || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        String port = System.getenv("HR_SETTLEMENT_TEST_REDIS_PORT"); String password = System.getenv("HR_SETTLEMENT_TEST_REDIS_PASSWORD");
        if (port == null || !port.matches("[0-9]{4,5}") || password == null || password.isBlank()) throw new IllegalArgumentException("Owned Redis configuration required");
        Config configuration = new Config(); configuration.setThreads(2); configuration.setNettyThreads(2);
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password).setConnectionMinimumIdleSize(1).setConnectionPoolSize(4).setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        RedissonClient redis = Redisson.create(configuration);
        try (HikariDataSource data = new HikariDataSource()) {
            data.setJdbcUrl(args[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(5); actor();
            equal(Path.of(args[1]).toRealPath(), Path.of(new JdbcTemplate(data).queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            HrSettlementReservationChecks suite = new HrSettlementReservationChecks(data, redis);
            if (args.length == 3) {
                suite.fundsMode = true;
                suite.reversalLifecycle = args[2].startsWith("--reversal-");
                suite.fundsKind = args[2].endsWith("-payment") ? "PAYMENT" : args[2].endsWith("-receipt") ? "RECEIPT" : "NETTING";
                if ("RECEIPT".equals(suite.fundsKind)) suite.jdbc.update("UPDATE hr_training_recovery SET assessed_amount=150 WHERE recovery_id=994070");
                suite.workflowChecks(); return;
            }
            suite.boundaries(); suite.freezeRelease(); suite.concurrency(); suite.zeroLoan();
            System.out.println("H2_SETTLEMENT_RESERVATION_DATABASE: checks=" + CHECKS.get() + "; failed=0; actual_mysql=true; actual_redis=true; actual_source_services=true; actual_ledgers=true; actual_salary_digest=true; policy_approval_fixture=true; private_file_bytes_fixture=true; http=false; source_posting=false");
            suite.workflowChecks();
        } finally { redis.shutdown(); UserContext.clear(); TenantContext.clear(); }
    }

    private void seed(byte[] agreement) throws Exception {
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(994001,100000,'RESERVATION_EMPLOYEE','冻结验证员工','UNKNOWN',100,'REGULAR','2026-01-01')");
        jdbc.update("INSERT INTO hr_final_settlement(settlement_id,tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,rule_id) VALUES(994090,100000,'RESERVATION_TEST',994001,994002,'2026-01-01','2026-09-30',994080)");
        jdbc.update("INSERT INTO hr_employee_advance(advance_id,tenant_id,advance_no,employee_id,apply_date,advance_amount,purpose,repay_mode,paid_time,payment_request_id,status,approval_status,outstanding_amount,reserved_amount) VALUES(994010,100000,'RESERVATION_ADVANCE',994001,'2026-09-01',1000,'冻结验证','LUMP_SUM','2026-09-01 10:00:00',994020,'PAID','APPROVED',1000,100)");
        HrSalarySlip salary = new HrSalarySlip(); salary.setId(994030L); salary.setTenantId(100000L); salary.setEmployeeId(EMPLOYEE); salary.setPeriodMonth("2026-09"); salary.setStatus("SUBMITTED"); salary.setVersion(0); salary.setDeleted(0); salary.setEmployeeConfirmed(false); salary.setPayDate(EXIT);
        salary.setTaxAmount(BigDecimal.ZERO); salary.setBenefitAmount(BigDecimal.ZERO); salary.setCurrentTax(BigDecimal.ZERO); salary.setCumulativeTaxableIncome(BigDecimal.ZERO); salary.setCumulativeDeduction(BigDecimal.ZERO); salary.setCumulativeTaxPayable(BigDecimal.ZERO); salary.setCumulativeTaxPaid(BigDecimal.ZERO);
        salary.setGrossTotal(new BigDecimal("1000.00")); salary.setDeductionTotal(new BigDecimal("100.00")); salary.setNetTotal(new BigDecimal("900.00"));
        salary.setComponents(List.of(Map.of("type", "TAX_SNAPSHOT", "periodStart", "2026-09-01", "periodEnd", "2026-09-30", "amount", "0.00"), Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE", "advanceId", "994010", "amount", "100.00"))); ess.sealSalarySlip(salary); mapper(HrSalarySlipMapper.class).insert(salary);
        jdbc.update("INSERT INTO hr_advance_repayment(tenant_id,advance_id,repay_amount,repay_type,status,source_event_key,salary_slip_id,repay_month) VALUES(100000,994010,100,'SALARY','RESERVED','SALARY:994030:ADVANCE:994010',994030,'2026-09')");
        jdbc.update("INSERT INTO hr_leave_type(id,tenant_id,leave_code,leave_name,need_quota,unit,encashment_flag,status) VALUES(994040,100000,'RESERVATION_DAY','冻结日假',1,'DAY',1,1),(994041,100000,'RESERVATION_HOUR','冻结小时假',1,'HOUR',1,1)");
        jdbc.update("INSERT INTO hr_leave_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(994050,100000,'冻结周期','2026-01-01','2026-12-31','OPEN')");
        jdbc.update("INSERT INTO hr_leave_quota(id,tenant_id,employee_id,leave_type_id,period_id,total_quota,used_quota,available_quota) VALUES(994060,100000,994001,994040,994050,2.5,0,2.5),(994061,100000,994001,994041,994050,20,0,20)");
        jdbc.update("INSERT INTO hr_leave_ledger(tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit) VALUES(100000,994001,994040,994050,'ALLOCATION',2.5,'DAY'),(100000,994001,994041,994050,'ALLOCATION',20,'HOUR')");
        jdbc.update("INSERT INTO hr_training_course(id,tenant_id,course_code,course_name) VALUES(994071,100000,'RESERVATION_COURSE','冻结培训')");
        jdbc.update("INSERT INTO hr_training_session(id,tenant_id,course_id,session_no,start_time,end_time) VALUES(994072,100000,994071,'RESERVATION_SESSION','2026-01-01 09:00:00','2026-01-01 10:00:00')");
        jdbc.update("INSERT INTO hr_training_enrollment(id,tenant_id,session_id,employee_id,status) VALUES(994074,100000,994072,994001,'APPROVED')");
        jdbc.update("INSERT INTO sys_file(file_id,tenant_id,file_name,file_type,file_size,file_hash,file_path,url,biz_type,biz_id) VALUES(994073,100000,'agreement.pdf','HR_TRAINING_AGREEMENT',?,?,'fixture-private','', 'HR_TRAINING_RECOVERY',994070)", agreement.length, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(agreement)));
        jdbc.update("INSERT INTO hr_training_recovery(recovery_id,tenant_id,employee_id,enrollment_id,agreement_file_id,assessed_amount,assessment_reason,status,confirmed_by,confirmed_time) VALUES(994070,100000,994001,994074,994073,50,'核定协议','CONFIRMED',994099,'2026-09-01 10:00:00')");
    }

    private void prepare() {
        service.locked(SETTLEMENT, record -> {
            HrSettlementAdvanceSource.Inspection loan = loans.inspect(EMPLOYEE, EXIT, SETTLEMENT); HrSettlementLeaveSource.Inspection leaves = leave.inspect(EMPLOYEE, EXIT, SETTLEMENT); HrSettlementTrainingSource.Inspection recoveries = training.inspect(EMPLOYEE, SETTLEMENT);
            equal(List.of(), loan.issues(), "loan source reconciles"); equal(List.of(), leaves.issues(), "leave source reconciles"); equal(List.of(), recoveries.issues(), "training source reconciles");
            for (HrSettlementPayrollSource.Wage value : loan.payroll().unpaid()) item(value.itemType(), "HR_SALARY_SLIP", value.salarySlipId(), new BigDecimal(value.amount()), value.evidence());
            for (HrSettlementAdvanceSource.Loan value : loan.loans()) item("RECEIVABLE", "HR_ADVANCE", value.advanceId(), new BigDecimal(value.amount()), value.evidence());
            for (HrSettlementLeaveSource.Leave value : leaves.leaves()) item("PAYABLE", "HR_LEAVE_QUOTA", value.quotaId(), new BigDecimal("25.00"), value.evidence());
            for (HrSettlementTrainingSource.Recovery value : recoveries.recoveries()) item("RECEIVABLE", "HR_TRAINING_RECOVERY", value.recoveryId(), new BigDecimal(value.amount()), value.evidence());
            ObjectNode snapshot = record.getCalculationSnapshot() instanceof ObjectNode value ? value.deepCopy() : JSON.createObjectNode(); snapshot.put("calculated", true); snapshot.putArray("missingRequirements"); record.setCalculationSnapshot(snapshot); if (!snapshot.has("workflow")) record.setApprovalStatus("DRAFT"); save(record); return null;
        });
    }

    private void item(String itemType, String type, Long id, BigDecimal amount, JsonNode evidence) {
        HrFinalSettlementItemMapper mapper = mapper(HrFinalSettlementItemMapper.class);
        HrFinalSettlementItem row = mapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<HrFinalSettlementItem>().eq(HrFinalSettlementItem::getTenantId,100000L).eq(HrFinalSettlementItem::getSettlementId,SETTLEMENT).eq(HrFinalSettlementItem::getSourceBizType,type).eq(HrFinalSettlementItem::getSourceBizId,id.toString()));
        if (row == null) { row = new HrFinalSettlementItem(); row.setTenantId(100000L); row.setSettlementId(SETTLEMENT); row.setSourceBizType(type); row.setSourceBizId(id.toString()); }
        ObjectNode facts = evidence.deepCopy(); facts.put("active", true); row.setSourceSnapshot(facts); row.setItemType(itemType); row.setItemName("来源验证"); row.setAmount(amount); row.setConfirmedFlag(1); row.setSourcePostedFlag(0);
        if (row.getItemId() == null) mapper.insert(row); else mapper.updateById(row);
    }

    private void boundaries() {
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L); reject(() -> service.locked(SETTLEMENT, record -> null), "cross tenant"); actor();
        reject(() -> service.freezeLocked(mapper(HrFinalSettlementMapper.class).selectById(SETTLEMENT)), "transaction required");
        jdbc.update("UPDATE hr_salary_slip SET version=version+1 WHERE id=994030"); reject(this::freeze, "stale version rejected"); unreserved(); prepare();
        jdbc.update("UPDATE hr_final_settlement_item SET amount=899 WHERE settlement_id=994090 AND source_biz_type='HR_ADVANCE'"); reject(this::freeze, "mismatched principal rejected"); unreserved(); prepare();
        try { service.locked(SETTLEMENT, record -> { service.freezeLocked(record); throw new IllegalStateException("rollback probe"); }); throw new AssertionError("rollback missing"); }
        catch (IllegalStateException expected) { CHECKS.incrementAndGet(); }
        unreserved(); equal(0, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND source_biz_id='994090'"), "failed transaction leaves no freeze fact");
    }

    private void freezeRelease() {
        List<Map<String,Object>> amounts = jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256 FROM hr_salary_slip WHERE id=994030");
        freeze(); equal(994090L, jdbc.queryForObject("SELECT reserved_settlement_id FROM hr_salary_slip WHERE id=994030", Long.class), "salary reserved");
        equal(new BigDecimal("1000.00"), amount("reserved_amount"), "all outstanding principal reserved once"); equal(new BigDecimal("1000.00"), amount("outstanding_amount"), "reservation does not post principal");
        equal(new BigDecimal("900.00"), jdbc.queryForObject("SELECT repay_amount FROM hr_advance_repayment WHERE repay_type='SETTLEMENT' AND settlement_id=994090",BigDecimal.class), "salary's 100 excluded from settlement loan");
        equal(994090L, jdbc.queryForObject("SELECT settlement_id FROM hr_training_recovery WHERE recovery_id=994070", Long.class), "training reserved");
        equal(2, count("SELECT COUNT(*) FROM hr_leave_quota WHERE employee_id=994001 AND available_quota=0"), "both units frozen");
        equal(amounts, jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256 FROM hr_salary_slip WHERE id=994030"), "wage amounts and sealed evidence unchanged"); ess.verifySalarySlip(mapper(HrSalarySlipMapper.class).selectById(994030L));
        List<Map<String,Object>> original = jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='FREEZE'");
        service.locked(SETTLEMENT, record -> { service.freezeLocked(record); service.verifyFrozenLocked(record); return null; });
        equal(original, jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='FREEZE'"), "repeated freeze preserves original rows");
        HrAdvanceRequests.Repayment payment = new HrAdvanceRequests.Repayment(); payment.setAmount(new BigDecimal("0.01")); payment.setRepayDate(EXIT); payment.setProofFileId(994088L); payment.setSourceEventKey("a".repeat(32)); payment.setRemark("occupied principal"); payment.setVersion(mapper(HrEmployeeAdvanceMapper.class).selectById(994010L).getVersion());
        try { ledger.repayManual(994010L,payment); throw new AssertionError("manual repayment used reserved principal"); }
        catch (IllegalArgumentException expected) { equal("实际还款不能扣走已预约本金或超过余额", expected.getMessage(), "manual repayment cannot use reserved principal"); }
        equal(new BigDecimal("1000.00"), amount("outstanding_amount"), "rejected manual repayment leaves principal unchanged");
        reject(() -> ledger.postSalary(994010L,994030L,EXIT), "ordinary payroll cannot post occupied salary");
        jdbc.update("UPDATE hr_salary_slip SET version=version+1 WHERE id=994030"); reject(() -> service.locked(SETTLEMENT, record -> { service.verifyFrozenLocked(record); return null; }), "frozen version mutation rejected");
        jdbc.update("UPDATE hr_training_recovery SET settlement_id=994091 WHERE recovery_id=994070");
        reject(this::release, "changed training owner rolls back the entire release");
        equal(994090L, jdbc.queryForObject("SELECT reserved_settlement_id FROM hr_salary_slip WHERE id=994030", Long.class), "failed release restores salary occupancy");
        equal(new BigDecimal("1000.00"), amount("reserved_amount"), "failed release restores all loan reservations");
        equal(0, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='UNFREEZE'"), "failed release commits no partial leave facts");
        jdbc.update("UPDATE hr_training_recovery SET settlement_id=994090 WHERE recovery_id=994070");
        fileUnavailable = true; release(); fileUnavailable = false; unreserved();
        equal(original, jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='FREEZE'"), "release retains original immutable freezes");
        equal(2,count("SELECT COUNT(*) FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='UNFREEZE'"),"release writes one inverse per unit");
        equal(new BigDecimal("2.50"),jdbc.queryForObject("SELECT available_quota FROM hr_leave_quota WHERE id=994060",BigDecimal.class),"original days restored"); equal(new BigDecimal("20.00"),jdbc.queryForObject("SELECT available_quota FROM hr_leave_quota WHERE id=994061",BigDecimal.class),"original hours restored");
        release(); equal(2,count("SELECT COUNT(*) FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='UNFREEZE'"),"duplicate release no new event");
        reject(this::freeze,"released draft requires fresh calculation"); prepare(); freeze();
        equal(1,mapper(HrFinalSettlementMapper.class).selectById(SETTLEMENT).getCalculationSnapshot().path("reservationHistory").size(),"previous reservation round preserved");
        equal(4,count("SELECT COUNT(*) FROM hr_leave_ledger WHERE source_biz_type='HR_SETTLEMENT' AND transaction_type='FREEZE'"),"new revision has new freeze facts"); release();
        equal(0,count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=994090 AND source_posted_flag=1"),"reservation never posts any settlement source");
    }

    private void concurrency() throws Exception {
        prepare(); int version = mapper(HrFinalSettlementMapper.class).selectById(SETTLEMENT).getVersion();
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Boolean>> writes = new ArrayList<>();
            for (int index=0;index<2;index++) writes.add(workers.submit(() -> { actor(); ready.countDown(); start.await(); try { service.locked(SETTLEMENT,record -> { HrHSupport.version(version,record.getVersion()); service.freezeLocked(record); record.setApprovalStatus("SUBMITTED"); save(record); return null; }); return true; } catch(HrHException expected) { return false; } finally { UserContext.clear(); TenantContext.clear(); } }));
            equal(true,ready.await(10,TimeUnit.SECONDS),"concurrent writers ready"); start.countDown(); int successes=0; for(Future<Boolean> write:writes) if(write.get(20,TimeUnit.SECONDS)) successes++;
            equal(1,successes,"one same-version freeze wins");
            CountDownLatch locked = new CountDownLatch(1); CountDownLatch finish = new CountDownLatch(1); CountDownLatch acquired = new CountDownLatch(1); CountDownLatch attempting = new CountDownLatch(1);
            Future<?> holder=workers.submit(() -> { actor(); try { service.locked(SETTLEMENT,record -> { locked.countDown(); try { if(!finish.await(10,TimeUnit.SECONDS)) throw new AssertionError("lock test timeout"); } catch(InterruptedException failure) { throw new IllegalStateException(failure); } return null; }); } finally {UserContext.clear();TenantContext.clear();} });
            equal(true,locked.await(10,TimeUnit.SECONDS),"settlement transaction holds leave resources");
            Future<?> adjacent=workers.submit(() -> { actor(); try { attempting.countDown(); support.locked("leave:994001:994040",() -> { acquired.countDown();return null;}); } finally {UserContext.clear();TenantContext.clear();} });
            equal(true,attempting.await(10,TimeUnit.SECONDS),"existing leave path actually attempts shared lock");
            equal(false,acquired.await(300,TimeUnit.MILLISECONDS),"existing leave lock waits for settlement transaction"); finish.countDown(); holder.get(10,TimeUnit.SECONDS); adjacent.get(10,TimeUnit.SECONDS); equal(0L,acquired.getCount(),"existing leave path resumes after commit");
        } finally { workers.shutdownNow(); equal(true,workers.awaitTermination(10,TimeUnit.SECONDS),"workers stopped"); }
        release();
    }

    private void zeroLoan() {
        jdbc.update("UPDATE hr_employee_advance SET repaid_amount=900,outstanding_amount=100,status='REPAYING' WHERE advance_id=994010");
        jdbc.update("INSERT INTO hr_advance_repayment(tenant_id,advance_id,repay_amount,repay_type,status,source_event_key,repay_date,posted_time) VALUES(100000,994010,900,'MANUAL','POSTED','MANUAL:reservation-last-balance','2026-09-30','2026-09-30 10:00:00')");
        prepare(); freeze(); equal(0,count("SELECT COUNT(*) FROM hr_advance_repayment WHERE settlement_id=994090 AND status='RESERVED'"),"fully payroll-reserved principal creates no zero settlement entry"); equal(new BigDecimal("100.00"),amount("reserved_amount"),"original payroll reservation intact"); release(); equal(new BigDecimal("100.00"),amount("outstanding_amount"),"zero settlement release never repays loan");
    }

    private void workflowChecks() {
        int before = CHECKS.get(); workflowMode = true;
        if (fundsMode) prepareCommissionSalary();
        prepare();
        if (fundsMode) {
            jdbc.update("UPDATE hr_employee SET user_id=994098 WHERE id=994001");
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES(994098,100000,100,'settlement_employee','结算员工','0',0),(994097,100000,100,'settlement_finance','独立财务','0',0),(994099,100000,100,'settlement_submitter','提交人','0',0)");
            jdbc.update("INSERT INTO sys_user_role(user_id,role_id) VALUES(994097,3),(994099,4)");
            jdbc.update("UPDATE hr_final_settlement SET total_payable=950,total_receivable=?,severance_amount=?,net_amount=? WHERE settlement_id=994090",
                    "RECEIPT".equals(fundsKind) ? 1050 : 950, "PAYMENT".equals(fundsKind) ? 100 : 0, "PAYMENT".equals(fundsKind) ? 100 : "RECEIPT".equals(fundsKind) ? -100 : 0);
            if ("PAYMENT".equals(fundsKind)) item("SEVERANCE", "HR_SEVERANCE", 994080L, new BigDecimal("100.00"), JSON.createObjectNode().put("policyFixture", true));
        }
        HrSettlementDraftService drafts = new HrSettlementDraftService(mapper(HrFinalSettlementMapper.class), mapper(HrFinalSettlementItemMapper.class), null, null, null, null, null, null, null, null, null, reversalSources(), access, support, JSON) {
            @Override void verifySubmissionLocked(HrFinalSettlement record) { if (verificationFailure) throw HrHException.conflict("FIXTURE_INCOMPLETE", "policy fixture incomplete"); if ("REVERSAL".equals(record.getSettlementKind())) super.verifySubmissionLocked(record); }
            @Override void verifyConfirmationLocked(HrFinalSettlement record) { if (verificationFailure) throw HrHException.conflict("FIXTURE_INCOMPLETE", "confirmation policy fixture incomplete"); if ("REVERSAL".equals(record.getSettlementKind())) super.verifyConfirmationLocked(record); }
            @Override ObjectNode submissionEvidenceLocked(HrFinalSettlement record) { return fundsMode ? super.submissionEvidenceLocked(record) : JSON.createObjectNode().put("reviewedFixtureVersion", record.getVersion()).put("z", new BigDecimal("10.00")).put("a", new BigDecimal("0.0100")); }
        };
        HrSettlementApprovalSupport approval = new HrSettlementApprovalSupport(null, null, access, null) {
            @Override public Map<String, Object> snapshot(HrEmployee employee, Long submitter) {
                return Map.of("applicantUserId", "994099", "settlementEmployeeUserId", "994098", HrHSupport.EXCLUDED_USERS, List.of("994099", "994098"),
                        "financeApproverIds", List.of("994097"), "processKey", "settlement_test", "definitionId", "settlement-test-definition",
                        "definitionVersion", 1, "modelDigest", "a".repeat(64), "financeNodeId", "finance");
            }
            @Override public void verifyCurrent(HrEmployee employee, ObjectNode snapshot) { equal(JSON.valueToTree(snapshot(employee, 994099L)), snapshot, "frozen fixture approval identity"); }
        };
        com.cloudflow.common.event.outbox.OutboxPublisher outbox = new com.cloudflow.common.event.outbox.OutboxPublisher(mapper(com.cloudflow.common.event.outbox.OutboxEventMapper.class), JSON) {
            @Override public void publish(com.cloudflow.common.event.core.BusinessEventEnvelope envelope) {
                super.publish(envelope); if (outboxFailure) throw new IllegalStateException("outbox failure after insert fixture");
            }
        };
        com.cloudflow.hr.client.WorkflowServiceClient remote = new com.cloudflow.hr.client.WorkflowServiceClient() {
            @Override public com.cloudflow.common.core.domain.R<Map<String, String>> startProcessInternal(com.cloudflow.hr.client.dto.WorkflowStartRequest request) {
                String key = request.getBusinessKey(); String instance = "settlement-test-"
                        + (SETTLEMENT.toString().equals(request.getVariables().get("settlementId")) ? "" : request.getVariables().get("settlementId") + "-")
                        + "r" + request.getVariables().get("settlementRevision");
                equal(true, key.endsWith(":R" + request.getVariables().get("settlementRevision")), "actual HR adapter uses revision in workflow business key");
                for (String sensitive : List.of("netAmount", "salary", "severanceAmount", "sampling", "calculationSnapshot")) equal(false, request.getVariables().containsKey(sensitive), "workflow variables omit financial details");
                jdbc.update("INSERT IGNORE INTO wf_process_instance(instance_id,tenant_id,process_def_key,definition_id,business_key,start_user_id,status,variables) VALUES(?,100000,'settlement_test','settlement-test-definition',?,994099,'RUNNING',?)", instance, key, access.json(request.getVariables()));
                if (startResponseLost) { startResponseLost = false; return com.cloudflow.common.core.domain.R.fail("lost start response fixture"); }
                return com.cloudflow.common.core.domain.R.ok(Map.of("instanceId", instance));
            }
            @Override public com.cloudflow.common.core.domain.R<com.cloudflow.hr.client.vo.ProcessInstanceVO> getProcessInstance(String id) { throw new AssertionError("unexpected remote read"); }
            @Override public com.cloudflow.common.core.domain.R<?> invalidateProcess(com.cloudflow.hr.client.dto.WorkflowInvalidateRequest request) {
                if (cancelFailure) return com.cloudflow.common.core.domain.R.fail("cancel unavailable fixture");
                jdbc.update("UPDATE wf_process_instance SET status='INVALIDATED' WHERE instance_id=? AND status IN ('RUNNING','PAUSED')", request.getProcessInstanceId());
                return com.cloudflow.common.core.domain.R.ok();
            }
        };
        HrHEventService events = new HrHEventService(outbox, null, access, mapper(WfCallbackSideEffectMapper.class));
        HrSettlementWorkflowService workflow = new HrSettlementWorkflowService(mapper(HrFinalSettlementMapper.class), mapper(HrEmployeeAdvanceMapper.class), mapper(HrSettlementApprovalMapper.class), drafts, service, approval, remote, outbox, events, access, support, JSON);
        verificationFailure = true; reject(() -> workflow.submit(SETTLEMENT, workflowVersion()), "incomplete calculation prevents submission"); verificationFailure = false; unreserved();
        outboxFailure = true;
        try { workflow.submit(SETTLEMENT, workflowVersion()); throw new AssertionError("expected transactional outbox failure"); }
        catch (IllegalStateException expected) { equal("outbox failure after insert fixture", expected.getMessage(), "only injected outbox error accepted"); }
        outboxFailure = false; unreserved();
        equal(0, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_SETTLEMENT_WORKFLOW_START'"), "source freeze and inserted outbox both roll back");
        workflow.submit(SETTLEMENT, workflowVersion());
        equal("SUBMITTED", row().getApprovalStatus(), "submission stores approval status"); equal(1, round(), "first independent workflow round");
        equal(1, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_SETTLEMENT_WORKFLOW_START'"), "submission writes one durable start message");
        HrSettlementWorkflowService.Command first = workflowCommand();
        startResponseLost = true; reject(() -> workflow.start(first), "uncertain start retries");
        equal(null, row().getInstanceId(), "lost start response remains unbound"); equal(1, count("SELECT COUNT(*) FROM wf_process_instance WHERE business_key='HR_SETTLEMENT:994090:R1'"), "remote instance already exists");
        workflow.withdraw(SETTLEMENT, withdrawal());
        equal(true, row().getCalculationSnapshot().path("workflow").path("cancelRequested").asBoolean(), "withdrawal retained while start identity uncertain");
        equal(SETTLEMENT, jdbc.queryForObject("SELECT reserved_settlement_id FROM hr_salary_slip WHERE id=994030", Long.class), "uncertain cancellation retains resources");
        reject(() -> workflow.submit(SETTLEMENT, workflowVersion()), "pending cancellation blocks new round");
        cancelFailure = true; reject(() -> workflow.cancel(first), "remote cancellation failure retries");
        equal("settlement-test-r1", row().getInstanceId(), "same business key recovers original instance");
        equal(1, count("SELECT COUNT(*) FROM wf_process_instance WHERE business_key='HR_SETTLEMENT:994090:R1'"), "lost response never duplicates original workflow");
        equal("SUBMITTED", row().getApprovalStatus(), "failed remote cancellation never invents completed withdrawal");
        cancelFailure = false; workflow.cancel(first); equal("CANCELLED", row().getApprovalStatus(), "terminal cancellation releases resources"); unreserved();
        int cancelledVersion = row().getVersion(); workflow.start(first); workflow.cancel(first); equal(cancelledVersion, row().getVersion(), "late start and duplicate cancel do not reopen old round");
        prepare(); workflow.submit(SETTLEMENT, workflowVersion()); HrSettlementWorkflowService.Command second = workflowCommand(); equal(2, round(), "resubmission increments round");
        equal(null, row().getInstanceId(), "new round explicitly clears original instance column");
        workflow.start(first); workflow.cancel(first); equal(null, row().getInstanceId(), "old commands cannot bind or cancel new round");
        workflow.start(second); String secondInstance = row().getInstanceId(); int boundVersion = row().getVersion(); workflow.start(second); equal(boundVersion, row().getVersion(), "duplicate start preserves binding version");
        com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO rejected = decision(secondInstance, "REJECTED", 994097L);
        reject(() -> workflow.onApproval(rejected), "callback cannot invent terminal workflow state");
        jdbc.update("UPDATE wf_process_instance SET status='REJECTED' WHERE instance_id=?", secondInstance);
        reject(() -> workflow.onApproval(rejected), "callback without real financial task history rejected");
        history(secondInstance, "COUNTERSIGN_REJECT", 994097L);
        jdbc.update("UPDATE wf_task_history SET on_behalf_of_user_id=994099 WHERE instance_id=?", secondInstance);
        reject(() -> workflow.onApproval(rejected), "delegated financial history rejected");
        jdbc.update("UPDATE wf_task_history SET on_behalf_of_user_id=NULL WHERE instance_id=?", secondInstance);
        for (long excluded : List.of(994099L, 994098L)) reject(() -> workflow.onApproval(decision(secondInstance, "REJECTED", excluded)), "submitter and exiting employee cannot approve");
        fileUnavailable = true; workflow.onApproval(rejected); fileUnavailable = false;
        equal("REJECTED", row().getApprovalStatus(), "actual rejection returns editable state"); unreserved();
        int rejectedVersion = row().getVersion(); workflow.onApproval(rejected); equal(rejectedVersion, row().getVersion(), "duplicate actual result is idempotent");
        equal(1, count("SELECT COUNT(*) FROM wf_callback_side_effect WHERE business_type='HR_SETTLEMENT'"), "one callback side effect per instance");
        for (String closedStatus : List.of("INVALIDATED", "TERMINATED")) {
            prepare(); workflow.submit(SETTLEMENT, workflowVersion()); HrSettlementWorkflowService.Command closing = workflowCommand(); workflow.start(closing);
            HrSettlementWorkflowService.Closed closed = new HrSettlementWorkflowService.Closed(100000L, SETTLEMENT, round(), row().getInstanceId(), closedStatus);
            reject(() -> workflow.onClosed(closed), "closure event alone cannot release a running instance");
            jdbc.update("UPDATE wf_process_instance SET status=? WHERE instance_id=?", closedStatus, row().getInstanceId());
            workflow.onClosed(closed); equal("CANCELLED", row().getApprovalStatus(), "actual administrative closure releases sources"); unreserved();
            int closedVersion = row().getVersion(); workflow.onClosed(closed); equal(closedVersion, row().getVersion(), "administrative closure replay is idempotent");
        }
        prepare(); workflow.submit(SETTLEMENT, workflowVersion()); HrSettlementWorkflowService.Command paused = workflowCommand(); workflow.start(paused);
        jdbc.update("UPDATE wf_process_instance SET status='PAUSED' WHERE instance_id=?", row().getInstanceId());
        workflow.withdraw(SETTLEMENT, withdrawal()); workflow.cancel(paused); equal("CANCELLED", row().getApprovalStatus(), "paused workflow can be withdrawn"); unreserved();
        prepare(); workflow.submit(SETTLEMENT, workflowVersion()); HrSettlementWorkflowService.Command third = workflowCommand(); equal(6, round(), "rejection and closures permit independently reviewed resubmission");
        workflow.onApproval(rejected); workflow.start(second); workflow.cancel(first); equal("SUBMITTED", row().getApprovalStatus(), "old results and commands isolated from third round");
        equal(null, row().getInstanceId(), "old result cannot restore old binding"); workflow.start(third);
        String thirdInstance = row().getInstanceId(); workflow.withdraw(SETTLEMENT, withdrawal());
        jdbc.update("UPDATE wf_process_instance SET status='PASSED' WHERE instance_id=?", thirdInstance); history(thirdInstance, "COUNTERSIGN_APPROVE", 994097L);
        workflow.cancel(third); equal("SUBMITTED", row().getApprovalStatus(), "financial completion wins race with remote cancellation");
        equal(SETTLEMENT, jdbc.queryForObject("SELECT reserved_settlement_id FROM hr_salary_slip WHERE id=994030", Long.class), "completed financial review retains frozen funds");
        workflow.onApproval(decision(thirdInstance, "APPROVED", 994097L)); equal("APPROVED", row().getApprovalStatus(), "real approved decision applied");
        equal("DRAFT", row().getStatus(), "approval alone never confirms or pays settlement"); equal(null, row().getPaymentRequestId(), "approval creates no payment");
        equal(0, count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=994090 AND source_posted_flag=1"), "approval posts no sources");
        equal(5, row().getCalculationSnapshot().path("workflowHistory").size(), "all prior workflow rounds retained");
        JsonNode oldSubmission = row().getCalculationSnapshot().path("workflowHistory").get(0);
        equal(workflow.submissionDigest(oldSubmission.path("submitted")), oldSubmission.path("submittedDigest").asText(), "old submission evidence preserved after JSON key and numeric normalization");
        equal(6, count("SELECT COUNT(DISTINCT event_id) FROM outbox_event WHERE event_type='HR_SETTLEMENT_WORKFLOW_START'"), "outbox event identity unique per round");
        equal(6, count("SELECT COUNT(*) FROM wf_process_instance WHERE business_key LIKE 'HR_SETTLEMENT:994090:R%'"), "one workflow instance per submitted round");
        System.out.println("H2_SETTLEMENT_WORKFLOW_DATABASE: checks=" + (CHECKS.get() - before) + "; failed=0; actual_application_service=true; actual_adapter=true; actual_mysql=true; actual_redis=true; actual_reservations=true; actual_outbox=true; actual_callback_markers=true; workflow_remote_fixture=true; submission_policy_fixture=true; approval_candidates_fixture=true; http=false; payment=false");
        if (fundsMode) fundsChecks(workflow, drafts, outbox);
    }

    private void fundsChecks(HrSettlementWorkflowService workflow, HrSettlementDraftService drafts, com.cloudflow.common.event.outbox.OutboxPublisher outbox) {
        int before = CHECKS.get();
        HrSettlementConfirmationService confirmation = new HrSettlementConfirmationService(service, drafts, workflow, mapper(HrFinalSettlementMapper.class), access, support, outbox);
        HrReferralBonusService bonus = bonusService();
        HrAdvancePayrollService payroll = new HrAdvancePayrollService(mapper(HrEmployeeAdvanceMapper.class), mapper(HrAdvanceRepaymentMapper.class), mapper(HrSalarySlipMapper.class), ledger, support, bonus, commissionService());
        HrSettlementPostingService posting = new HrSettlementPostingService(mapper(HrFinalSettlementItemMapper.class), mapper(HrSalarySlipMapper.class), mapper(HrTrainingRecoveryMapper.class), mapper(HrEmployeeAdvanceMapper.class), ledger, payroll, leaveBusiness, ess, support, JSON);
        OaSettlementPaymentService oa = new OaSettlementPaymentService(mapper(OaSettlementPaymentMapper.class), mapper(OaHrPaymentMapper.class), mapper(BizPaymentRequestMapper.class), outbox, JSON);
        com.cloudflow.hr.client.HrAdvancePaymentClient client = request -> {
            equal(false, org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive(), "remote OA call holds no HR source lock transaction");
            equal("HR_SETTLEMENT", request.sourceType(), "server chooses settlement source");
            Long payment = support.transaction(() -> oa.create(request.sourceId()));
            if (paymentResponseLost) { paymentResponseLost = false; return com.cloudflow.common.core.domain.R.fail("payment response lost fixture"); }
            return com.cloudflow.common.core.domain.R.ok(payment);
        };
        HrSettlementProofService proofs = new HrSettlementProofService(proofStorage(), mapper(HrSettlementFundsMapper.class), access, support);
        HrSettlementFundsService funds = new HrSettlementFundsService(mapper(HrFinalSettlementMapper.class), mapper(HrSettlementFundsMapper.class), service, workflow, posting, reversalSources(), client, proofs, access, support, JSON);
        verificationFailure = true; reject(() -> confirmation.confirm(SETTLEMENT, workflowVersion()), "confirmation requires policy revalidation"); verificationFailure = false;
        equal("DRAFT", row().getStatus(), "failed confirmation remains draft");
        jdbc.update("UPDATE wf_process_instance SET status='RUNNING' WHERE instance_id=?", row().getInstanceId());
        reject(() -> confirmation.confirm(SETTLEMENT, workflowVersion()), "confirmation requires actual passed instance");
        jdbc.update("UPDATE wf_process_instance SET status='PASSED' WHERE instance_id=?", row().getInstanceId());
        BigDecimal expectedNet = row().getNetAmount();
        jdbc.update("UPDATE hr_final_settlement SET total_payable=951,net_amount=? WHERE settlement_id=994090", expectedNet.add(BigDecimal.ONE));
        reject(() -> confirmation.confirm(SETTLEMENT, workflowVersion()), "confirmation rejects amount changed since financial review");
        jdbc.update("UPDATE hr_final_settlement SET total_payable=950,net_amount=? WHERE settlement_id=994090", expectedNet);
        if (!"RECEIPT".equals(fundsKind)) {
            outboxFailure = true;
            try { confirmation.confirm(SETTLEMENT, workflowVersion()); throw new AssertionError("expected confirmation outbox failure"); }
            catch (IllegalStateException expected) { equal("outbox failure after insert fixture", expected.getMessage(), "confirmation rolls back outbox failure"); }
            outboxFailure = false;
        }
        equal("DRAFT", row().getStatus(), "failed funds notification rolls back confirmation");
        equal(0, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_SETTLEMENT_FUNDS_REQUEST'"), "failed confirmation retains no notification");
        confirmation.confirm(SETTLEMENT, workflowVersion());
        equal("CONFIRMED", row().getStatus(), "approved settlement confirmed"); equal(null, row().getPaidTime(), "confirmation alone is not payment");
        equal(0, count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=994090 AND source_posted_flag=1"), "confirmation posts no source");
        equal("RECEIPT".equals(fundsKind) ? 0 : 1, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_SETTLEMENT_FUNDS_REQUEST'"), "only payable and netting create durable funds requests");
        reject(() -> confirmation.confirm(SETTLEMENT, workflowVersion()), "confirmed record cannot be confirmed again");
        Runnable recognize = "PAYMENT".equals(fundsKind) ? paymentChecks(funds, oa) : "RECEIPT".equals(fundsKind) ? receiptChecks(funds) : () -> HrHSupport.runAsTenant(100000L, () -> funds.processConfirmed(SETTLEMENT));
        String confirmedSnapshot = access.json(row().getCalculationSnapshot());
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=JSON_SET(calculation_snapshot,'$.confirmation.netAmount','invalid') WHERE settlement_id=994090");
        reject(recognize, "invalid confirmation amount rejected as business conflict");
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=? WHERE settlement_id=994090", confirmedSnapshot);
        jdbc.update("UPDATE hr_training_recovery SET version=version+1 WHERE recovery_id=994070");
        reject(recognize, "later source failure rolls back all earlier source postings");
        equal("CONFIRMED", row().getStatus(), "posting failure keeps financial status unchanged");
        equal("SUBMITTED", mapper(HrSalarySlipMapper.class).selectById(994030L).getStatus(), "posting failure restores payroll status");
        equal(new BigDecimal("1000.00"), amount("outstanding_amount"), "posting failure restores full principal");
        equal(new BigDecimal("1000.00"), amount("reserved_amount"), "posting failure restores salary and settlement reservations");
        equal(0, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE transaction_type='ENCASHMENT'"), "posting failure leaves no partial encashments");
        jdbc.update("UPDATE hr_training_recovery SET version=version-1 WHERE recovery_id=994070");
        commissionAuditRollback(recognize, "PAID", "settlement commission payment");
        recognize.run();
        equal("PAID", row().getStatus(), "settlement posts after verified funds processing");
        equal(fundsKind, row().getCalculationSnapshot().path("funds").path("kind").asText(), "actual funds direction retained as explicit evidence");
        if (!"PAYMENT".equals(fundsKind)) equal(null, row().getPaymentRequestId(), "netting and receipt never create an OA payment");
        equal("PAYMENT".equals(fundsKind) ? 6 : 5, count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=994090 AND source_posted_flag=1"), "every source posted atomically");
        equal("PAID", mapper(HrSalarySlipMapper.class).selectById(994030L).getStatus(), "salary recognized as paid via verified funds");
        commissionState("PAID", 2L, 994030L, SETTLEMENT, null);
        commissionReplay("paid settlement source replay");
        equal(new BigDecimal("0.00"), amount("outstanding_amount"), "salary and remaining settlement repayment clear principal");
        equal(new BigDecimal("0.00"), amount("reserved_amount"), "all principal reservations consumed");
        equal(new BigDecimal("1000.00"), jdbc.queryForObject("SELECT SUM(repay_amount) FROM hr_advance_repayment WHERE advance_id=994010 AND status='POSTED'", BigDecimal.class), "100 salary plus 900 settlement never double charges");
        equal(2, count("SELECT COUNT(*) FROM hr_leave_quota WHERE employee_id=994001 AND available_quota=0 AND frozen_quota=0 AND used_quota=total_quota"), "day and hour quantities consumed in original units");
        equal("CLEARED", mapper(HrTrainingRecoveryMapper.class).selectById(994070L).getStatus(), "training receivable collected once");
        List<Map<String, Object>> original = jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE advance_id=994010 ORDER BY repayment_id");
        int version = row().getVersion(); recognize.run();
        equal(version, row().getVersion(), "duplicate funds evidence retains version"); equal(original, jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE advance_id=994010 ORDER BY repayment_id"), "duplicate event changes no ledger");
        reject(this::release, "settled sources cannot be released as withdrawn approval");
        closureChecks(workflow, recognize);
        System.out.println("H2_SETTLEMENT_FUNDS_DATABASE: checks=" + (CHECKS.get() - before) + "; failed=0; real_confirmation=true; real_posting=true; real_mysql=true; real_redis=true; direction=" + fundsKind + "; policy_and_approval_candidates_fixture=true; source_payroll_loan_leave_training=real; http=false; oa_payment=" + "PAYMENT".equals(fundsKind) + "; receipt=" + "RECEIPT".equals(fundsKind) + "; private_file_bytes_fixture=true; permission_lookup_fixture=true");
        Long reverseId = reversalDraftChecks(funds);
        if (reversalLifecycle) reversalLifecycleChecks(reverseId, workflow, confirmation, funds, oa, recognize);
    }

    private Long reversalDraftChecks(HrSettlementFundsService funds) {
        int before = CHECKS.get();
        HrSettlementReversalDraftService drafts = new HrSettlementReversalDraftService(service, funds, mapper(HrFinalSettlementMapper.class), mapper(HrFinalSettlementItemMapper.class), access, support, JSON);
        HrSettlementRequests.Reverse request = new HrSettlementRequests.Reverse(); request.setVersion(row().getVersion()); request.setReason("财务重新核定，保留原单");
        List<Map<String,Object>> sourceRows = jdbc.queryForList("SELECT * FROM hr_final_settlement_item WHERE settlement_id=994090 ORDER BY item_id");
        List<Map<String,Object>> repayments = jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id");
        int eventCount = count("SELECT COUNT(*) FROM outbox_event");
        reversalPermission = false; reject(() -> drafts.create(SETTLEMENT, request), "reversal permission required"); reversalPermission = true;
        UserContext.setUserId(994098L); reject(() -> drafts.create(SETTLEMENT, request), "employee cannot reverse own settlement"); actor();
        request.setVersion(request.getVersion()-1); reject(() -> drafts.create(SETTLEMENT, request), "stale original version rejected"); request.setVersion(row().getVersion());
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L); reject(() -> drafts.create(SETTLEMENT, request), "other tenant cannot reverse original"); actor();
        jdbc.update("UPDATE hr_final_settlement SET status='CONFIRMED' WHERE settlement_id=994090"); reject(() -> drafts.create(SETTLEMENT, request), "unpaid status cannot form reversal draft"); jdbc.update("UPDATE hr_final_settlement SET status='CLOSED' WHERE settlement_id=994090");
        String sourceSnapshot = access.json(row().getCalculationSnapshot());
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=JSON_SET(calculation_snapshot,'$.funds.amount','999.99') WHERE settlement_id=994090");
        reject(() -> drafts.create(SETTLEMENT, request), "forged money evidence rejected");
        jdbc.update("UPDATE hr_final_settlement SET calculation_snapshot=? WHERE settlement_id=994090", sourceSnapshot);
        if ("PAYMENT".equals(fundsKind)) {
            jdbc.update("UPDATE biz_payment_request SET status='APPROVED' WHERE id=?", row().getPaymentRequestId());
            reject(() -> drafts.create(SETTLEMENT, request), "OA must actually have paid original");
            jdbc.update("UPDATE biz_payment_request SET status='PAID' WHERE id=?", row().getPaymentRequestId());
        }
        if ("RECEIPT".equals(fundsKind)) {
            Long proof = row().getSettlementProofFileId(); byte[] bytes = proofBytes.get(proof);
            proofBytes.put(proof, "changed proof".getBytes(StandardCharsets.UTF_8));
            reject(() -> drafts.create(SETTLEMENT, request), "original receipt proof bytes must still match"); proofBytes.put(proof, bytes);
        }
        // SQL tamper probes above update the automatic timestamp; measure service immutability after restoring those fixtures.
        String original = JSON.valueToTree(row()).toString();
        HrFinalSettlementItemMapper realItems = mapper(HrFinalSettlementItemMapper.class);
        HrFinalSettlementItemMapper failingItems = (HrFinalSettlementItemMapper) java.lang.reflect.Proxy.newProxyInstance(HrFinalSettlementItemMapper.class.getClassLoader(), new Class<?>[]{HrFinalSettlementItemMapper.class}, (proxy, method, arguments) -> {
            Object result;
            try { result = method.invoke(realItems, arguments); } catch (java.lang.reflect.InvocationTargetException failure) { throw failure.getCause(); }
            if ("insert".equals(method.getName())) throw new IllegalStateException("failure after actual reversal item insert");
            return result;
        });
        HrSettlementReversalDraftService failing = new HrSettlementReversalDraftService(service, funds, mapper(HrFinalSettlementMapper.class), failingItems, access, support, JSON);
        try { failing.create(SETTLEMENT, request); throw new AssertionError("reversal insert failure not injected"); }
        catch (IllegalStateException expected) { CHECKS.incrementAndGet(); }
        equal(0, count("SELECT COUNT(*) FROM hr_final_settlement WHERE reversal_of_id=994090"), "item failure rolls back reverse header");
        equal(0, count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id!=994090"), "item failure rolls back inserted reverse item");
        Long reverseId = drafts.create(SETTLEMENT, request);
        HrFinalSettlement reverse = mapper(HrFinalSettlementMapper.class).selectById(reverseId);
        equal("REVERSAL", reverse.getSettlementKind(), "persisted explicit reverse kind"); equal(SETTLEMENT, reverse.getReversalOfId(), "persisted original relationship");
        equal(row().getNetAmount().negate(), reverse.getNetAmount(), "persisted reverse net is exact opposite");
        equal("DRAFT", reverse.getStatus(), "reverse draft is not paid"); equal("DRAFT", reverse.getApprovalStatus(), "reverse requires independent approval");
        equal(null, reverse.getPaidTime(), "no fictitious reverse cash"); equal(null, reverse.getPaymentRequestId(), "does not reuse original payment");
        equal(null, reverse.getSettlementProofFileId(), "does not reuse original receipt proof");
        equal(0, count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id!=994090 AND source_posted_flag!=0"), "draft reverses no source");
        equal(sourceRows.size(), count("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id!=994090"), "all original active items persisted");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item r JOIN hr_final_settlement_item o ON o.item_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(r.source_snapshot,'$.reversalOfItemId')) AS UNSIGNED) WHERE r.settlement_id=? AND (r.amount!=-o.amount OR r.source_biz_type!=o.source_biz_type OR r.source_biz_id!=o.source_biz_id)",Integer.class,reverseId), "all reverse amounts and source links match");
        reject(() -> drafts.create(SETTLEMENT, request), "duplicate reversal does not create another row");
        equal(1, count("SELECT COUNT(*) FROM hr_final_settlement WHERE reversal_of_id=994090"), "one reversal per original");
        equal(original, JSON.valueToTree(row()).toString(), "original full header unchanged");
        equal(sourceRows,jdbc.queryForList("SELECT * FROM hr_final_settlement_item WHERE settlement_id=994090 ORDER BY item_id"),"original full details unchanged");
        equal(repayments,jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id"),"creating draft changes no loan ledger");
        equal(eventCount,count("SELECT COUNT(*) FROM outbox_event"),"creating draft publishes no cash instruction");
        equal(SETTLEMENT,mapper(HrSalarySlipMapper.class).selectById(994030L).getReservedSettlementId(),"original salary remains occupied until reverse funds");
        equal(0,row().getSupersededFlag(),"original active settlement remains occupied");
        System.out.println("H2_SETTLEMENT_REVERSAL_DRAFT_DATABASE: checks="+(CHECKS.get()-before)+"; failed=0; direction="+fundsKind+"; actual_mysql=true; actual_redis=true; actual_creation=true; actual_rollback=true; authorization_fixture=true; approval_fixture=true; proof_bytes_fixture=true; http=false; reverse_funds=false; reverse_posting=false");
        if (!reversalLifecycle) {
            reversalPostingChecks(reverseId, funds);
            reversalLoanChecks(reverseId, funds);
        }
        return reverseId;
    }

    private void reversalLifecycleChecks(Long id, HrSettlementWorkflowService workflow, HrSettlementConfirmationService confirmation,
            HrSettlementFundsService funds, OaSettlementPaymentService oa, Runnable originalRecognize) {
        int before = CHECKS.get(); actor();
        Map<String, List<Map<String, Object>>> pristine = reversalSourceRows();
        reversalPermission = false;
        reject(() -> workflow.submit(id, version(id)), "normal submission permission cannot submit reversal"); reversalPermission = true;
        equal(pristine, reversalSourceRows(), "unauthorized reverse submit changes no source or audit");
        UserContext.setUserId(994098L); reject(() -> workflow.submit(id, version(id)), "exiting employee cannot submit own reversal"); actor();
        com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO originalVersion = version(id);
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L);
        reject(() -> workflow.submit(id, originalVersion), "foreign tenant cannot submit reversal"); actor();
        outboxFailure = true;
        try { workflow.submit(id, version(id)); throw new AssertionError("reverse start outbox failure not injected"); }
        catch (IllegalStateException expected) { equal("outbox failure after insert fixture", expected.getMessage(), "reverse submit fails after actual outbox insert"); }
        finally { outboxFailure = false; }
        equal(pristine, reversalSourceRows(), "failed reverse submission restores all sources and audit");
        workflow.submit(id, version(id)); HrSettlementWorkflowService.Command first = command(id);
        startResponseLost = true; reject(() -> workflow.start(first), "reverse start response loss remains recoverable");
        com.cloudflow.hr.domain.dto.HrHRequests.ReasonVersionDTO cancel = new com.cloudflow.hr.domain.dto.HrHRequests.ReasonVersionDTO();
        cancel.setVersion(row(id).getVersion()); cancel.setReason("重新复核冲正依据"); workflow.withdraw(id, cancel);
        cancelFailure = true; reject(() -> workflow.cancel(first), "reverse cancellation cannot invent remote completion"); cancelFailure = false;
        workflow.cancel(first); equal("CANCELLED", row(id).getApprovalStatus(), "reverse approval withdrawn");
        equal("RELEASED", row(id).getCalculationSnapshot().path("reservation").path("state").asText(), "only reversal hold released");
        originalSourcesRetained();
        workflow.submit(id, version(id)); HrSettlementWorkflowService.Command second = command(id); workflow.start(second);
        String rejectedInstance = row(id).getInstanceId();
        jdbc.update("UPDATE wf_process_instance SET status='REJECTED' WHERE instance_id=?", rejectedInstance); history(rejectedInstance, "COUNTERSIGN_REJECT", 994097L);
        workflow.onApproval(decision(id, rejectedInstance, "REJECTED", 994097L));
        equal("REJECTED", row(id).getApprovalStatus(), "independent financial rejection applied to reversal"); originalSourcesRetained();
        workflow.submit(id, version(id)); HrSettlementWorkflowService.Command third = command(id); workflow.start(third);
        workflow.cancel(first); workflow.start(second); workflow.onApproval(decision(id, rejectedInstance, "REJECTED", 994097L));
        equal("SUBMITTED", row(id).getApprovalStatus(), "old reversal rounds cannot replace current round");
        String instance = row(id).getInstanceId();
        reject(() -> workflow.onApproval(decision(id, instance, "APPROVED", 994097L)), "reverse approval requires actual passed instance");
        jdbc.update("UPDATE wf_process_instance SET status='PASSED' WHERE instance_id=?", instance); history(instance, "COUNTERSIGN_APPROVE", 994097L);
        for (long excluded : List.of(994099L, 994098L)) reject(() -> workflow.onApproval(decision(id, instance, "APPROVED", excluded)), "reverse review excludes submitter and exiting employee");
        workflow.onApproval(decision(id, instance, "APPROVED", 994097L));
        equal("APPROVED", row(id).getApprovalStatus(), "reversal has its own approved workflow");
        equal(false, Objects.equals(row().getInstanceId(), instance), "original approval never reused");
        equal(2, row(id).getCalculationSnapshot().path("workflowHistory").size(), "reversal prior review rounds retained"); originalSourcesRetained();
        confirmation.confirm(id, version(id));
        equal("CONFIRMED", row(id).getStatus(), "approved reversal confirmed"); equal(null, row(id).getPaidTime(), "confirmed reversal still awaits money");
        originalSourcesRetained();
        Map<String, List<Map<String, Object>>> beforePreview = reversalSourceRows();
        service.locked(id, record -> { reversalSources().verifyRestorableLocked(record); return null; });
        equal(beforePreview, reversalSourceRows(), "restoration preflight changes no source, quota or audit");
        jdbc.update("UPDATE hr_training_recovery SET version=version+1 WHERE recovery_id=994070");
        reject(() -> service.locked(id, record -> { reversalSources().verifyRestorableLocked(record); return null; }), "changed training rejected before reverse money");
        if (row(id).getNetAmount().signum() > 0) {
            reject(() -> funds.processConfirmed(id), "changed source blocks reverse OA request creation");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM biz_payment_request WHERE source_biz_type='HR_SETTLEMENT' AND source_biz_id=?", Integer.class, id.toString()), "invalid source creates no reverse payment");
        }
        jdbc.update("UPDATE hr_training_recovery SET version=version-1 WHERE recovery_id=994070");
        Runnable recognize;
        if (row(id).getNetAmount().signum() > 0) recognize = reversalPayment(id, funds, oa);
        else if (row(id).getNetAmount().signum() < 0) {
            UserContext.setUserId(994097L);
            HrSettlementProofService.Proof proof = funds.uploadProof(id, new ProofUpload("reverse-receipt.pdf", "%PDF-1.7\nreverse receipt fixture\n%%EOF".getBytes(StandardCharsets.UTF_8)));
            HrSettlementRequests.Receipt receipt = new HrSettlementRequests.Receipt(); receipt.setVersion(row(id).getVersion()); receipt.setProofFileId(proof.fileId()); receipt.setActualDate(HrHSupport.today());
            equal(false, Objects.equals(row().getSettlementProofFileId(), proof.fileId()), "reversal receipt has independent proof");
            recognize = () -> { UserContext.setUserId(994097L); funds.receipt(id, receipt); };
        } else recognize = () -> HrHSupport.runAsTenant(100000L, () -> funds.processConfirmed(id));
        jdbc.update("UPDATE hr_training_recovery SET version=version+1 WHERE recovery_id=994070");
        Map<String, List<Map<String, Object>>> beforeFailure = reversalSourceRows();
        reject(recognize, "training conflict prevents reverse recognition");
        equal(beforeFailure, reversalSourceRows(), "failed preflight changes no sources or audit");
        jdbc.update("UPDATE hr_training_recovery SET version=version-1 WHERE recovery_id=994070");
        Map<String, List<Map<String, Object>>> beforeLateFailure = reversalSourceRows();
        commissionAuditRollback(recognize, "POSTED", "settlement commission return");
        recognitionAuditFailure = true;
        try { recognize.run(); throw new AssertionError("late reversal audit failure not injected"); }
        catch (IllegalStateException expected) { equal("reverse recognition audit failure after insert", expected.getMessage(), "failure injected after all restored sources and final settlement save"); }
        finally { recognitionAuditFailure = false; }
        equal(beforeLateFailure, reversalSourceRows(), "last audit failure rolls back source restoration, superseding, funds and every audit");
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<?>> results = new ArrayList<>();
            for (int index = 0; index < 2; index++) results.add(workers.submit(() -> {
                actor(); try { if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("reverse concurrency start timed out"); recognize.run(); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new AssertionError(interrupted); }
                finally { UserContext.clear(); TenantContext.clear(); }
            }));
            start.countDown(); for (Future<?> result : results) result.get(30, TimeUnit.SECONDS); CHECKS.incrementAndGet();
        } catch (Exception failure) { throw new AssertionError("concurrent reverse recognition failed", failure); }
        finally { workers.shutdownNow(); actor(); }
        equal("PAID", row(id).getStatus(), "reverse actual money posts entire restoration");
        equal(1, row().getSupersededFlag(), "original unique occupancy released after full restoration");
        equal("CLOSED", row().getStatus(), "original closed status preserved");
        equal("SUBMITTED", mapper(HrSalarySlipMapper.class).selectById(994030L).getStatus(), "original salary state restored");
        equal(null, mapper(HrSalarySlipMapper.class).selectById(994030L).getReservedSettlementId(), "original salary occupancy cleared");
        commissionState("POSTED", 3L, 994030L, SETTLEMENT, id);
        commissionReplay("returned settlement source replay");
        equal(new BigDecimal("1000.00"), amount("outstanding_amount"), "principal fully restored once");
        equal(new BigDecimal("100.00"), amount("reserved_amount"), "only salary reservation restored");
        equal("CONFIRMED", mapper(HrTrainingRecoveryMapper.class).selectById(994070L).getStatus(), "training restored for new settlement");
        equal(2, count("SELECT COUNT(*) FROM hr_leave_quota WHERE employee_id=994001 AND available_quota=total_quota AND used_quota=0 AND frozen_quota=0"), "day and hour balances restored");
        Map<String, List<Map<String, Object>>> after = reversalSourceRows(); recognize.run();
        if ("RECEIPT".equals(fundsKind)) UserContext.setUserId(994097L);
        originalRecognize.run(); actor();
        equal(after, reversalSourceRows(), "duplicate original and reverse recognition preserve all history");
        if (row().getPaymentRequestId() != null) equal(row().getPaymentRequestId(), support.transaction(() -> oa.create(SETTLEMENT)), "old OA payment remains readable after complete reversal");
        HrSettlementAssetSource assets = new HrSettlementAssetSource(new com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback() {
            @Override public com.cloudflow.common.core.domain.R<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery> outstanding(Long employee) {
                return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery(employee, 994098L, List.of()));
            }
        }, access);
        HrSettlementClosureService closure = new HrSettlementClosureService(service, workflow, mapper(HrFinalSettlementItemMapper.class), mapper(HrSettlementFundsMapper.class), assets, null, access, support);
        closure.close(id, version(id)); equal("CLOSED", row(id).getStatus(), "reversal closes after restored source and asset verification");
        int closedVersion = row(id).getVersion(); closure.close(id, version(id)); recognize.run(); equal(closedVersion, row(id).getVersion(), "closed reversal replays preserve final version");
        jdbc.update("INSERT INTO hr_final_settlement(settlement_id,tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,rule_id) VALUES(994091,100000,'RECOMPUTE_AFTER_REVERSE',994001,994002,'2026-01-01','2026-09-30',994080)");
        equal(1, count("SELECT COUNT(*) FROM hr_final_settlement WHERE settlement_id=994091 AND settlement_kind='NORMAL'"), "new normal settlement allowed after full reversal");
        HrAdvancePayrollService resumedPayroll = new HrAdvancePayrollService(mapper(HrEmployeeAdvanceMapper.class), mapper(HrAdvanceRepaymentMapper.class),
                mapper(HrSalarySlipMapper.class), ledger, support, bonusService(), commissionService());
        List<Map<String, Object>> sealedSalary = jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256 FROM hr_salary_slip WHERE id=994030");
        resumedPayroll.pay(994030L, ess::verifySalarySlip);
        resumedPayroll.pay(994030L, ess::verifySalarySlip);
        commissionState("PAID", 4L, 994030L, null, null);
        commissionReplay("repaid salary keeps latest commission progress");
        equal(sealedSalary, jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256 FROM hr_salary_slip WHERE id=994030"), "commission repayment preserves sealed signed amounts");
        Map<String, List<Map<String, Object>>> afterRepayment = reversalSourceRows();
        if ("RECEIPT".equals(fundsKind)) UserContext.setUserId(994097L);
        originalRecognize.run(); recognize.run(); actor();
        equal(afterRepayment, reversalSourceRows(), "late original and reverse funds preserve subsequent commission payment");
        System.out.println("H3_COMMISSION_SETTLEMENT_DATABASE: failed=0; original_direction=" + fundsKind
                + "; original_commission_and_refund=true; actual_payment_return_and_repayment=true; source_audit_rollback=true; concurrent_return=true; late_replay=true; actual_mysql=true; actual_redis=true; crm_approved_source_fixture=true; http=false");
        System.out.println("H2_SETTLEMENT_REVERSAL_LIFECYCLE_DATABASE: checks=" + (CHECKS.get()-before)
                + "; failed=0; original_direction=" + fundsKind + "; actual_approval_service=true; actual_confirmation=true; actual_funds_service=true; actual_source_restoration=true; withdrawal_rejection_resubmit=true; lost_response=true; read_only_source_preflight=true; late_failure_rollback=true; concurrent_recognition=true; original_and_reverse_retry=true; actual_mysql=true; actual_redis=true; workflow_remote_fixture=true; approval_candidates_fixture=true; private_file_bytes_fixture=true; http=false");
    }

    private Runnable reversalPayment(Long id, HrSettlementFundsService funds, OaSettlementPaymentService oa) {
        paymentResponseLost = true; reject(() -> funds.processConfirmed(id), "reverse OA response loss retries original request"); funds.processConfirmed(id);
        Long paymentId = row(id).getPaymentRequestId();
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM biz_payment_request WHERE source_biz_type='HR_SETTLEMENT' AND source_biz_id=?", Integer.class, id.toString()), "one independent reverse payment");
        cn.dev33.satoken.stp.StpLogic previous = cn.dev33.satoken.stp.StpUtil.getStpLogic();
        cn.dev33.satoken.stp.StpUtil.setStpLogic(new cn.dev33.satoken.stp.StpLogic("reverse-payment-check") {
            @Override public boolean hasPermission(String permission) { return "oa:payment:pay".equals(permission); }
        });
        try { UserContext.setUserId(994097L); support.transaction(() -> oa.confirmPaid(paymentId)); support.transaction(() -> oa.confirmPaid(paymentId)); }
        finally { cn.dev33.satoken.stp.StpUtil.setStpLogic(previous); actor(); }
        String persisted = jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='HR_SETTLEMENT_PAYMENT_PAID' AND aggregate_id=?", String.class, paymentId);
        try {
            HrSettlementFundsService.Paid paid = JSON.readValue(com.cloudflow.common.event.core.BusinessEventEnvelopeCodec.read(persisted, JSON).getPayload(), HrSettlementFundsService.Paid.class);
            return () -> HrHSupport.runAsTenant(100000L, () -> funds.paid(paid));
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw new AssertionError("reverse OA event must parse", failure); }
    }

    private void originalSourcesRetained() {
        equal(0, row().getSupersededFlag(), "original remains active before reverse money");
        equal(SETTLEMENT, mapper(HrSalarySlipMapper.class).selectById(994030L).getReservedSettlementId(), "original salary remains occupied");
        equal("PAID", mapper(HrSalarySlipMapper.class).selectById(994030L).getStatus(), "original salary remains paid");
        equal(new BigDecimal("0.00"), amount("outstanding_amount"), "approval alone never returns loan principal");
        equal("CLEARED", mapper(HrTrainingRecoveryMapper.class).selectById(994070L).getStatus(), "approval alone never returns training receivable");
    }

    private HrFinalSettlement row(Long id) { return mapper(HrFinalSettlementMapper.class).selectById(id); }
    private com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO version(Long id) { com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO input = new com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO(); input.setVersion(row(id).getVersion()); return input; }
    private HrSettlementWorkflowService.Command command(Long id) { return new HrSettlementWorkflowService.Command(100000L, id, row(id).getCalculationSnapshot().path("workflow").path("revision").intValue()); }
    private com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO decision(Long id, String instance, String result, Long actor) {
        com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO dto = decision(instance, result, actor); dto.setBusinessId(id); dto.setBusinessNo(row(id).getSettlementNo()); return dto;
    }

    private void reversalPostingChecks(Long reversalId, HrSettlementFundsService funds) {
        int before = CHECKS.get();
        HrAdvancePayrollService payroll = new HrAdvancePayrollService(mapper(HrEmployeeAdvanceMapper.class), mapper(HrAdvanceRepaymentMapper.class),
                mapper(HrSalarySlipMapper.class), ledger, support, bonusService(), commissionService());
        HrSettlementReversalSourceService posting = new HrSettlementReversalSourceService(mapper(HrFinalSettlementMapper.class), mapper(HrFinalSettlementItemMapper.class),
                mapper(HrSalarySlipMapper.class), mapper(HrEmployeeAdvanceMapper.class), mapper(HrTrainingRecoveryMapper.class), ledger, payroll, leaveBusiness, training, ess, support, JSON);
        Map<String, List<Map<String, Object>>> originals = reversalSourceRows();
        reject(() -> posting.verifyLocked(mapper(HrFinalSettlementMapper.class).selectById(reversalId)), "complete reversal requires locked transaction");
        service.locked(SETTLEMENT, original -> { funds.verifyRecognizedLocked(original); posting.verifyLocked(mapper(HrFinalSettlementMapper.class).selectById(reversalId)); CHECKS.incrementAndGet(); return null; });
        reject(() -> service.locked(SETTLEMENT, original -> {
            HrFinalSettlement reverse = mapper(HrFinalSettlementMapper.class).selectById(reversalId); reverse.setNetAmount(reverse.getNetAmount().add(BigDecimal.ONE));
            posting.verifyLocked(reverse); return null;
        }), "reverse amount cannot diverge from original paid cents");
        reject(() -> service.locked(SETTLEMENT, original -> {
            HrFinalSettlement reverse = mapper(HrFinalSettlementMapper.class).selectById(reversalId);
            ((ObjectNode) reverse.getCalculationSnapshot().path("reversal").path("original")).put("paymentRequestId", 999999);
            posting.verifyLocked(reverse); return null;
        }), "frozen original payment cannot be forged");
        Runnable post = () -> service.locked(SETTLEMENT, original -> {
            funds.verifyRecognizedLocked(original);
            HrFinalSettlement reverse = mapper(HrFinalSettlementMapper.class).selectById(reversalId);
            java.time.LocalDateTime now = HrHSupport.now().withNano(0);
            reverse.setStatus("CONFIRMED"); reverse.setApprovalStatus("APPROVED"); reverse.setConfirmedBy(994097L); reverse.setConfirmedTime(now);
            ObjectNode calculation = ((ObjectNode) reverse.getCalculationSnapshot()).deepCopy();
            calculation.putObject("reservation").put("state", "FROZEN").put("originalSettlementId", SETTLEMENT.toString());
            calculation.putObject("funds").put("fixture", true).put("eventId", "REVERSE_SOURCE_FIXTURE"); reverse.setCalculationSnapshot(calculation);
            posting.postLocked(reverse, now, now.toLocalDate(), "REVERSE_SOURCE_FIXTURE");
            if (mapper(HrFinalSettlementMapper.class).updateById(reverse) != 1) throw new AssertionError("reverse test persistence failed");
            return null;
        });
        jdbc.execute("CREATE TRIGGER h2_training_reverse_failure BEFORE UPDATE ON hr_training_recovery FOR EACH ROW BEGIN IF OLD.recovery_id=994070 AND OLD.status='CLEARED' AND NEW.status='CONFIRMED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='training return failure after other source writes'; END IF; END");
        try {
            boolean failed = false; try { post.run(); } catch (org.springframework.dao.DataAccessException expected) { failed = true; }
            equal(true, failed, "failure after salary loan and leave writes injected");
            equal(originals, reversalSourceRows(), "late training failure rolls back all source rows audits and parent flags");
        } finally { jdbc.execute("DROP TRIGGER h2_training_reverse_failure"); }
        try {
            support.transaction(() -> {
                post.run();
                equal(1, row().getSupersededFlag(), "original active settlement released only after every reverse source");
                equal("PAID", mapper(HrFinalSettlementMapper.class).selectById(reversalId).getStatus(), "reverse source transaction persists completed state");
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=? AND source_posted_flag!=1", Integer.class, reversalId), "all reverse details posted together");
                equal("SUBMITTED", mapper(HrSalarySlipMapper.class).selectById(994030L).getStatus(), "whole transaction restores original salary status");
                equal(null, mapper(HrSalarySlipMapper.class).selectById(994030L).getReservedSettlementId(), "whole transaction releases salary occupation");
                equal(new BigDecimal("1000.00"), amount("outstanding_amount"), "whole transaction restores principal");
                equal(new BigDecimal("100.00"), amount("reserved_amount"), "whole transaction retains original salary deduction reservation");
                HrTrainingRecovery restored = mapper(HrTrainingRecoveryMapper.class).selectById(994070L);
                equal("CONFIRMED", restored.getStatus(), "training assessment remains confirmed");
                equal(BigDecimal.ZERO.setScale(2), restored.getCollectedAmount(), "training actual collection returned");
                equal(null, restored.getSettlementId(), "training source occupation cleared by SQL");
                equal(0, training.inspect(EMPLOYEE, null).issues().size(), "training original and reverse collections reconcile with superseded flag");
                equal(1, training.inspect(EMPLOYEE, null).recoveries().size(), "training may enter a subsequent settlement");
                equal(0, loans.inspect(EMPLOYEE, EXIT, null).issues().size(), "whole restoration yields valid next-settlement payroll and loan sources");
                equal(0, leave.inspect(EMPLOYEE, EXIT, null).issues().size(), "whole restoration yields valid original day and hour sources");
                jdbc.update("INSERT INTO hr_final_settlement(tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,rule_id) SELECT tenant_id,'REPLACEMENT_AFTER_FULL_RETURN',employee_id,lifecycle_application_id,join_date,relieving_date,rule_id FROM hr_final_settlement WHERE settlement_id=994090");
                equal(1, count("SELECT COUNT(*) FROM hr_final_settlement WHERE settlement_no='REPLACEMENT_AFTER_FULL_RETURN'"), "database permits new normal settlement after full reversal");
                throw new ReversalPostingRollback();
            });
            throw new AssertionError("whole source probe rollback missing");
        } catch (ReversalPostingRollback expected) { CHECKS.incrementAndGet(); }
        equal(originals, reversalSourceRows(), "whole source success probe rolled back before independent helper tests");
        System.out.println("H2_SETTLEMENT_REVERSAL_POSTING_DATABASE: checks=" + (CHECKS.get() - before)
                + "; failed=0; actual_complete_source_transaction=true; salary_loan_day_hour_training=true; original_occupancy_released_last=true; late_failure_rollback=true; source_success_probe_rolled_back=true; reverse_approval_and_funds_fixture=true; bonus_in_combined_salary=false; http=false");
    }

    private Map<String, List<Map<String, Object>>> reversalSourceRows() {
        Map<String, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        rows.put("hr_final_settlement", jdbc.queryForList("SELECT * FROM hr_final_settlement ORDER BY 1"));
        rows.put("hr_final_settlement_item", jdbc.queryForList("SELECT * FROM hr_final_settlement_item ORDER BY 1"));
        rows.put("hr_salary_slip", jdbc.queryForList("SELECT * FROM hr_salary_slip ORDER BY 1"));
        rows.put("hr_employee_advance", jdbc.queryForList("SELECT * FROM hr_employee_advance ORDER BY 1"));
        rows.put("hr_advance_repayment", jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY 1"));
        rows.put("hr_leave_ledger", jdbc.queryForList("SELECT * FROM hr_leave_ledger ORDER BY 1"));
        rows.put("hr_leave_quota", jdbc.queryForList("SELECT * FROM hr_leave_quota ORDER BY 1"));
        rows.put("hr_training_recovery", jdbc.queryForList("SELECT * FROM hr_training_recovery ORDER BY 1"));
        rows.put("hr_audit_log", jdbc.queryForList("SELECT * FROM hr_audit_log ORDER BY 1"));
        rows.put("hr_comp_change", jdbc.queryForList("SELECT * FROM hr_comp_change ORDER BY 1"));
        rows.put("outbox_event", jdbc.queryForList("SELECT * FROM outbox_event ORDER BY 1"));
        return rows;
    }

    private static final class ReversalPostingRollback extends RuntimeException { }

    private void reversalLoanChecks(Long reversalId, HrSettlementFundsService funds) {
        int before = CHECKS.get();
        HrAdvanceRepayment source = ledger.currentSalaryEntry(994010L, 994030L, "2026-09");
        Long originalRepaymentId = source.getRepaymentId();
        BigDecimal salaryAmount = new BigDecimal("100.00"), remaining = new BigDecimal("900.00");
        LocalDate fundsDate = HrHSupport.today();
        List<Map<String, Object>> originalRows = jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id");
        List<Map<String, Object>> originalLoan = jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=994010");
        reject(() -> ledger.reverseSettlementSalaryLocked(994010L, mapper(HrSalarySlipMapper.class).selectById(994030L),
                SETTLEMENT, reversalId, originalRepaymentId, salaryAmount, fundsDate), "salary refund requires enclosing transaction");
        reject(() -> ledger.reverseSettlementLocked(mapper(HrEmployeeAdvanceMapper.class).selectById(994010L), SETTLEMENT,
                reversalId, remaining, fundsDate), "principal refund requires enclosing transaction");
        for (Long wrongId : List.of(SETTLEMENT, 0L, -1L)) {
            reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementSalaryLocked(994010L,
                    mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, wrongId, originalRepaymentId, salaryAmount, fundsDate); return null; }), "invalid reversal identifier rejected");
        }
        reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementSalaryLocked(994010L,
                mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT + 1, reversalId, originalRepaymentId, salaryAmount, fundsDate); return null; }), "salary must still belong to original settlement");
        reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementSalaryLocked(994010L,
                mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, reversalId, originalRepaymentId, salaryAmount.subtract(BigDecimal.ONE), fundsDate); return null; }), "partial salary refund rejected");
        reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementLocked(mapper(HrEmployeeAdvanceMapper.class).selectById(994010L),
                SETTLEMENT, reversalId, remaining.add(BigDecimal.ONE), fundsDate); return null; }), "principal refund must match original cents");
        for (LocalDate wrongDate : List.of(source.getRepayDate().minusDays(1), fundsDate.plusDays(1))) {
            reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementSalaryLocked(994010L,
                    mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, reversalId, originalRepaymentId, salaryAmount, wrongDate); return null; }), "refund date outside actual original and today rejected");
        }
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L);
        try { reject(() -> support.transaction(() -> { ledger.reverseSettlementSalaryLocked(994010L,
                JSON.convertValue(Map.of("id", 994030L, "tenantId", 100000L), HrSalarySlip.class), SETTLEMENT, reversalId, originalRepaymentId, salaryAmount, fundsDate); return null; }), "foreign tenant source rejected"); }
        finally { actor(); }
        equal(originalRows, jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id"), "invalid refunds preserve all original repayments");
        equal(originalLoan, jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=994010"), "invalid refunds preserve complete loan");
        Runnable refund = () -> service.locked(SETTLEMENT, record -> {
            funds.verifyRecognizedLocked(record);
            ledger.reverseSettlementSalaryLocked(994010L, mapper(HrSalarySlipMapper.class).selectById(994030L),
                    SETTLEMENT, reversalId, originalRepaymentId, salaryAmount, fundsDate);
            ledger.reverseSettlementLocked(mapper(HrEmployeeAdvanceMapper.class).selectById(994010L), SETTLEMENT, reversalId, remaining, fundsDate);
            return null;
        });
        jdbc.execute("CREATE TRIGGER h2_restore_failure BEFORE INSERT ON hr_advance_repayment FOR EACH ROW BEGIN IF NEW.source_event_key LIKE 'SALARY:%:AFTER:%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='restoration failure fixture'; END IF; END");
        try {
            boolean failed = false;
            try { refund.run(); } catch (org.springframework.dao.DataAccessException expected) { failed = true; }
            equal(true, failed, "injected failure after refund and original status update");
            equal(originalRows, jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id"), "restoration failure rolls back negative entry and original status");
            equal(originalLoan, jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=994010"), "restoration failure rolls back complete loan");
        } finally { jdbc.execute("DROP TRIGGER h2_restore_failure"); }
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try {
            List<Future<Boolean>> calls = new ArrayList<>();
            for (int index = 0; index < 2; index++) calls.add(workers.submit(() -> {
                actor(); ready.countDown();
                try { if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("refund start timeout"); refund.run(); return true; }
                finally { UserContext.clear(); TenantContext.clear(); }
            }));
            equal(true, ready.await(10, TimeUnit.SECONDS), "concurrent refunds ready"); start.countDown();
            for (Future<Boolean> call : calls) equal(true, call.get(20, TimeUnit.SECONDS), "same refund converges under employee lock");
        } catch (Exception failure) { throw new AssertionError("concurrent loan refunds failed", failure); }
        finally {
            start.countDown(); workers.shutdownNow();
            try { equal(true, workers.awaitTermination(10, TimeUnit.SECONDS), "refund workers stopped"); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError("refund worker interruption", failure); }
        }
        equal(new BigDecimal("0.00"), jdbc.queryForObject("SELECT repaid_amount FROM hr_employee_advance WHERE advance_id=994010", BigDecimal.class), "all original principal returned");
        equal(new BigDecimal("1000.00"), amount("outstanding_amount"), "actual outstanding principal restored");
        equal(salaryAmount, amount("reserved_amount"), "only original salary deduction re-reserved");
        equal(2, count("SELECT COUNT(*) FROM hr_advance_repayment WHERE reversal_of_id IS NOT NULL"), "one negative entry per original repayment");
        equal(2, count("SELECT COUNT(*) FROM hr_advance_repayment WHERE status='REVERSED' AND repay_amount>0"), "positive original entries remain");
        equal(1, count("SELECT COUNT(*) FROM hr_advance_repayment WHERE status='RESERVED'"), "one restored salary reservation");
        HrAdvanceRepayment restored = ledger.currentSalaryEntry(994010L, 994030L, "2026-09");
        equal("SALARY:994030:ADVANCE:994010:AFTER:" + originalRepaymentId, restored.getSourceEventKey(), "new salary reservation links original repayment");
        equal(salaryAmount, restored.getRepayAmount(), "reservation preserves original deduction");
        equal(null, restored.getRepayDate(), "restored reservation is not actual repayment");
        equal(null, restored.getPostedTime(), "restored reservation has no posting time");
        equal(0, count("SELECT COUNT(*) FROM hr_advance_repayment r JOIN hr_advance_repayment o ON o.repayment_id=r.reversal_of_id WHERE r.repay_amount!=-o.repay_amount OR r.salary_slip_id IS NOT NULL OR r.repay_type!=o.repay_type"), "refunds retain exact original relationship and amounts");
        equal(salaryAmount, jdbc.queryForObject("SELECT SUM(repay_amount) FROM hr_advance_repayment WHERE advance_id=994010 AND repay_type='SALARY' AND status IN ('RESERVED','POSTED','REVERSED')", BigDecimal.class), "monthly deduction usage unchanged after restoration");
        equal(3, count("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_ADVANCE' AND operation_type IN ('SETTLEMENT_REVERSE','SETTLEMENT_SALARY_REVERSE','SETTLEMENT_SALARY_RESTORE')"), "refund and restoration each audited once");
        List<Map<String, Object>> finished = jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id");
        refund.run(); equal(finished, jdbc.queryForList("SELECT * FROM hr_advance_repayment ORDER BY repayment_id"), "retry preserves all event fields");
        reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementSalaryLocked(994010L,
                mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, reversalId + 100, originalRepaymentId, salaryAmount, fundsDate); return null; }), "another reversal cannot return original salary again");
        reject(() -> service.locked(SETTLEMENT, record -> { ledger.reverseSettlementLocked(mapper(HrEmployeeAdvanceMapper.class).selectById(994010L),
                SETTLEMENT, reversalId + 100, remaining, fundsDate); return null; }), "another reversal cannot return principal again");
        equal(SETTLEMENT, mapper(HrSalarySlipMapper.class).selectById(994030L).getReservedSettlementId(), "ledger helper does not release salary occupancy");
        equal(0, row().getSupersededFlag(), "ledger helper cannot release original active settlement");
        equal("DRAFT", mapper(HrFinalSettlementMapper.class).selectById(reversalId).getStatus(), "ledger test does not claim reverse funds confirmed");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_final_settlement_item WHERE settlement_id=? AND source_posted_flag=1", Integer.class, reversalId), "complete source posting remains pending");
        System.out.println("H2_SETTLEMENT_REVERSAL_LOAN_DATABASE: checks=" + (CHECKS.get() - before)
                + "; failed=0; original_direction=" + fundsKind + "; actual_mysql=true; actual_redis=true; actual_loan_refunds=true; actual_salary_reservation_restore=true; rollback=true; concurrent_same_refund=true; reverse_funds_fixture=true; salary_restore=false; other_source_reversal=false; http=false");
        reversalSalaryChecks(reversalId, originalRepaymentId, fundsDate);
        reversalLeaveChecks(reversalId);
        reversalBonusChecks(reversalId);
    }

    private HrReferralBonusService bonusService() {
        return new HrReferralBonusService(mapper(HrEmployeeReferralMapper.class), mapper(HrCompChangeMapper.class), mapper(HrCompComponentMapper.class),
                mapper(HrPayrollPeriodMapper.class), null, access, support, null, null);
    }

    private HrCommissionService commissionService() {
        OutboxEventMapper events = mapper(OutboxEventMapper.class);
        return new HrCommissionService(mapper(HrCommissionMapper.class), mapper(HrCompChangeMapper.class), mapper(HrCompComponentMapper.class),
                mapper(HrEmployeeAdvanceMapper.class), mapper(HrSalarySlipMapper.class), events, new OutboxPublisher(events, JSON), support, JSON);
    }

    private void prepareCommissionSalary() {
        equal(0, commissionRequests.size(), "one commission fixture per owned settlement database");
        jdbc.update("UPDATE hr_employee SET user_id=994098 WHERE id=994001");
        jdbc.update("INSERT INTO hr_payroll_period(period_id,tenant_id,period_name,start_date,end_date,pay_date,status) VALUES(?,100000,'提成结算周期','2026-09-01','2026-09-30','2026-09-30','OPEN')", COMMISSION_PERIOD);
        jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,taxable,status,version) VALUES(?,100000,'SETTLEMENT_COMMISSION','销售提成','VARIABLE',1,1,0)", COMMISSION_COMPONENT);
        jdbc.update("INSERT INTO crm_deal_event(event_id,tenant_id,event_key,event_type,biz_type,biz_id,amount,currency,occurred_time,team_version,source_snapshot,reversal_of_id) VALUES(994452,100000,'COMMISSION_SETTLEMENT_RECEIPT','RECEIPT','RECEIVABLE',994456,100,'CNY','2026-09-30 10:00:00',1,JSON_OBJECT('approvedSourceFixture',true),NULL),(994453,100000,'COMMISSION_SETTLEMENT_REFUND','RECEIPT','RECEIVABLE',994456,-20,'CNY','2026-09-30 11:00:00',1,JSON_OBJECT('approvedSourceFixture',true),994452)");
        jdbc.update("INSERT INTO crm_deal_allocation(allocation_id,tenant_id,event_id,sales_user_id,employee_id,dept_id,role_type,allocated_percentage,allocated_amount,commission_rate,commission_amount,commission_status,reversal_of_id) VALUES(994454,100000,994452,994098,994001,100,'PRIMARY',1,100,0.1,10,'APPROVED',NULL),(994455,100000,994453,994098,994001,100,'PRIMARY',1,-20,0.1,-2,'READY',994454)");
        OutboxPublisher publisher = new OutboxPublisher(mapper(OutboxEventMapper.class), JSON);
        for (Long allocationId : COMMISSION_ALLOCATIONS) {
            Fact fact = mapper(HrCommissionMapper.class).source(100000L, allocationId);
            Request request = new Request(1, 100000L, allocationId, "POST", COMMISSION_PERIOD, COMMISSION_COMPONENT,
                    994097L, CommissionEvents.fingerprint(fact), LocalDateTime.of(2026, 9, 30, 12, 0));
            support.transaction(() -> { publisher.publishOnceAt(CommissionEvents.encode(request, JSON), null); return null; });
            commissionRequests.add(request);
        }
        HrCommissionService commissions = commissionService();
        for (Request request : commissionRequests) commissionChangeIds.add(commissions.synchronize(request.eventId()).compChangeId());
        HrSalarySlip salary = mapper(HrSalarySlipMapper.class).selectById(994030L);
        List<Map<String, Object>> components = new ArrayList<>();
        for (Map<String, Object> original : salary.getComponents()) {
            Map<String, Object> component = new LinkedHashMap<>(original);
            if ("TAX_SNAPSHOT".equals(component.get("type"))) component.put("payrollPeriodId", COMMISSION_PERIOD.toString());
            components.add(component);
        }
        components.add(Map.of("type", "EARNING", "sourceType", "FIXED", "amount", "992.00"));
        for (Long changeId : commissionChangeIds) {
            HrCompChange change = mapper(HrCompChangeMapper.class).selectById(changeId);
            Map<String, Object> component = new LinkedHashMap<>(commissions.payrollIdentity(change));
            component.put("type", "EARNING"); component.put("sourceType", "COMPENSATION_CHANGE");
            component.put("changeId", changeId.toString()); component.put("changeVersion", change.getVersion().toString());
            component.put("effectiveDate", change.getEffectiveDate().toString()); component.put("amount", change.getChangeAmount().toPlainString());
            components.add(component);
        }
        salary.setComponents(components); ess.sealSalarySlip(salary);
        equal(1, mapper(HrSalarySlipMapper.class).updateById(salary), "save sealed settlement salary with genuine commission identities");
        commissionState("POSTED", 1L, null, null, null);
        equal(new BigDecimal("8.00"), commissionChangeIds.stream().map(identifier -> mapper(HrCompChangeMapper.class).selectById(identifier).getChangeAmount())
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2), "original commission and early refund preserve exact net amount");
    }

    private void commissionState(String state, long revision, Long salaryId, Long settlementId, Long reversalId) {
        for (Long changeId : commissionChangeIds) {
            Progress progress = JSON.convertValue(support.auditDetail(CommissionEvents.SOURCE, changeId, "COMMISSION_PROGRESS"), Progress.class);
            equal(state, progress.state(), "commission actual state"); equal(revision, progress.revision(), "commission exact immutable revision");
            equal(salaryId, progress.salarySlipId(), "commission original salary identity");
            equal(settlementId, progress.settlementId(), "commission exact settlement identity");
            equal(reversalId, progress.reversalSettlementId(), "commission actual return identity");
        }
        equal(2, commissionService().verifiedSalarySources(mapper(HrSalarySlipMapper.class).selectById(994030L)).size(), "salary reader verifies original commission and refund");
    }

    private void commissionReplay(String label) {
        Map<String, List<Map<String, Object>>> before = reversalSourceRows();
        for (Request request : commissionRequests) commissionService().synchronize(request.eventId());
        equal(before, reversalSourceRows(), label);
    }

    private void commissionAuditRollback(Runnable operation, String state, String label) {
        Map<String, List<Map<String, Object>>> before = reversalSourceRows();
        commissionAuditFailureState = state;
        try {
            operation.run(); throw new AssertionError("commission audit failure not reached");
        } catch (IllegalStateException expected) {
            equal("commission audit failure after insert", expected.getMessage(), label + " reaches actual later commission audit");
        } finally { commissionAuditFailureState = null; }
        equal(before, reversalSourceRows(), label + " rolls back salary, loan, leave, training, commission and durable events together");
    }

    private HrSettlementReversalSourceService reversalSources() {
        HrAdvancePayrollService payroll = new HrAdvancePayrollService(mapper(HrEmployeeAdvanceMapper.class), mapper(HrAdvanceRepaymentMapper.class),
                mapper(HrSalarySlipMapper.class), ledger, support, bonusService(), commissionService());
        return new HrSettlementReversalSourceService(mapper(HrFinalSettlementMapper.class), mapper(HrFinalSettlementItemMapper.class),
                mapper(HrSalarySlipMapper.class), mapper(HrEmployeeAdvanceMapper.class), mapper(HrTrainingRecoveryMapper.class), ledger, payroll, leaveBusiness, training, ess, support, JSON);
    }

    private void reversalSalaryChecks(Long reversalId, Long originalRepaymentId, LocalDate fundsDate) {
        int before = CHECKS.get();
        HrAdvancePayrollService payroll = new HrAdvancePayrollService(mapper(HrEmployeeAdvanceMapper.class), mapper(HrAdvanceRepaymentMapper.class),
                mapper(HrSalarySlipMapper.class), ledger, support, bonusService(), commissionService());
        List<Map<String, Object>> immutable = jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256,employee_confirmed FROM hr_salary_slip WHERE id=994030");
        Runnable restore = () -> service.locked(SETTLEMENT, record -> {
            HrSalarySlip salary = mapper(HrSalarySlipMapper.class).selectById(994030L); ess.verifySalarySlip(salary);
            payroll.restoreSettlementLocked(salary, SETTLEMENT, reversalId, "SUBMITTED", Map.of(994010L, originalRepaymentId), fundsDate); return null;
        });
        reject(() -> payroll.restoreSettlementLocked(mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, reversalId,
                "SUBMITTED", Map.of(994010L, originalRepaymentId), fundsDate), "salary restoration requires transaction");
        for (String invalidState : List.of("DRAFT", "PAID", "CANCELLED")) reject(() -> service.locked(SETTLEMENT, record -> {
            payroll.restoreSettlementLocked(mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, reversalId, invalidState,
                    Map.of(994010L, originalRepaymentId), fundsDate); return null;
        }), "cannot restore salary into unapproved or paid state");
        reject(() -> service.locked(SETTLEMENT, record -> {
            payroll.restoreSettlementLocked(mapper(HrSalarySlipMapper.class).selectById(994030L), SETTLEMENT, reversalId, "SUBMITTED", Map.of(), fundsDate); return null;
        }), "salary restoration must include all original deductions");
        jdbc.execute("CREATE TRIGGER h2_salary_restore_failure BEFORE INSERT ON hr_audit_log FOR EACH ROW BEGIN IF NEW.business_domain='SALARY_SLIP' AND NEW.operation_type='SETTLEMENT_PAYROLL_RESTORED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='salary restoration audit failure'; END IF; END");
        List<Map<String, Object>> original = jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id=994030");
        try {
            boolean failed = false; try { restore.run(); } catch (org.springframework.dao.DataAccessException expected) { failed = true; }
            equal(true, failed, "restoration audit failure injected after salary write");
            equal(original, jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id=994030"), "failed audit rolls back complete salary and occupancy");
        } finally { jdbc.execute("DROP TRIGGER h2_salary_restore_failure"); }
        Integer version = mapper(HrSalarySlipMapper.class).selectById(994030L).getVersion();
        restore.run(); HrSalarySlip restored = mapper(HrSalarySlipMapper.class).selectById(994030L);
        commissionState("POSTED", 3L, 994030L, SETTLEMENT, reversalId);
        equal("SUBMITTED", restored.getStatus(), "salary restored to original submitted state"); equal(null, restored.getReservedSettlementId(), "SQL actually clears salary occupancy");
        equal(version + 1, restored.getVersion(), "salary restoration increments version once");
        equal(immutable, jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256,employee_confirmed FROM hr_salary_slip WHERE id=994030"), "salary money digest and employee confirmation preserved");
        ess.verifySalarySlip(restored); payroll.assertReserved(restored); CHECKS.incrementAndGet();
        HrSettlementAdvanceSource.Inspection inspection = loans.inspect(EMPLOYEE, EXIT, null);
        equal(0, inspection.issues().size(), "restored wages and original-linked reservation accepted by next settlement source reader");
        equal(1, inspection.loans().size(), "one funded loan remains");
        equal("900.00", inspection.loans().get(0).amount(), "next settlement excludes restored salary deduction");
        equal("100.00", inspection.loans().get(0).payrollReserved(), "source reader recognizes only restored salary reservation");
        payroll.pay(994030L, ess::verifySalarySlip); payroll.pay(994030L, ess::verifySalarySlip);
        commissionState("PAID", 4L, 994030L, null, null);
        commissionReplay("ordinary repeated payroll preserves latest commission after settlement return");
        equal(new BigDecimal("100.00"), jdbc.queryForObject("SELECT repaid_amount FROM hr_employee_advance WHERE advance_id=994010", BigDecimal.class), "subsequent normal salary repays exactly once");
        equal(new BigDecimal("900.00"), amount("outstanding_amount"), "subsequent normal payroll preserves remaining principal");
        equal(BigDecimal.ZERO.setScale(2), amount("reserved_amount"), "new salary reservation consumed exactly once");
        equal("POSTED", ledger.currentSalaryEntry(994010L, 994030L, "2026-09").getStatus(), "subsequent payroll posts replacement entry");
        equal(immutable, jdbc.queryForList("SELECT components,gross_total,deduction_total,net_total,digest_sha256,employee_confirmed FROM hr_salary_slip WHERE id=994030"), "subsequent payroll preserves original amounts");
        System.out.println("H2_SETTLEMENT_REVERSAL_SALARY_DATABASE: checks=" + (CHECKS.get() - before)
                + "; failed=0; actual_salary_restore=true; cleared_occupancy=true; actual_subsequent_payroll=true; reverse_funds_fixture=true; frozen_state_fixture=true; http=false");
    }

    private void reversalLeaveChecks(Long reversalId) {
        int before = CHECKS.get(); int revision = row().getCalculationSnapshot().path("reservation").path("revision").intValue();
        List<Map<String, Object>> originals = jdbc.queryForList("SELECT * FROM hr_leave_ledger ORDER BY ledger_id");
        List<Map<String, Object>> quotas = jdbc.queryForList("SELECT * FROM hr_leave_quota WHERE employee_id=994001 ORDER BY id");
        reject(() -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId, EMPLOYEE, 994040L, 994050L, new BigDecimal("2.50"), "DAY"), "leave return requires original transaction");
        reject(() -> service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId,
                EMPLOYEE, 994040L, 994050L, new BigDecimal("2.49"), "DAY")), "leave cannot return a partial original quantity");
        reject(() -> service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId,
                EMPLOYEE, 994040L, 994050L, new BigDecimal("2.50"), "HOUR")), "day cannot be returned as hours");
        reject(() -> service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision + 100, reversalId,
                EMPLOYEE, 994040L, 994050L, new BigDecimal("2.50"), "DAY")), "wrong original freeze round rejected");
        try {
            service.locked(SETTLEMENT, record -> { leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId, EMPLOYEE,
                    994040L, 994050L, new BigDecimal("2.50"), "DAY"); throw new IllegalStateException("leave rollback probe"); });
            throw new AssertionError("leave rollback probe missing");
        } catch (IllegalStateException expected) { CHECKS.incrementAndGet(); }
        equal(originals, jdbc.queryForList("SELECT * FROM hr_leave_ledger ORDER BY ledger_id"), "leave return rollback preserves all ledger entries");
        equal(quotas, jdbc.queryForList("SELECT * FROM hr_leave_quota WHERE employee_id=994001 ORDER BY id"), "leave return rollback preserves quota cache");
        Long day = service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId,
                EMPLOYEE, 994040L, 994050L, new BigDecimal("2.50"), "DAY"));
        Long hour = service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId,
                EMPLOYEE, 994041L, 994050L, new BigDecimal("20.00"), "HOUR"));
        equal(day, service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId,
                EMPLOYEE, 994040L, 994050L, new BigDecimal("2.50"), "DAY")), "same day return reuses persisted event");
        equal(hour, service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId,
                EMPLOYEE, 994041L, 994050L, new BigDecimal("20.00"), "HOUR")), "same hour return reuses persisted event");
        equal(new BigDecimal("2.50"), jdbc.queryForObject("SELECT available_quota FROM hr_leave_quota WHERE id=994060", BigDecimal.class), "exact days restored");
        equal(new BigDecimal("20.00"), jdbc.queryForObject("SELECT available_quota FROM hr_leave_quota WHERE id=994061", BigDecimal.class), "exact hours restored");
        equal(2, count("SELECT COUNT(*) FROM hr_leave_quota WHERE employee_id=994001 AND used_quota=0 AND frozen_quota=0"), "restoration leaves no fictitious usage or freeze");
        equal(originals, jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE source_biz_type IS NULL OR source_biz_type!='HR_SETTLEMENT_REVERSAL' ORDER BY ledger_id"), "all original freeze unfreeze and encashment events preserved");
        reject(() -> service.locked(SETTLEMENT, record -> leaveBusiness.reverseSettlementLocked(SETTLEMENT, revision, reversalId + 100,
                EMPLOYEE, 994040L, 994050L, new BigDecimal("2.50"), "DAY")), "another reversal cannot return encashment twice");
        reject(() -> leaveBusiness.reverseLedger(day, "manual reversal attempt"), "manual operation cannot reverse settlement return");
        System.out.println("H2_SETTLEMENT_REVERSAL_LEAVE_DATABASE: checks=" + (CHECKS.get() - before)
                + "; failed=0; actual_day_hour_returns=true; actual_quota_restore=true; history_preserved=true; rollback=true; reverse_funds_fixture=true; http=false");
    }

    private void reversalBonusChecks(Long reversalId) {
        int before = CHECKS.get(); HrReferralBonusService bonus = bonusService();
        jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,taxable,status) VALUES(994432,100000,'RETURN_BONUS','返还奖金','VARIABLE',1,1)");
        jdbc.update("INSERT INTO hr_employee_referral(referral_id,tenant_id,referral_no,referrer_employee_id,referrer_name,candidate_name,email,target_position_id,resume_file_id,bonus_applicable_flag,bonus_amount,bonus_status,comp_change_id,instance_id,bonus_condition_snapshot) VALUES(994433,100000,'RETURN_REFERRAL',994001,'推荐人','候选人','return@example.invalid',1,1,1,80,'APPROVED',994434,'bonus-approval-fixture',?)",
                "{\"payrollPeriodId\":994435,\"salaryComponentId\":994432,\"decision\":\"APPROVED\",\"amount\":\"80.00\"}");
        jdbc.update("INSERT INTO hr_comp_change(id,tenant_id,change_no,employee_id,change_type,salary_component_id,payroll_period_id,source_biz_type,source_biz_id,after_total,change_amount,effective_date,status,process_instance_id) VALUES(994434,100000,'RETURN_CHANGE',994001,'REFERRAL_BONUS',994432,994435,'HR_REFERRAL','994433','80.00','80.00','2026-09-01','APPROVED','bonus-approval-fixture')");
        HrSalarySlip salary = new HrSalarySlip(); salary.setId(994431L); salary.setTenantId(100000L); salary.setEmployeeId(EMPLOYEE);
        salary.setStatus("PAID"); salary.setReservedSettlementId(SETTLEMENT);
        salary.setComponents(List.of(Map.of("type", "TAX_SNAPSHOT", "payrollPeriodId", 994435L),
                Map.of("type", "EARNING", "changeId", 994434L, "sourceBizType", "HR_REFERRAL", "amount", "80.00")));
        List<Map<String, Object>> change = jdbc.queryForList("SELECT * FROM hr_comp_change WHERE id=994434");
        support.transaction(() -> { bonus.postSalary(salary); return null; });
        // Exercise compatibility with a genuine pre-event-id audit format before testing subsequent unique payment events.
        jdbc.update("UPDATE hr_audit_log SET after_data=JSON_REMOVE(after_data,'$.paymentEventId','$.settlementId','$.amount') WHERE business_domain='HR_REFERRAL' AND business_id=994433 AND operation_type='BONUS_PAID'");
        Map<String, Object> firstPaid = support.auditDetail("HR_REFERRAL", 994433L, "BONUS_PAID");
        reject(() -> bonus.reverseSettlementSalaryLocked(salary, SETTLEMENT, reversalId), "bonus return requires transaction");
        jdbc.execute("CREATE TRIGGER h2_bonus_return_failure BEFORE INSERT ON hr_audit_log FOR EACH ROW BEGIN IF NEW.operation_type='BONUS_SETTLEMENT_RETURNED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bonus return audit failure'; END IF; END");
        List<Map<String, Object>> initial = jdbc.queryForList("SELECT * FROM hr_employee_referral WHERE referral_id=994433");
        try {
            boolean failed = false; try { support.transaction(() -> { bonus.reverseSettlementSalaryLocked(salary, SETTLEMENT, reversalId); return null; }); }
            catch (org.springframework.dao.DataAccessException expected) { failed = true; }
            equal(true, failed, "bonus audit failure after state update injected");
            equal(initial, jdbc.queryForList("SELECT * FROM hr_employee_referral WHERE referral_id=994433"), "failed bonus audit rolls back state date and version");
        } finally { jdbc.execute("DROP TRIGGER h2_bonus_return_failure"); }
        for (int cycle = 0; cycle < 3; cycle++) {
            Long originalId = SETTLEMENT + cycle * 100L, reverseId = reversalId + cycle * 100L;
            salary.setReservedSettlementId(originalId);
            support.transaction(() -> { bonus.reverseSettlementSalaryLocked(salary, originalId, reverseId); return null; });
            HrEmployeeReferral restored = mapper(HrEmployeeReferralMapper.class).selectById(994433L);
            equal("APPROVED", restored.getBonusStatus(), "returned bonus remains approved and payable"); equal(null, restored.getBonusPayDate(), "actual previous payment date cleared by SQL");
            Map<String, Object> returned = support.auditDetail("HR_REFERRAL", 994433L, "BONUS_SETTLEMENT_RETURNED");
            equal("80.00", returned.get("amount"), "returned bonus retains original approved amount");
            support.transaction(() -> { bonus.reverseSettlementSalaryLocked(salary, originalId, reverseId); return null; });
            equal(restored.getVersion(), mapper(HrEmployeeReferralMapper.class).selectById(994433L).getVersion(), "duplicate return preserves referral version");
            reject(() -> support.transaction(() -> { bonus.reverseSettlementSalaryLocked(salary, originalId, reverseId + 1); return null; }), "another reversal cannot return same bonus");
            salary.setReservedSettlementId(SETTLEMENT + (cycle + 1) * 100L);
            support.transaction(() -> { bonus.postSalary(salary); bonus.postSalary(salary); return null; });
            equal("PAID", mapper(HrEmployeeReferralMapper.class).selectById(994433L).getBonusStatus(), "returned approved bonus may be paid exactly once again");
            equal(returned.get("originalPaymentEventId"), support.auditDetail("HR_REFERRAL", 994433L, "BONUS_PAID").get("previousReturnedPaymentEventId"), "new payout links prior returned payout");
        }
        equal(4, count("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_REFERRAL' AND business_id=994433 AND operation_type='BONUS_PAID'"), "initial and three later payouts retained separately");
        equal(3, count("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_REFERRAL' AND business_id=994433 AND operation_type='BONUS_SETTLEMENT_RETURNED'"), "three returns remain separately auditable");
        equal(change, jdbc.queryForList("SELECT * FROM hr_comp_change WHERE id=994434"), "original compensation approval and amount never rewritten");
        try {
            equal(JSON.valueToTree(firstPaid), JSON.readTree(jdbc.queryForObject("SELECT after_data FROM hr_audit_log WHERE business_domain='HR_REFERRAL' AND business_id=994433 AND operation_type='BONUS_PAID' ORDER BY id LIMIT 1", String.class)), "legacy original payout preserved");
        } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) { throw new AssertionError("legacy payout unreadable", invalid); }
        System.out.println("H2_SETTLEMENT_REVERSAL_BONUS_DATABASE: checks=" + (CHECKS.get() - before)
                + "; failed=0; actual_referral_state_and_audits=true; repeated_returns_and_repayments=3; rollback=true; legacy_audit_fixture=true; salary_source_fixture=true; reverse_funds_fixture=true; approval_fixture=true; http=false");
    }

    private void closureChecks(HrSettlementWorkflowService workflow, Runnable recognize) {
        HrSettlementAssetSource assets = new HrSettlementAssetSource(new com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback() {
            @Override public com.cloudflow.common.core.domain.R<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery> outstanding(Long employee) {
                if (closureAssetUnavailable) return com.cloudflow.common.core.domain.R.fail("asset service outage fixture");
                List<com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery.Asset> outstanding = closureAssetPending
                        ? List.of(new com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery.Asset(994300L, "CLOSE_ASSET", "未归还资产", "model", "IN_USE", "location", 0, 994098L, 994098L, true)) : List.of();
                return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery(employee, 994098L, outstanding));
            }
        }, access);
        HrSettlementClosureService closure = new HrSettlementClosureService(service, workflow, mapper(HrFinalSettlementItemMapper.class), mapper(HrSettlementFundsMapper.class), assets, null, access, support);
        closureAssetUnavailable = true; reject(() -> closure.close(SETTLEMENT, workflowVersion()), "OA failure cannot be treated as no outstanding assets"); closureAssetUnavailable = false;
        closureAssetPending = true; reject(() -> closure.close(SETTLEMENT, workflowVersion()), "paid settlement with outstanding asset cannot close"); closureAssetPending = false;
        jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=0 WHERE settlement_id=994090 AND source_biz_type='HR_ADVANCE'");
        reject(() -> closure.close(SETTLEMENT, workflowVersion()), "all sources must be posted before closing");
        jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=1 WHERE settlement_id=994090 AND source_biz_type='HR_ADVANCE'");
        jdbc.update("UPDATE hr_final_settlement_item SET amount=amount+1 WHERE settlement_id=994090 AND source_biz_type='HR_ADVANCE'");
        reject(() -> closure.close(SETTLEMENT, workflowVersion()), "closing must retain original financially approved amounts");
        jdbc.update("UPDATE hr_final_settlement_item SET amount=amount-1 WHERE settlement_id=994090 AND source_biz_type='HR_ADVANCE'");
        equal("PAID", row().getStatus(), "all failed close attempts leave actual paid status intact");
        closure.close(SETTLEMENT, workflowVersion()); equal("CLOSED", row().getStatus(), "complete verified settlement can close");
        equal(true, row().getCalculationSnapshot().path("closure").hasNonNull("time"), "closure retains its own evidence");
        int version = row().getVersion(); closure.close(SETTLEMENT, workflowVersion()); recognize.run();
        equal(version, row().getVersion(), "repeated close and payment callbacks preserve closed settlement");
    }

    private Runnable paymentChecks(HrSettlementFundsService funds, OaSettlementPaymentService oa) {
        paymentResponseLost = true;
        reject(() -> funds.processConfirmed(SETTLEMENT), "lost OA response remains recoverable");
        equal(1, count("SELECT COUNT(*) FROM biz_payment_request WHERE source_biz_type='HR_SETTLEMENT' AND source_biz_id='994090'"), "lost response creates exactly one payment");
        equal(null, row().getPaymentRequestId(), "lost response cannot invent binding");
        HrHSupport.runAsTenant(100000L, () -> funds.processConfirmed(SETTLEMENT));
        Long paymentId = row().getPaymentRequestId();
        equal(true, paymentId != null, "retry binds original OA payment");
        equal("CONFIRMED", row().getStatus(), "created OA request never posts sources");
        int boundVersion = row().getVersion(); funds.processConfirmed(SETTLEMENT);
        equal(boundVersion, row().getVersion(), "repeated creation keeps original binding");
        cn.dev33.satoken.stp.StpLogic previous = cn.dev33.satoken.stp.StpUtil.getStpLogic();
        cn.dev33.satoken.stp.StpUtil.setStpLogic(new cn.dev33.satoken.stp.StpLogic("settlement-funds-check") {
            @Override public boolean hasPermission(String permission) { return paymentPermission && "oa:payment:pay".equals(permission); }
        });
        try {
            Runnable pay = () -> support.transaction(() -> oa.confirmPaid(paymentId));
            UserContext.setUserId(994098L); rejectPayment(pay, "exiting employee cannot acknowledge own payment");
            UserContext.setUserId(994099L); rejectPayment(pay, "HR submitter without finance role cannot acknowledge payment");
            UserContext.setUserId(994097L); paymentPermission = false; rejectPayment(pay, "OA permission required"); paymentPermission = true;
            jdbc.update("UPDATE sys_user SET dept_id=101 WHERE user_id=994097"); rejectPayment(pay, "finance outside department scope rejected");
            jdbc.update("UPDATE sys_user SET dept_id=100 WHERE user_id=994097");
            outboxFailure = true;
            try { pay.run(); throw new AssertionError("expected paid-event failure"); }
            catch (IllegalStateException expected) { equal("outbox failure after insert fixture", expected.getMessage(), "OA actual payment and event roll back together"); }
            outboxFailure = false;
            equal("APPROVED", mapper(BizPaymentRequestMapper.class).selectById(paymentId).getStatus(), "failed event cannot leave OA falsely paid");
            equal(0, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_SETTLEMENT_PAYMENT_PAID'"), "failed OA payment retains no paid event");
            pay.run(); pay.run();
            equal(1, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_SETTLEMENT_PAYMENT_PAID'"), "repeated financial acknowledgement emits one paid event");
            equal("CONFIRMED", row().getStatus(), "OA paid waits for verified HR source posting");
        } finally { cn.dev33.satoken.stp.StpUtil.setStpLogic(previous); actor(); }
        String persisted = jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='HR_SETTLEMENT_PAYMENT_PAID'", String.class);
        HrSettlementFundsService.Paid paid;
        try { paid = JSON.readValue(com.cloudflow.common.event.core.BusinessEventEnvelopeCodec.read(persisted, JSON).getPayload(), HrSettlementFundsService.Paid.class); }
        catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw new AssertionError("actual OA event must parse in HR", failure); }
        reject(() -> funds.paid(new HrSettlementFundsService.Paid(100001L, SETTLEMENT, paymentId, paid.amount(), paid.paidTime(), paid.eventId())), "cross-tenant payment event rejected");
        reject(() -> funds.paid(new HrSettlementFundsService.Paid(100000L, SETTLEMENT, paymentId, paid.amount().add(BigDecimal.ONE), paid.paidTime(), paid.eventId())), "event cannot change actual OA amount");
        reject(() -> funds.paid(new HrSettlementFundsService.Paid(100000L, SETTLEMENT, paymentId, paid.amount(), paid.paidTime().minusSeconds(1), paid.eventId())), "event cannot change original payment time");
        jdbc.update("UPDATE outbox_event SET event_type='SETTLEMENT_TEST_HIDDEN' WHERE event_type='HR_SETTLEMENT_PAYMENT_PAID'");
        reject(() -> funds.paid(paid), "OA paid flag without persisted event cannot post");
        jdbc.update("UPDATE outbox_event SET event_type='HR_SETTLEMENT_PAYMENT_PAID' WHERE event_type='SETTLEMENT_TEST_HIDDEN'");
        return () -> HrHSupport.runAsTenant(100000L, () -> funds.paid(paid));
    }

    private Runnable receiptChecks(HrSettlementFundsService funds) {
        reject(() -> funds.processConfirmed(SETTLEMENT), "negative net cannot initiate OA payment or netting");
        UserContext.setUserId(994097L);
        reject(() -> funds.uploadProof(SETTLEMENT, new ProofUpload("wrong.pdf", "not a PDF".getBytes(StandardCharsets.UTF_8))), "file extension alone is not proof");
        HrSettlementProofService.Proof proof = funds.uploadProof(SETTLEMENT, new ProofUpload("receipt.pdf", "%PDF-1.7\nsettlement receipt fixture\n%%EOF".getBytes(StandardCharsets.UTF_8)));
        equal("CONFIRMED", row().getStatus(), "upload alone is not actual collection");
        HrSettlementRequests.Receipt input = new HrSettlementRequests.Receipt(); input.setVersion(row().getVersion()); input.setProofFileId(proof.fileId()); input.setActualDate(HrHSupport.today());
        UserContext.setUserId(994099L); reject(() -> funds.receipt(SETTLEMENT, input), "different uploader cannot reuse unposted proof");
        UserContext.setUserId(994098L); reject(() -> funds.receipt(SETTLEMENT, input), "exiting employee cannot confirm own receipt");
        UserContext.setUserId(994097L);
        input.setActualDate(HrHSupport.today().plusDays(1)); reject(() -> funds.receipt(SETTLEMENT, input), "future collection date rejected");
        input.setActualDate(row().getConfirmedTime().toLocalDate().minusDays(1)); reject(() -> funds.receipt(SETTLEMENT, input), "receipt before confirmation rejected"); input.setActualDate(HrHSupport.today());
        byte[] original = proofBytes.get(proof.fileId()); proofBytes.put(proof.fileId(), "corrupt".getBytes(StandardCharsets.UTF_8));
        reject(() -> funds.receipt(SETTLEMENT, input), "modified proof bytes rejected"); proofBytes.put(proof.fileId(), original);
        equal("no-store", funds.downloadProof(SETTLEMENT, proof.fileId()).getHeaders().getFirst("Cache-Control"), "private proof is never cached");
        jdbc.update("UPDATE sys_file SET biz_id=994091 WHERE file_id=?", proof.fileId()); reject(() -> funds.receipt(SETTLEMENT, input), "proof bound to different settlement rejected");
        jdbc.update("UPDATE sys_file SET biz_id=994090 WHERE file_id=?", proof.fileId());
        return () -> funds.receipt(SETTLEMENT, input);
    }

    private HrFileStorage proofStorage() {
        return new HrFileStorage(null, null) {
            @Override public Long save(byte[] bytes, String name, String type) {
                Long id = 994200L + proofBytes.size(); proofBytes.put(id, bytes.clone());
                jdbc.update("INSERT INTO sys_file(file_id,tenant_id,file_name,file_type,file_size,file_path,url,access_type,create_by,deleted) VALUES(?,100000,?,?,?,'fixture-private','','PRIVATE',?,0)", id, name, type, bytes.length, HrRuleSupport.userName());
                return id;
            }
            @Override public byte[] loadPrivate(Long id, String type) {
                if (!HrSettlementProofService.PURPOSE.equals(type) || !proofBytes.containsKey(id)) throw HrHException.forbidden();
                return proofBytes.get(id).clone();
            }
        };
    }

    private record ProofUpload(String name, byte[] bytes) implements org.springframework.web.multipart.MultipartFile {
        @Override public String getName() { return "file"; }
        @Override public String getOriginalFilename() { return name; }
        @Override public String getContentType() { return "application/pdf"; }
        @Override public boolean isEmpty() { return bytes.length == 0; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes.clone(); }
        @Override public java.io.InputStream getInputStream() { return new java.io.ByteArrayInputStream(bytes); }
        @Override public void transferTo(java.io.File destination) { throw new UnsupportedOperationException("memory-only file fixture"); }
    }

    private static void rejectPayment(Runnable action, String label) {
        boolean rejected = false;
        try { action.run(); } catch (com.cloudflow.common.core.exception.ServiceException | IllegalArgumentException expected) { rejected = true; }
        equal(true, rejected, label);
    }
    private HrFinalSettlement row() { return mapper(HrFinalSettlementMapper.class).selectById(SETTLEMENT); }
    private int round() { return row().getCalculationSnapshot().path("workflow").path("revision").intValue(); }
    private com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO workflowVersion() { com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO input = new com.cloudflow.hr.domain.dto.HrHRequests.VersionDTO(); input.setVersion(row().getVersion()); return input; }
    private com.cloudflow.hr.domain.dto.HrHRequests.ReasonVersionDTO withdrawal() { com.cloudflow.hr.domain.dto.HrHRequests.ReasonVersionDTO input = new com.cloudflow.hr.domain.dto.HrHRequests.ReasonVersionDTO(); input.setVersion(row().getVersion()); input.setReason("核定更正后重提"); return input; }
    private HrSettlementWorkflowService.Command workflowCommand() { return new HrSettlementWorkflowService.Command(100000L, SETTLEMENT, round()); }
    private com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO decision(String instance, String result, Long actor) { com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO dto = new com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO(); dto.setTenantId(100000L); dto.setBusinessType("HR_SETTLEMENT"); dto.setBusinessId(SETTLEMENT); dto.setBusinessNo("RESERVATION_TEST"); dto.setProcessInstanceId(instance); dto.setApprovalResult(result); dto.setApproverId(actor); return dto; }
    private void history(String instance, String action, Long actor) { jdbc.update("INSERT INTO wf_task_history(history_id,tenant_id,task_id,instance_id,node_key,operator_id,action,task_type,create_time) VALUES(?,100000,?,?,'finance',?,?,'OR_SIGN',NOW())", "history-" + instance, "task-" + instance, instance, actor, action); }

    private void freeze() { service.locked(SETTLEMENT,record -> {service.freezeLocked(record);record.setApprovalStatus("SUBMITTED");save(record);return null;}); }
    private void release() { service.locked(SETTLEMENT,record -> {service.releaseLocked(record);record.setApprovalStatus("REJECTED");save(record);return null;}); }
    private void save(HrFinalSettlement record) { if(mapper(HrFinalSettlementMapper.class).updateById(record)!=1) throw new AssertionError("parent persistence failed"); }
    private void unreserved() { equal(null,jdbc.queryForObject("SELECT reserved_settlement_id FROM hr_salary_slip WHERE id=994030",Long.class),"salary not occupied"); equal(null,jdbc.queryForObject("SELECT settlement_id FROM hr_training_recovery WHERE recovery_id=994070",Long.class),"training not occupied");equal(new BigDecimal("100.00"),amount("reserved_amount"),"only original payroll reservation remains"); }
    private BigDecimal amount(String column) { if("reserved_amount".equals(column)) return jdbc.queryForObject("SELECT reserved_amount FROM hr_employee_advance WHERE advance_id=994010",BigDecimal.class);if("outstanding_amount".equals(column)) return jdbc.queryForObject("SELECT outstanding_amount FROM hr_employee_advance WHERE advance_id=994010",BigDecimal.class);throw new IllegalArgumentException(); }
    private int count(String sql) { return jdbc.queryForObject(sql,Integer.class); }
    private <T> T mapper(Class<T> type) { return sessions.getMapper(type); }
    private static <T> T construct(Class<T> type,Map<Class<?>,Object> components) throws Exception { Constructor<?> constructor=type.getConstructors()[0];Class<?>[] types=constructor.getParameterTypes();Object[] arguments=new Object[types.length];for(int index=0;index<types.length;index++)arguments[index]=components.get(types[index]);return type.cast(constructor.newInstance(arguments)); }
    private static void actor() {UserContext.setTenantId(100000L);TenantContext.setTenantId(100000L);UserContext.setUserId(994099L);UserContext.setUserName("reservation-check");}
    private static void reject(Runnable action,String label) {boolean rejected=false;try{action.run();}catch(HrHException|com.cloudflow.hr.exception.HrBusinessException expected){rejected=true;}equal(true,rejected,label);}
    private static void equal(Object expected,Object actual,String label) {if(!Objects.equals(expected,actual))throw new AssertionError(label+"; values withheld to avoid dumping financial snapshots");CHECKS.incrementAndGet();}
}
