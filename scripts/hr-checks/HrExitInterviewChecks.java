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
import com.cloudflow.hr.domain.dto.HrExitInterviewRequests;
import com.cloudflow.hr.domain.dto.HrTrainingRecoveryRequests;
import com.cloudflow.hr.domain.vo.settlement.HrExitInterviewView;
import com.cloudflow.hr.domain.vo.settlement.HrTrainingRecoveryView;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrExitInterviewMapper;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrTrainingRecoveryMapper;
import com.cloudflow.hr.service.HrExitInterviewService;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrTrainingRecoveryService;
import com.cloudflow.hr.service.HrSettlementTrainingSource;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.multipart.MultipartFile;

public final class HrExitInterviewChecks {
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private static final ThreadLocal<Boolean> PERMITTED = ThreadLocal.withInitial(() -> true);
    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule());
    private static final long EMPLOYEE = 991201L;
    private static final long SUBJECT = 991301L;
    private static final long HR_USER = 991302L;
    private static final long APPLICATION = 991401L;

    public static void main(String[] arguments) throws Exception {
        boolean trainingSource = arguments.length == 3 && "--training-source".equals(arguments[2]);
        boolean trainingRecovery = trainingSource || arguments.length == 3 && "--training-recovery".equals(arguments[2]);
        if (arguments.length != 2 && !trainingRecovery || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        Path run = Path.of(arguments[1]).toRealPath().getParent();
        Path storageRoot = run.resolve("exit-interview-files-" + UUID.randomUUID().toString().replace("-", "")).toAbsolutePath().normalize();
        if (!storageRoot.startsWith(run) || !run.getFileName().toString().matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Owned data directory required");
        Files.createDirectory(storageRoot);
        try (HikariDataSource source = new HikariDataSource(); ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(4);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database directory");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setBanner(false);
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapper : List.of(HrExitInterviewMapper.class, HrLifecycleApplicationMapper.class, HrFinalSettlementMapper.class, HrFinalSettlementItemMapper.class,
                    HrEmployeeAdvanceMapper.class, HrEmployeeMapper.class, HrHMapper.class, HrFileStorageMapper.class,
                    HrAuditLogMapper.class, HrPositionMapper.class, HrSalarySlipMapper.class, HrTrainingRecoveryMapper.class, TenantQuotaMapper.class)) configuration.addMapper(mapper);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            List<FileSystemResource> resources = new ArrayList<>();
            for (String mapper : List.of("HrExitInterview", "HrFinalSettlement", "HrEmployeeAdvance", "HrH", "HrFileStorage", "HrAuditLog", "HrTrainingRecovery")) {
                resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + mapper + "Mapper.xml"));
            }
            resources.add(new FileSystemResource("cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/TenantQuotaMapper.xml"));
            factory.setMapperLocations(resources.toArray(FileSystemResource[]::new));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            HrRuleSupport support = new HrRuleSupport(new DataSourceTransactionManager(source), null, sessions.getMapper(HrEmployeeMapper.class),
                    sessions.getMapper(HrAuditLogMapper.class), JSON, sessions.getMapper(HrPositionMapper.class));
            HrHSupport access = new HrHSupport(support, sessions.getMapper(HrHMapper.class), sessions.getMapper(HrEmployeeMapper.class),
                    null, null, null, null, null, null, JSON, validators.getValidator()) {
                @Override public boolean permitted(String permission) { return PERMITTED.get() && ("hr:exit-interview:manage".equals(permission) || "hr:training-recovery:manage".equals(permission) || "hr:settlement:calculate".equals(permission)); }
            };
            HrFileStorage storage = new HrFileStorage(sessions.getMapper(HrFileStorageMapper.class), new TenantQuotaService(sessions.getMapper(TenantQuotaMapper.class)));
            Field directory = HrFileStorage.class.getDeclaredField("baseDir"); directory.setAccessible(true); directory.set(storage, storageRoot.toString());
            HrExitInterviewService service = new HrExitInterviewService(sessions.getMapper(HrExitInterviewMapper.class), sessions.getMapper(HrLifecycleApplicationMapper.class),
                    sessions.getMapper(HrFinalSettlementMapper.class), sessions.getMapper(HrEmployeeAdvanceMapper.class), sessions.getMapper(HrHMapper.class), access, support, storage, JSON);
            fixtures(jdbc); actor(HR_USER, 100000L, 0, true);
            if (trainingRecovery) {
                trainingBusiness(new HrTrainingRecoveryService(sessions.getMapper(HrTrainingRecoveryMapper.class), sessions.getMapper(HrEmployeeAdvanceMapper.class), access, support, storage), storage, jdbc, storageRoot);
                System.out.println("H2_TRAINING_RECOVERY_DATABASE: checks=" + CHECKS.get() + "; failed=0; mysql=true; actual_service=true; actual_file_storage=true; actual_quota=true; permission_fixture=true; http=false; concurrency_groups=2");
                if (trainingSource) {
                    int previous = CHECKS.get();
                    trainingSources(new HrSettlementTrainingSource(sessions.getMapper(HrTrainingRecoveryMapper.class), sessions.getMapper(HrFinalSettlementMapper.class),
                            sessions.getMapper(HrFinalSettlementItemMapper.class), storage, access, JSON), jdbc);
                    System.out.println("H2_SETTLEMENT_TRAINING_SOURCE_DATABASE: checks=" + (CHECKS.get() - previous) + "; failed=0; mysql=true; actual_mappers=true; actual_assessment_service=true; actual_file_storage=true; actual_data_scope=true; permission_fixture=true; historical_settlement_posting_fixture=true; source_read_only=true; settlement_posting=false; http=false");
                }
            } else {
                business(service, storage, jdbc, storageRoot);
                concurrency(service);
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_EXIT_INTERVIEW' AND after_data LIKE '%internal-private-opinion%'", Integer.class), "private comments omitted from audit payload");
                System.out.println("H2_EXIT_INTERVIEW_DATABASE: checks=" + CHECKS.get() + "; failed=0; mysql=true; actual_service=true; actual_file_storage=true; actual_quota=true; permission_fixture=true; http=false; concurrency_groups=1");
            }
        } finally {
            UserContext.clear(); TenantContext.clear(); PERMITTED.remove();
            try (Stream<Path> paths = Files.walk(storageRoot)) {
                for (Path target : paths.sorted(Comparator.reverseOrder()).toList()) {
                    if (!target.toAbsolutePath().normalize().startsWith(storageRoot)) throw new IllegalStateException("File cleanup outside owned directory");
                    Files.delete(target);
                }
            }
        }
    }

    private static void fixtures(JdbcTemplate jdbc) {
        jdbc.update("INSERT INTO sys_dept (dept_id,tenant_id,parent_id,ancestors,dept_name,deleted) VALUES (991101,100000,0,'0','面谈核验部门',0)");
        jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,password,status,deleted) VALUES "
                + "(991301,100000,991101,'exit_subject','面谈对象','unused','0',0),(991302,100000,991101,'exit_hr','面谈人','unused','0',0),"
                + "(991303,100001,991101,'exit_foreign','外租户','unused','0',0)");
        jdbc.update("INSERT INTO sys_user_role (user_id,role_id) VALUES (991302,1)");
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,dept_id,user_id) VALUES "
                + "(991201,100000,'exit-subject','已离职员工','UNKNOWN','RESIGNED',991101,991301),"
                + "(991202,100000,'exit-hr','面谈人','UNKNOWN','ACTIVE',991101,991302)");
        jdbc.update("INSERT INTO hr_lifecycle_application (id,tenant_id,application_no,type,employee_id,status) VALUES "
                + "(991401,100000,'exit-interview-source','RESIGNATION',991201,'APPROVED'),"
                + "(991402,100000,'exit-interview-own','RESIGNATION',991202,'APPROVED'),"
                + "(991403,100000,'exit-interview-wrong','TRANSFER',991201,'APPROVED')");
    }

    private static HrExitInterviewRequests.Draft draft() {
        HrExitInterviewRequests.Draft input = new HrExitInterviewRequests.Draft();
        input.setLifecycleApplicationId(APPLICATION); input.setInterviewerId(HR_USER);
        input.setInterviewTime(LocalDateTime.of(2026, 1, 1, 10, 0)); input.setLocation("内部面谈室");
        input.setLeavingReason("核验记录"); input.setEmployeeFeedback("员工反馈"); input.setManagerComment("internal-private-opinion");
        input.setImprovementItems(List.of("改进交接安排")); return input;
    }

    private static void business(HrExitInterviewService service, HrFileStorage storage, JdbcTemplate jdbc, Path directory) throws Exception {
        Long interviewId = service.create(draft());
        HrExitInterviewView created = service.detail(interviewId);
        equal(EMPLOYEE, created.employeeId(), "employee derived from real resignation");
        equal("DRAFT", created.status(), "draft saved"); equal(0, created.version(), "initial version");
        equal("internal-private-opinion", created.managerComment(), "internal opinion retained");
        equal("已离职员工", created.employeeName(), "employee display uses actual employee name");
        equal("面谈人", created.interviewerName(), "interviewer display uses actual account name");
        HrExitInterviewRequests.Query sources = new HrExitInterviewRequests.Query(); sources.setKeyword("已离职员工");
        equal(List.of(APPLICATION), service.applications(sources).getRows().stream().map(HrExitInterviewView.Option::value).toList(), "source lookup searches scoped employee name");
        sources.setKeyword(null); sources.setLifecycleApplicationId(APPLICATION);
        List<Long> availableInterviewers = service.interviewers(sources).getRows().stream().map(HrExitInterviewView.Option::value).toList();
        equal(true, availableInterviewers.contains(HR_USER) && !availableInterviewers.contains(SUBJECT) && !availableInterviewers.contains(991303L), "interviewers include eligible HR and exclude subject and foreign user");
        HrExitInterviewRequests.Query query = new HrExitInterviewRequests.Query(); query.setEmployeeId(EMPLOYEE);
        equal(List.of(interviewId), service.list(query).getRows().stream().map(HrExitInterviewView::interviewId).toList(), "scoped listing returns interview");
        HrExitInterviewRequests.Draft invalid = draft(); invalid.setLifecycleApplicationId(991403L);
        reject(() -> service.create(invalid), "non-resignation rejected");
        HrExitInterviewRequests.Draft self = draft(); self.setLifecycleApplicationId(991402L);
        reject(() -> service.create(self), "HR cannot record own private review");
        HrExitInterviewRequests.Draft badActor = draft(); badActor.setInterviewerId(SUBJECT);
        reject(() -> service.create(badActor), "subject cannot interview self");
        badActor.setInterviewerId(991303L); reject(() -> service.create(badActor), "foreign interviewer rejected");
        HrExitInterviewRequests.Draft badFile = draft(); badFile.setAttachmentFileIds(List.of(1L));
        reject(() -> service.create(badFile), "creation cannot claim existing file");
        HrExitInterviewRequests.Draft update = draft(); update.setVersion(0); update.setLocation(null); update.setManagerComment(null);
        service.update(interviewId, update);
        equal(null, service.detail(interviewId).location(), "clearing nullable field persists");
        equal(null, service.detail(interviewId).managerComment(), "clearing private comment persists");
        reject(() -> service.update(interviewId, update), "stale update rejected");
        equal(1, service.detail(interviewId).version(), "stale version does not write");
        update.setVersion(1); update.setLifecycleApplicationId(991402L); reject(() -> service.update(interviewId, update), "cannot change resignation source");
        update.setLifecycleApplicationId(APPLICATION); update.setSettlementId(991999L); reject(() -> service.update(interviewId, update), "nonexistent settlement rejected");
        actor(SUBJECT, 100000L, 0, true);
        reject(() -> service.interviewers(sources), "subject cannot enumerate internal interviewers for self");
        reject(() -> service.detail(interviewId), "subject cannot read internal opinion with granted permission");
        equal(0L, service.list(query).getTotal(), "subject excluded from list even with broad scope");
        actor(HR_USER, 100000L, 0, false); reject(() -> service.detail(interviewId), "missing permission rejected");
        actor(HR_USER, 100000L, 3, true); UserContext.setDeptId(991199L); reject(() -> service.detail(interviewId), "outside department rejected");
        actor(991303L, 100001L, 0, true); reject(() -> service.detail(interviewId), "cross tenant rejected");
        actor(HR_USER, 100000L, 0, true);
        MultipartFile file = new MemoryFile("notes.pdf", "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n".getBytes(StandardCharsets.UTF_8));
        HrExitInterviewView.Attachment upload = service.upload(interviewId, 1, file);
        equal(2, upload.version(), "upload advances version"); equal(List.of(upload.fileId()), service.detail(interviewId).attachmentFileIds(), "upload attached to record");
        equal("", jdbc.queryForObject("SELECT url FROM sys_file WHERE file_id=?", String.class, upload.fileId()), "no public file URL");
        equal("HR_EXIT_INTERVIEW", jdbc.queryForObject("SELECT biz_type FROM sys_file WHERE file_id=?", String.class, upload.fileId()), "private business binding");
        equal(interviewId, jdbc.queryForObject("SELECT biz_id FROM sys_file WHERE file_id=?", Long.class, upload.fileId()), "file bound to exact interview");
        equal(file.getSize(), (long) Objects.requireNonNull(service.download(interviewId, upload.fileId()).getBody()).length, "actual stored file downloaded");
        reject(() -> storage.load(upload.fileId()), "generic HR download rejects private type");
        actor(SUBJECT, 100000L, 0, true); reject(() -> service.download(interviewId, upload.fileId()), "subject denied attachment");
        actor(HR_USER, 100000L, 0, true);
        Long secondId = service.create(draft());
        reject(() -> service.download(secondId, upload.fileId()), "attachment cannot be read from other interview");
        HrExitInterviewRequests.Draft steal = draft(); steal.setVersion(0); steal.setAttachmentFileIds(List.of(upload.fileId()));
        reject(() -> service.update(secondId, steal), "attachment cannot be moved to another interview");
        String storedPath = jdbc.queryForObject("SELECT file_path FROM sys_file WHERE file_id=?", String.class, upload.fileId());
        byte[] original = Files.readAllBytes(Path.of(storedPath)); Files.write(Path.of(storedPath), new byte[]{1, 2, 3});
        reject(() -> service.download(interviewId, upload.fileId()), "changed file content rejected"); Files.write(Path.of(storedPath), original);
        long fileCount = countFiles(directory);
        jdbc.execute("CREATE TRIGGER reject_exit_binding BEFORE INSERT ON sys_file FOR EACH ROW SET NEW.biz_type='wrong-fixture'");
        try { reject(() -> service.upload(secondId, 0, file), "failed binding rolls back file and interview"); }
        finally { jdbc.execute("DROP TRIGGER reject_exit_binding"); }
        equal(fileCount, countFiles(directory), "rolled back physical file removed"); equal(0, service.detail(secondId).version(), "failed upload keeps original version");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_file WHERE biz_type='wrong-fixture'", Integer.class), "failed upload leaves no file row");
        HrExitInterviewRequests.Draft remove = draft(); remove.setVersion(2); remove.setAttachmentFileIds(List.of()); service.update(interviewId, remove);
        reject(() -> service.download(interviewId, upload.fileId()), "removed attachment inaccessible");
        HrExitInterviewRequests.Draft future = draft(); future.setVersion(3); future.setStatus("CONFIRMED"); future.setInterviewTime(HrHSupport.now().plusDays(1));
        reject(() -> service.update(interviewId, future), "future interview cannot be confirmed");
        HrExitInterviewRequests.Draft confirm = draft(); confirm.setVersion(3); confirm.setStatus("CONFIRMED"); service.update(interviewId, confirm);
        equal("CONFIRMED", service.detail(interviewId).status(), "confirmed result retained");
        HrExitInterviewRequests.Draft edit = draft(); edit.setVersion(4); reject(() -> service.update(interviewId, edit), "confirmed comments immutable");
        reject(() -> service.upload(interviewId, 4, file), "confirmed attachments immutable");
        equal(4, service.detail(interviewId).version(), "confirmed record unchanged after rejected mutations");
        try { JSON.readValue("{\"tenantId\":100001}", HrExitInterviewRequests.Draft.class); throw new AssertionError("unknown input accepted"); }
        catch (com.fasterxml.jackson.core.JsonProcessingException expected) { CHECKS.incrementAndGet(); }
    }

    private static void concurrency(HrExitInterviewService service) throws Exception {
        Long identifier = service.create(draft());
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<Boolean> action = () -> {
                actor(HR_USER, 100000L, 0, true); ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("race timed out");
                HrExitInterviewRequests.Draft input = draft(); input.setVersion(0);
                try { service.update(identifier, input); return true; }
                catch (com.cloudflow.hr.service.HrHException failure) { if (!"VERSION_CONFLICT".equals(failure.getCode())) throw failure; return false; }
                finally { UserContext.clear(); TenantContext.clear(); PERMITTED.remove(); }
            };
            List<Future<Boolean>> futures = List.of(workers.submit(action), workers.submit(action));
            equal(true, ready.await(10, TimeUnit.SECONDS), "both concurrent writers ready"); start.countDown();
            int successes = 0; for (Future<Boolean> future : futures) if (future.get(30, TimeUnit.SECONDS)) successes++;
            equal(1, successes, "only one same-version update succeeds"); equal(1, service.detail(identifier).version(), "one committed version after race");
        } finally { workers.shutdownNow(); equal(true, workers.awaitTermination(10, TimeUnit.SECONDS), "race workers stopped"); }
    }

    private static HrTrainingRecoveryRequests.Draft trainingDraft(Long fileId) {
        HrTrainingRecoveryRequests.Draft input = new HrTrainingRecoveryRequests.Draft();
        input.setEnrollmentId(991503L); input.setAgreementFileId(fileId); input.setAssessedAmount(new BigDecimal("123.45"));
        input.setAssessmentReason("agreement-assessment-private"); return input;
    }

    private static HrTrainingRecoveryRequests.Update trainingUpdate(int version, String amount) {
        HrTrainingRecoveryRequests.Update input = new HrTrainingRecoveryRequests.Update(); input.setVersion(version);
        input.setAssessedAmount(new BigDecimal(amount)); input.setAssessmentReason("核对协议及已履行服务期后确定"); return input;
    }

    private static void trainingBusiness(HrTrainingRecoveryService service, HrFileStorage storage, JdbcTemplate jdbc, Path directory) throws Exception {
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,dept_id) VALUES (991203,100000,'recovery-other','另一培训员工','UNKNOWN','REGULAR',991101)");
        jdbc.update("INSERT INTO hr_training_course (id,tenant_id,course_code,course_name,status) VALUES (991501,100000,'recovery-course','真实培训课程','PUBLISHED')");
        jdbc.update("INSERT INTO hr_training_session (id,tenant_id,course_id,session_no,start_time,end_time,status) VALUES (991502,100000,991501,'recovery-session','2026-01-01 09:00:00','2026-01-02 18:00:00','COMPLETED')");
        jdbc.update("INSERT INTO hr_training_enrollment (id,tenant_id,session_id,employee_id,status,completion_status) VALUES (991503,100000,991502,991201,'APPROVED','PASSED'),(991504,100000,991502,991202,'APPROVED','PASSED')");
        byte[] pdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        MemoryFile file = new MemoryFile("培训协议.pdf", pdf);
        HrTrainingRecoveryRequests.Query query = new HrTrainingRecoveryRequests.Query(); query.setKeyword("已离职员工");
        equal(List.of(991503L), service.enrollments(query).getRows().stream().map(HrTrainingRecoveryView.Enrollment::value).toList(), "training source uses actual scoped employee and enrollment");
        reject(() -> service.uploadAgreement(991504L, file), "HR cannot assess own training recovery");
        reject(() -> service.uploadAgreement(999999L, file), "missing training source rejected");
        HrTrainingRecoveryView.Agreement uploaded = service.uploadAgreement(991503L, file);
        equal(uploaded.fileId(), service.uploadAgreement(991503L, file).fileId(), "upload replay returns original staged agreement");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_file WHERE file_id=? AND file_type='HR_TRAINING_AGREEMENT' AND biz_type='HR_TRAINING_AGREEMENT' AND biz_id=991503 AND url=''", Integer.class, uploaded.fileId()), "agreement is private and staged for actual enrollment");
        reject(() -> storage.load(uploaded.fileId()), "generic HR storage cannot read private agreement");
        HrTrainingRecoveryRequests.Draft input = trainingDraft(uploaded.fileId());
        Long identifier = service.create(input);
        equal(identifier, service.create(input), "replay after lost response returns same recovery");
        reject(() -> service.uploadAgreement(991503L, new MemoryFile("另一个文件名.pdf", pdf)), "renaming same agreement cannot create duplicate recovery");
        HrTrainingRecoveryView current = service.detail(identifier);
        equal(EMPLOYEE, current.employeeId(), "employee derived from enrollment"); equal("真实培训课程", current.courseName(), "course name resolves from actual source");
        equal("123.45", current.assessedAmount().toPlainString(), "assessed amount retained exactly"); equal("0.00", current.collectedAmount().toPlainString(), "assessment does not collect funds");
        equal("DRAFT", current.status(), "draft does not imply confirmation"); equal(null, current.confirmedBy(), "draft has no confirmer");
        equal(List.of(identifier), service.list(query).getRows().stream().map(HrTrainingRecoveryView::recoveryId).toList(), "scoped recovery list");
        equal(true, java.util.Arrays.equals(pdf, service.download(identifier).getBody()), "bound agreement downloads original bytes");
        equal("no-store", service.download(identifier).getHeaders().getFirst("Cache-Control"), "agreement download cannot be cached");
        for (String amount : List.of("-0.01", "0.001", "1000000000000.00")) {
            HrTrainingRecoveryRequests.Draft invalid = trainingDraft(uploaded.fileId()); invalid.setAssessedAmount(new BigDecimal(amount));
            reject(() -> service.create(invalid), "invalid money precision or capacity rejected");
        }
        input.setAssessedAmount(new BigDecimal("100.00")); reject(() -> service.create(input), "used agreement cannot create a different assessment");
        actor(HR_USER, 100000L, 0, false); reject(() -> service.detail(identifier), "missing permission rejected");
        actor(SUBJECT, 100000L, 0, true); reject(() -> service.detail(identifier), "subject cannot read own internal assessment");
        equal(0L, service.list(query).getTotal(), "subject list excludes own assessment");
        actor(991303L, 100001L, 0, true); reject(() -> service.detail(identifier), "foreign tenant cannot access recovery");
        actor(HR_USER, 100000L, 0, true);
        HrTrainingRecoveryRequests.Update update = trainingUpdate(0, "120.00"); service.update(identifier, update);
        equal("120.00", service.detail(identifier).assessedAmount().toPlainString(), "draft amount update persisted");
        reject(() -> service.update(identifier, update), "stale update cannot overwrite assessment");
        HrTrainingRecoveryRequests.Confirm confirm = new HrTrainingRecoveryRequests.Confirm(); confirm.setVersion(1);
        jdbc.update("UPDATE hr_training_enrollment SET status='WITHDRAWN' WHERE id=991503");
        reject(() -> service.confirm(identifier, confirm), "cancelled source blocks confirmation");
        jdbc.update("UPDATE hr_training_enrollment SET status='APPROVED',employee_id=991203 WHERE id=991503");
        reject(() -> service.confirm(identifier, confirm), "changed source employee blocks confirmation");
        jdbc.update("UPDATE hr_training_enrollment SET employee_id=991201 WHERE id=991503");
        jdbc.update("UPDATE hr_training_recovery SET settlement_id=991999 WHERE recovery_id=?", identifier);
        reject(() -> service.confirm(identifier, confirm), "settlement occupancy blocks confirmation");
        reject(() -> service.update(identifier, trainingUpdate(1, "100.00")), "settlement occupancy blocks editing");
        jdbc.update("UPDATE hr_training_recovery SET settlement_id=NULL,collected_amount=1 WHERE recovery_id=?", identifier);
        reject(() -> service.update(identifier, trainingUpdate(1, "100.00")), "collected amount blocks editing");
        jdbc.update("UPDATE hr_training_recovery SET collected_amount=0 WHERE recovery_id=?", identifier);
        String filePath = jdbc.queryForObject("SELECT file_path FROM sys_file WHERE file_id=?", String.class, uploaded.fileId());
        Files.write(Path.of(filePath), new byte[]{1, 2, 3});
        reject(() -> service.confirm(identifier, confirm), "changed agreement bytes block confirmation");
        reject(() -> service.download(identifier), "changed agreement bytes block download");
        Files.write(Path.of(filePath), pdf);
        jdbc.update("UPDATE sys_file SET biz_id=991999 WHERE file_id=?", uploaded.fileId());
        reject(() -> service.confirm(identifier, confirm), "agreement binding tampering blocks confirmation");
        jdbc.update("UPDATE sys_file SET biz_id=? WHERE file_id=?", identifier, uploaded.fileId());
        equal(1, service.detail(identifier).version(), "all rejected writes leave version unchanged");
        long filesBefore = countFiles(directory);
        jdbc.execute("CREATE TRIGGER reject_training_stage BEFORE INSERT ON sys_file FOR EACH ROW SET NEW.biz_type='wrong-training-fixture'");
        MemoryFile nextFile = new MemoryFile("补充协议.pdf", (new String(pdf, StandardCharsets.US_ASCII) + "\n%supplement\n").getBytes(StandardCharsets.US_ASCII));
        try { reject(() -> service.uploadAgreement(991503L, nextFile), "failed staging rolls back agreement upload"); }
        finally { jdbc.execute("DROP TRIGGER reject_training_stage"); }
        equal(filesBefore, countFiles(directory), "failed upload removes physical file");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_file WHERE biz_type='wrong-training-fixture'", Integer.class), "failed upload leaves no file row");
        trainingRace(service, identifier, null);
        confirm.setVersion(2); service.confirm(identifier, confirm);
        current = service.detail(identifier); equal("CONFIRMED", current.status(), "explicit confirmation persisted"); equal(HR_USER, current.confirmedBy(), "confirmer is actual current user");
        equal(true, current.confirmedTime() != null, "confirmation timestamp recorded"); equal("0.00", current.collectedAmount().toPlainString(), "confirmation does not claim receipt");
        equal(null, current.settlementId(), "confirmation does not reserve a settlement");
        reject(() -> service.update(identifier, trainingUpdate(3, "1.00")), "confirmed assessment cannot be changed");
        confirm.setVersion(3); reject(() -> service.confirm(identifier, confirm), "confirmed assessment cannot be confirmed again");
        HrTrainingRecoveryView.Agreement staged = service.uploadAgreement(991503L, nextFile);
        String uploader = jdbc.queryForObject("SELECT create_by FROM sys_file WHERE file_id=?", String.class, staged.fileId());
        jdbc.update("UPDATE sys_file SET create_by='another-operator' WHERE file_id=?", staged.fileId());
        reject(() -> service.create(trainingDraft(staged.fileId())), "another uploader cannot claim staged agreement");
        jdbc.update("UPDATE sys_file SET create_by=? WHERE file_id=?", uploader, staged.fileId());
        trainingRace(service, null, staged.fileId());
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_training_recovery WHERE agreement_file_id=?", Integer.class, staged.fileId()), "concurrent same agreement creates one record");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_TRAINING_RECOVERY' AND after_data LIKE '%agreement-assessment-private%'", Integer.class), "audit omits assessment reason body");
        for (String forbiddenInput : List.of("{\"status\":\"CONFIRMED\"}", "{\"collectedAmount\":\"100.00\"}", "{\"tenantId\":100001}", "{\"employeeId\":991202}")) {
            try { JSON.readValue(forbiddenInput, HrTrainingRecoveryRequests.Draft.class); throw new AssertionError("unknown training input accepted"); }
            catch (com.fasterxml.jackson.core.JsonProcessingException expected) { CHECKS.incrementAndGet(); }
        }
    }

    private static void trainingSources(HrSettlementTrainingSource source, JdbcTemplate jdbc) throws Exception {
        Long recoveryId = jdbc.queryForObject("SELECT recovery_id FROM hr_training_recovery WHERE employee_id=991201 AND status='CONFIRMED'", Long.class);
        Long fileId = jdbc.queryForObject("SELECT agreement_file_id FROM hr_training_recovery WHERE recovery_id=?", Long.class, recoveryId);
        equal(1, source.inspect(EMPLOYEE, null).recoveries().size(), "actual confirmed assessment imported");
        trainingIssue(source, "SETTLEMENT_TRAINING_UNCONFIRMED", "draft assessment remains visible as missing decision");
        jdbc.update("UPDATE hr_training_recovery SET status='VOID' WHERE employee_id=991201 AND status='DRAFT'");
        equal(0, source.inspect(EMPLOYEE, null).issues().size(), "void unused assessment excluded");
        equal("110.00", source.inspect(EMPLOYEE, null).recoveries().get(0).amount(), "real race-winning assessed amount used");
        equal("0.00", source.inspect(EMPLOYEE, null).recoveries().get(0).evidence().path("collectedAmount").asText(), "confirmation never implies receipt");
        equal(fileId.toString(), source.inspect(EMPLOYEE, null).recoveries().get(0).evidence().path("agreementFileId").asText(), "real private agreement identified");
        List<java.util.Map<String, Object>> before = jdbc.queryForList("SELECT * FROM hr_training_recovery ORDER BY recovery_id");
        int audits = jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log", Integer.class);
        source.inspect(EMPLOYEE, null); source.inspect(EMPLOYEE, null);
        equal(before, jdbc.queryForList("SELECT * FROM hr_training_recovery ORDER BY recovery_id"), "refresh does not collect or reserve");
        equal(audits, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log", Integer.class), "source reads do not create write audit");
        jdbc.update("UPDATE hr_training_recovery SET settlement_id=991710 WHERE recovery_id=?", recoveryId);
        trainingIssue(source, "SETTLEMENT_TRAINING_RESERVED", "other settlement occupancy rejected");
        equal(0, source.inspect(EMPLOYEE, 991710L).issues().size(), "own reservation can refresh");
        jdbc.update("UPDATE hr_training_recovery SET settlement_id=NULL,collected_amount=10 WHERE recovery_id=?", recoveryId);
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_MISMATCH", "unbacked collected summary rejected");
        jdbc.update("UPDATE hr_training_recovery SET collected_amount=0 WHERE recovery_id=?", recoveryId);
        jdbc.update("UPDATE hr_training_enrollment SET status='WITHDRAWN' WHERE id=991503");
        trainingIssue(source, "SETTLEMENT_TRAINING_SOURCE_INVALID", "withdrawn enrollment blocked");
        jdbc.update("UPDATE hr_training_enrollment SET status='APPROVED',employee_id=991203 WHERE id=991503");
        trainingIssue(source, "SETTLEMENT_TRAINING_SOURCE_INVALID", "changed source employee blocked");
        jdbc.update("UPDATE hr_training_enrollment SET employee_id=991201 WHERE id=991503");
        jdbc.update("UPDATE sys_file SET biz_id=991999 WHERE file_id=?", fileId);
        trainingIssue(source, "SETTLEMENT_TRAINING_AGREEMENT_INVALID", "wrong agreement binding blocked");
        jdbc.update("UPDATE sys_file SET biz_id=? WHERE file_id=?", recoveryId, fileId);
        Path filePath = Path.of(jdbc.queryForObject("SELECT file_path FROM sys_file WHERE file_id=?", String.class, fileId));
        byte[] original = Files.readAllBytes(filePath); byte[] altered = original.clone(); altered[0] = 0;
        try { Files.write(filePath, altered); trainingIssue(source, "SETTLEMENT_TRAINING_AGREEMENT_CHANGED", "same-length content tampering detected by actual digest"); }
        finally { Files.write(filePath, original); }
        jdbc.update("UPDATE sys_file SET deleted=1 WHERE file_id=?", fileId);
        trainingIssue(source, "SETTLEMENT_TRAINING_AGREEMENT_INVALID", "deleted private file blocked");
        jdbc.update("UPDATE sys_file SET deleted=0 WHERE file_id=?", fileId);
        jdbc.update("UPDATE hr_training_recovery SET status='CLEARED' WHERE recovery_id=?", recoveryId);
        trainingIssue(source, "SETTLEMENT_TRAINING_BALANCE_INVALID", "cleared state cannot erase debt");
        jdbc.update("UPDATE hr_training_recovery SET status='CONFIRMED' WHERE recovery_id=?", recoveryId);
        actor(HR_USER, 100000L, 0, false); reject(() -> source.inspect(EMPLOYEE, null), "source requires settlement permission");
        actor(HR_USER, 100000L, 4, true); reject(() -> source.inspect(EMPLOYEE, null), "actual employee scope prevents another employee source");
        actor(991303L, 100001L, 0, true); reject(() -> source.inspect(EMPLOYEE, null), "actual tenant boundary prevents source lookup");
        actor(HR_USER, 100000L, 0, true);
        jdbc.update("INSERT INTO hr_final_settlement(settlement_id,tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,total_receivable,net_amount,status,approval_status,confirmed_by,confirmed_time,paid_time) VALUES (991710,100000,'training-source-normal',991201,991720,'2026-01-01','2026-09-30',10,-10,'PAID','APPROVED',991302,NOW(),NOW())");
        jdbc.update("INSERT INTO hr_final_settlement_item(item_id,tenant_id,settlement_id,item_type,item_name,source_biz_type,source_biz_id,amount,confirmed_flag,source_posted_flag) VALUES(991711,100000,991710,'RECEIVABLE','培训追偿','HR_TRAINING_RECOVERY',?,10,1,1)", recoveryId.toString());
        jdbc.update("UPDATE hr_training_recovery SET collected_amount=10 WHERE recovery_id=?", recoveryId);
        equal("100.00", source.inspect(EMPLOYEE, null).recoveries().get(0).amount(), "posted collection alone reduces amount due");
        equal(1, source.inspect(EMPLOYEE, null).recoveries().get(0).evidence().path("collectionPostings").size(), "actual item evidence retained");
        jdbc.update("UPDATE hr_final_settlement SET status='CONFIRMED' WHERE settlement_id=991710");
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_INVALID", "approved yet unpaid settlement is not collection");
        jdbc.update("UPDATE hr_final_settlement SET status='PAID',employee_id=991203 WHERE settlement_id=991710");
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_INVALID", "other employee settlement cannot prove receipt");
        jdbc.update("UPDATE hr_final_settlement SET employee_id=991201 WHERE settlement_id=991710");
        jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=0 WHERE item_id=991711");
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_MISMATCH", "paid parent without posted source is insufficient");
        jdbc.update("UPDATE hr_final_settlement_item SET source_posted_flag=1 WHERE item_id=991711");
        jdbc.update("UPDATE hr_final_settlement SET superseded_flag=1 WHERE settlement_id=991710");
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_INVALID", "superseded marker requires posted reversal");
        jdbc.update("UPDATE hr_final_settlement SET superseded_flag=0 WHERE settlement_id=991710");
        jdbc.update("INSERT INTO hr_final_settlement(settlement_id,tenant_id,settlement_no,employee_id,lifecycle_application_id,settlement_kind,reversal_of_id,join_date,relieving_date,total_receivable,net_amount,status,approval_status,confirmed_by,confirmed_time,paid_time) VALUES (991712,100000,'training-source-reversal',991201,991720,'REVERSAL',991710,'2026-01-01','2026-09-30',-10,10,'PAID','APPROVED',991302,NOW(),NOW())");
        jdbc.update("INSERT INTO hr_final_settlement_item(item_id,tenant_id,settlement_id,item_type,item_name,source_biz_type,source_biz_id,amount,confirmed_flag,source_posted_flag) VALUES(991713,100000,991712,'RECEIVABLE','退回培训追偿','HR_TRAINING_RECOVERY',?,-10,1,1)", recoveryId.toString());
        jdbc.update("UPDATE hr_training_recovery SET collected_amount=0 WHERE recovery_id=?", recoveryId);
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_INVALID", "reversal requires original fully reversed marker");
        jdbc.update("UPDATE hr_final_settlement SET superseded_flag=1 WHERE settlement_id=991710");
        equal("110.00", source.inspect(EMPLOYEE, null).recoveries().get(0).amount(), "actual matched reversal restores receivable");
        equal(2, source.inspect(EMPLOYEE, null).recoveries().get(0).evidence().path("collectionPostings").size(), "original and reversal both retained");
        jdbc.update("UPDATE hr_final_settlement_item SET amount=-9 WHERE item_id=991713");
        trainingIssue(source, "SETTLEMENT_TRAINING_COLLECTION_INVALID", "reversal must negate original posted amount exactly");
        jdbc.update("UPDATE hr_final_settlement_item SET amount=-10 WHERE item_id=991713");
        jdbc.update("UPDATE hr_training_recovery SET assessed_amount=0 WHERE recovery_id=?", recoveryId);
        equal("0.00", source.inspect(EMPLOYEE, null).recoveries().get(0).amount(), "zero assessed source remains traceable");
        jdbc.update("UPDATE hr_training_recovery SET assessed_amount=999999999999.99 WHERE recovery_id=?", recoveryId);
        equal("999999999999.99", source.inspect(EMPLOYEE, null).recoveries().get(0).amount(), "maximum assessed amount remains exact");
        jdbc.update("UPDATE hr_training_recovery SET assessed_amount=110 WHERE recovery_id=?", recoveryId);
        equal(0, source.inspect(EMPLOYEE, null).issues().size(), "valid training source restored");
    }

    private static void trainingIssue(HrSettlementTrainingSource source, String code, String label) {
        List<String> issues = source.inspect(EMPLOYEE, null).issues().stream().map(HrSettlementTrainingSource.Issue::code).toList();
        equal(true, issues.contains(code), label + " codes=" + issues);
    }

    private static void trainingRace(HrTrainingRecoveryService service, Long identifier, Long fileId) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<Long> action = () -> {
                actor(HR_USER, 100000L, 0, true); ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("training race timed out");
                try {
                    if (fileId != null) return service.create(trainingDraft(fileId));
                    service.update(identifier, trainingUpdate(1, "110.00")); return identifier;
                } catch (com.cloudflow.hr.service.HrHException failure) {
                    if (fileId != null || !"VERSION_CONFLICT".equals(failure.getCode())) throw failure;
                    return null;
                } finally { UserContext.clear(); TenantContext.clear(); PERMITTED.remove(); }
            };
            List<Future<Long>> futures = List.of(workers.submit(action), workers.submit(action));
            equal(true, ready.await(10, TimeUnit.SECONDS), "training concurrent writers ready"); start.countDown();
            Long first = futures.get(0).get(30, TimeUnit.SECONDS); Long second = futures.get(1).get(30, TimeUnit.SECONDS);
            if (fileId != null) equal(first, second, "parallel replay returns same recovery identifier");
            else { equal(true, first == null ^ second == null, "only one same-version training update commits"); equal(2, service.detail(identifier).version(), "training race adds one version"); }
        } finally { workers.shutdownNow(); equal(true, workers.awaitTermination(10, TimeUnit.SECONDS), "training workers stopped"); }
    }

    private static long countFiles(Path directory) throws Exception { try (Stream<Path> paths = Files.walk(directory)) { return paths.filter(Files::isRegularFile).count(); } }
    private static void actor(Long userId, Long tenantId, int scope, boolean permission) {
        TenantContext.setTenantId(tenantId); UserContext.setTenantId(tenantId); UserContext.setUserId(userId); UserContext.setUserName("exit-interview-check");
        UserContext.setDeptId(991101L); UserContext.setDsType(scope); PERMITTED.set(permission);
    }
    private static void equal(Object expected, Object actual, String message) { if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual); CHECKS.incrementAndGet(); }
    private static void reject(Runnable action, String message) {
        try { action.run(); } catch (com.cloudflow.hr.service.HrHException | com.cloudflow.hr.exception.HrBusinessException failure) { CHECKS.incrementAndGet(); return; }
        throw new AssertionError(message);
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
