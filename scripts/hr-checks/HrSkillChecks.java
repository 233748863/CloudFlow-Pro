package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrSkillRequests;
import com.cloudflow.hr.domain.dto.HrTrainingCoursePayload;
import com.cloudflow.hr.domain.dto.training.HrExamAnswerDTO;
import com.cloudflow.hr.domain.entity.HrEmployeeSkill;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.vo.skill.HrSkillViews;
import com.cloudflow.hr.event.HrSkillEvidenceChangedEvent;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrDirectoryMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrEmployeeSkillMapper;
import com.cloudflow.hr.mapper.HrExamAttemptMapper;
import com.cloudflow.hr.mapper.HrExamPaperMapper;
import com.cloudflow.hr.mapper.HrExamQuestionBankMapper;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.cloudflow.hr.mapper.HrPositionSkillMapper;
import com.cloudflow.hr.mapper.HrSkillMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateTemplateMapper;
import com.cloudflow.hr.mapper.HrTrainingArchiveMapper;
import com.cloudflow.hr.mapper.HrTrainingCourseMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.service.impl.HrExamServiceImpl;
import com.cloudflow.hr.service.impl.HrIntegrationQueryServiceImpl;
import com.cloudflow.hr.service.impl.HrTrainingArchiveServiceImpl;
import com.cloudflow.hr.service.impl.HrTrainingCertificateServiceImpl;
import com.cloudflow.hr.service.impl.HrTrainingEnrollmentServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

public final class HrSkillChecks {
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private static final ThreadLocal<Set<String>> PERMISSIONS = new ThreadLocal<>();
    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final Map<String, String> LEVELS = Map.of("1", "一级", "2", "二级", "3", "三级", "4", "四级", "5", "五级");
    private static final long EMPLOYEE = 9200101L;
    private static final long REVIEWER = 9200102L;
    private static final long OTHER = 9200103L;
    private static final long POSITION = 9200101L;

    public static void main(String[] arguments) throws Exception {
        rules();
        if (arguments.length > 0) {
            require(arguments.length == 3, "Expected JDBC URL, owned directory and HR module");
            try (Harness harness = new Harness(arguments)) { harness.run(); }
        }
        System.out.println("H2_SKILL_CHECKS: checks=" + CHECKS.get() + "; failed=0; mysql=" + (arguments.length > 0)
                + "; http=false; authenticated_identity_doubles=true; production_modified=false");
    }

    private static void rules() {
        HrSkillRules.definition(definition("DRAFT", Map.of()));
        CHECKS.incrementAndGet();
        HrSkillRules.definition(definition("ACTIVE", LEVELS));
        CHECKS.incrementAndGet();
        reject(() -> HrSkillRules.definition(definition("ACTIVE", Map.of())), "Unconfigured levels cannot activate");
        reject(() -> HrSkillRules.definition(definition("ACTIVE", Map.of("1", "", "2", "二", "3", "三", "4", "四", "5", "五"))), "Empty level cannot activate");
        reject(() -> HrSkillRules.definition(definition("DRAFT", Map.of("6", "六"))), "Unknown level rejected");
        for (int level = -3; level <= 8; level++) {
            int selected = level;
            if (level < 1 || level > 5) reject(() -> HrSkillRules.level(selected), "Level outside 1-5");
            else { HrSkillRules.level(level); CHECKS.incrementAndGet(); }
        }
        HrSkillRules.requirements(List.of());
        CHECKS.incrementAndGet();
        HrSkillRules.requirements(List.of(requirement(1L, "0.3333", true), requirement(2L, "0.6667", true), requirement(3L, "1", false)));
        CHECKS.incrementAndGet();
        reject(() -> HrSkillRules.requirements(List.of(requirement(1L, "0.5", true), requirement(2L, "0.5", false))), "Groups do not share total");
        reject(() -> HrSkillRules.requirements(List.of(requirement(1L, "0.5", true), requirement(1L, "0.5", true))), "Duplicate skill rejected");
        reject(() -> HrSkillRules.requirements(List.of(requirement(1L, "1.00001", true))), "Excess precision rejected");
        reject(() -> HrSkillRules.requirements(List.of(requirement(1L, "-1", true))), "Negative weight rejected");
        for (int required = 1; required <= 5; required++) {
            for (int current = 0; current <= 5; current++) equal(Math.max(required - current, 0), HrSkillRules.gap(required, current), "Exact gap");
        }
        LocalDate today = HrHSupport.today();
        HrEmployeeSkill assessment = new HrEmployeeSkill();
        assessment.setCurrentFlag(1);
        assessment.setAssessmentStatus("APPROVED");
        assessment.setCurrentLevel(4);
        assessment.setExpireDate(today);
        equal(4, HrSkillRules.effectiveLevel(assessment, today, true), "Expiry includes today");
        equal(0, HrSkillRules.effectiveLevel(assessment, today.plusDays(1), true), "Expired is unqualified");
        equal(0, HrSkillRules.effectiveLevel(assessment, today, false), "Invalid source rejected");
        for (String status : List.of("PENDING", "REJECTED", "REVOKED", "RECORDED")) {
            assessment.setAssessmentStatus(status);
            equal(0, HrSkillRules.effectiveLevel(assessment, today, true), "Only approved is effective");
        }
        reject(() -> HrSkillRules.expiry(today.minusDays(1), today), "New expired assessment rejected");
        reject(() -> HrSkillRules.expiry(LocalDate.of(10000, 1, 1), today), "MySQL date overflow rejected");
    }

    private static final class Harness implements AutoCloseable {
        private final ValidatorFactory validators = Validation.buildDefaultValidatorFactory();
        private final JdbcTemplate jdbc;
        private final DataSourceTransactionManager transactions;
        private final SqlSessionTemplate session;
        private final HrSkillService service;
        private final HrTypedCrudService generic;
        private final FixtureAccess access;
        private final AnnotationConfigApplicationContext events = new AnnotationConfigApplicationContext();

        Harness(String[] arguments) throws Exception {
            require(arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]{4,5}/cloud_flow_db\\?.*"), "Loopback JDBC only");
            Path expectedDirectory = Path.of(arguments[1]).toRealPath();
            require(expectedDirectory.toString().matches("(?i)D:.*batch-e-mysql-[a-f0-9]{32}[\\\\/]data"), "Owned scratch directory only");
            DriverManagerDataSource dataSource = new DriverManagerDataSource(arguments[0], "root", "");
            jdbc = new JdbcTemplate(dataSource);
            equal(expectedDirectory, Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath(), "Database ownership");
            transactions = new DataSourceTransactionManager(dataSource);
            MybatisConfiguration configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.setCacheEnabled(false);
            configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
            configuration.setDefaultStatementTimeout(15);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setBanner(false);
            global.setDbConfig(new GlobalConfig.DbConfig());
            global.setMetaObjectHandler(new MyMetaObjectHandler());
            GlobalConfigUtils.setGlobalConfig(configuration, global);
            configuration.addMappers("com.cloudflow.hr.mapper");
            List<Resource> resources = new ArrayList<>();
            resources.add(new FileSystemResource(Path.of(arguments[2]).getParent()
                    .resolve("cloudflow-common/cloudflow-common-data/src/main/resources/mapper/report/ReportSqlMapper.xml")));
            try (Stream<Path> paths = Files.walk(Path.of(arguments[2], "src/main/resources/mapper"))) {
                paths.filter(source -> source.toString().endsWith(".xml")).forEach(source -> resources.add(new FileSystemResource(source)));
            }
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setConfiguration(configuration);
            factory.setGlobalConfig(global);
            factory.setDataSource(dataSource);
            factory.setMapperLocations(resources.toArray(Resource[]::new));
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            session = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            HrRuleSupport support = new HrRuleSupport(transactions, null, mapper(HrEmployeeMapper.class),
                    mapper(HrAuditLogMapper.class), JSON, mapper(HrPositionMapper.class));
            access = new FixtureAccess(support, mapper(HrHMapper.class), mapper(HrEmployeeMapper.class), validators.getValidator());
            HrSkillService target = new HrSkillService(mapper(HrSkillMapper.class), mapper(HrPositionSkillMapper.class),
                    mapper(HrEmployeeSkillMapper.class), mapper(HrPositionMapper.class), mapper(HrTrainingCourseMapper.class),
                    mapper(HrTrainingEnrollmentMapper.class), mapper(HrTrainingSessionMapper.class), mapper(HrExamAttemptMapper.class),
                    mapper(HrExamPaperMapper.class), mapper(HrTrainingCertificateMapper.class), access, support);
            service = transactional(target, HrSkillService.class);
            events.registerBean("skillService", HrSkillService.class, () -> service);
            events.refresh();
            generic = new HrTypedCrudService(null, JSON, mapper(HrEmployeeMapper.class), mapper(HrPositionMapper.class),
                    null, mapper(HrAuditLogMapper.class), null, null, null, null, null);
        }

        private <T> T mapper(Class<T> type) { return session.getMapper(type); }

        private <T> T transactional(T target, Class<T> type) {
            ProxyFactory proxy = new ProxyFactory(target);
            proxy.setProxyTargetClass(true);
            proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
            return type.cast(proxy.getProxy());
        }

        void run() throws Exception {
            fixture();
            actor(REVIEWER, 100000L, 0, true);
            Long skillId = service.saveDefinition(new HrSkillRequests.Definition(null, "CHECK_SKILL", "核验技能", "技术", "核验", LEVELS, "ACTIVE", null));
            equal(1L, count("SELECT COUNT(*) FROM hr_skill WHERE skill_id=?", skillId), "Definition stored");
            reject(() -> service.saveDefinition(new HrSkillRequests.Definition(null, "CHECK_SKILL", "重复", "", "", LEVELS, "ACTIVE", null)), "Duplicate code rejected");
            HrSkillRequests.Query query = new HrSkillRequests.Query();
            query.setKeyword("核验技能");
            equal(1L, service.definitions(query).getTotal(), "Definition query returns actual total");
            HrSkillViews.Position position = service.savePosition(POSITION, new HrSkillRequests.PositionRequirements(0, List.of(new HrSkillRequests.Requirement(skillId, 4, BigDecimal.ONE, true))));
            equal(1, position.version(), "Position CAS increments");
            reject(() -> service.savePosition(POSITION, new HrSkillRequests.PositionRequirements(0, List.of())), "Stale position cannot clear requirements");
            equal(1L, count("SELECT COUNT(*) FROM hr_position_skill WHERE position_id=?", POSITION), "Failed position edit rolls back");
            service.saveCourse(9200101L, new HrSkillRequests.CourseTarget(0, skillId, 3));
            service.saveCourse(9200102L, new HrSkillRequests.CourseTarget(0, skillId, 4));
            reject(() -> service.saveCourse(9200101L, new HrSkillRequests.CourseTarget(0, null, null)), "Stale course cannot clear target");
            reject(() -> generic.update(HrTrainingCourse.class, 9200101L, Map.of("skillId", skillId, "targetLevel", 5)), "Generic course target bypass blocked");
            for (String field : List.of("skillId", "targetLevel", "skill_id", "target_level")) {
                HrTrainingCoursePayload forbiddenTarget = JSON.readValue(JSON.writeValueAsString(Map.of(field, 1)), HrTrainingCoursePayload.class);
                reject(() -> generic.update(HrTrainingCourse.class, 9200101L, forbiddenTarget), "Typed course payload target rejected: " + field);
            }
            HrTrainingCoursePayload nullTarget = JSON.readValue("{\"skillId\":null,\"targetLevel\":null}", HrTrainingCoursePayload.class);
            reject(() -> generic.update(HrTrainingCourse.class, 9200101L, nullTarget), "Typed course payload cannot silently clear targets");
            require(!new HrTrainingCoursePayload().isSkillTargetSupplied(), "Ordinary course payload remains compatible");
            actor(EMPLOYEE, 100000L, 4, false);
            reject(() -> service.saveDefinition(definition("ACTIVE", LEVELS)), "Employee cannot maintain definitions");
            HrSkillRequests.SelfAssessment input = self(skillId, 2, "自报");
            Long selfId = service.selfAssessment(input);
            equal(selfId, service.selfAssessment(input), "Repeated self submission has one identity");
            input.setRemark("改写原标识");
            reject(() -> service.selfAssessment(input), "Changed content with same key rejected");
            input.setRemark("自报");
            equal("PENDING", text("SELECT assessment_status FROM hr_employee_skill WHERE employee_skill_id=?", selfId), "Self remains pending");
            equal(0L, count("SELECT current_flag FROM hr_employee_skill WHERE employee_skill_id=?", selfId), "Self cannot become current");
            HrSkillRequests.Query ownQuery = new HrSkillRequests.Query();
            ownQuery.setEmployeeId(OTHER);
            equal(EMPLOYEE, service.mine(ownQuery).employeeId(), "Own endpoint ignores spoofed employee selector");
            equal(1L, service.mine(new HrSkillRequests.Query()).assessments().getTotal(), "Only own evidence is listed");
            actor(EMPLOYEE, 100000L, 0, true);
            reject(() -> service.review(selfId, new HrSkillRequests.Review(0, true, 5, null, "本人审核")), "Privileged employee cannot self-review");
            actor(REVIEWER, 100000L, 0, true);
            service.review(selfId, new HrSkillRequests.Review(0, true, 2, null, "依据核实"));
            reject(() -> service.review(selfId, new HrSkillRequests.Review(0, true, 5, null, "再次审核")), "Repeated review cannot change approved evidence");
            actor(EMPLOYEE, 100000L, 4, false);
            equal(2, service.mine(new HrSkillRequests.Query()).assessments().getRows().get(0).effectiveLevel(), "Reviewed self becomes level 2");
            equal(0, service.recommendations().skills().get(0).recommendations().size(), "Existing employee role cannot receive unauthorized enrollment recommendations");
            jdbc.update("INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (?,1,100000)", EMPLOYEE);
            equal(1, service.recommendations().skills().get(0).recommendations().size(), "Fixture-authorized enrollment receives only sufficient published course");
            jdbc.update("DELETE FROM sys_user_role WHERE user_id=? AND role_id=1 AND tenant_id=100000", EMPLOYEE);
            source("TRAINING", 9200101L);
            equal(3L, count("SELECT current_level FROM hr_employee_skill WHERE employee_id=? AND current_flag=1", EMPLOYEE), "Completed training raises to configured level 3");
            equal(2L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE employee_id=?", EMPLOYEE), "Training creates one evidence");
            source("TRAINING", 9200101L);
            equal(2L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE employee_id=?", EMPLOYEE), "Repeated training event stays unique");
            source("EXAM", 9200101L);
            equal("RECORDED", text("SELECT assessment_status FROM hr_employee_skill WHERE evidence_type='EXAM' AND evidence_biz_id=?", "9200101"), "Equal exam does not renew result");
            actor(REVIEWER, 100000L, 0, true);
            service.saveCourse(9200101L, new HrSkillRequests.CourseTarget(1, skillId, 5));
            source("CERTIFICATE", 9200101L);
            equal(5L, count("SELECT current_level FROM hr_employee_skill WHERE employee_id=? AND current_flag=1", EMPLOYEE), "Certificate uses server level 5");
            jdbc.update("UPDATE hr_training_certificate SET status='REVOKED' WHERE id=?", 9200101L);
            actor(EMPLOYEE, 100000L, 4, false);
            equal(0, service.recommendations().skills().get(0).currentLevel(), "Revoked certificate invalid before event delivery");
            source("CERTIFICATE", 9200101L);
            equal(0L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE employee_id=? AND current_flag=1", EMPLOYEE), "Revocation does not restore older training");
            source("TRAINING", 9200101L);
            equal(0L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE employee_id=? AND current_flag=1", EMPLOYEE), "Replayed old evidence cannot restore itself");
            actor(REVIEWER, 100000L, 0, true);
            HrSkillRequests.Assessment forged = manual(skillId, OTHER, "TRAINING", 9200101L);
            reject(() -> service.assess(forged), "Evidence from another employee rejected");
            forged.setEvidenceType("SELF");
            reject(() -> service.assess(forged), "Manager entry cannot fabricate self result");
            actor(REVIEWER, 100000L, 3, true);
            UserContext.setDeptId(999999L);
            reject(() -> service.assess(manual(skillId, EMPLOYEE, "MANAGER_REVIEW", null)), "Department scope rejects unrelated employee");
            equal(0L, service.assessments(new HrSkillRequests.Query(), false).getTotal(), "Scoped total hides unrelated evidence");
            actor(9200104L, 100001L, 0, true);
            reject(() -> service.saveDefinition(new HrSkillRequests.Definition(skillId, "CHECK_SKILL", "越租户", "", "", LEVELS, "ACTIVE", 0)), "Cross tenant definition rejected");
            reject(() -> service.review(selfId, new HrSkillRequests.Review(1, true, 5, null, "越租户")), "Cross tenant review rejected");
            actor(REVIEWER, 100000L, 0, true);
            concurrency(skillId);
            actor(REVIEWER, 100000L, 0, true);
            HrSkillRequests.Assessment manager = manual(skillId, OTHER, "MANAGER_REVIEW", null);
            manager.setLevel(2);
            manager.setExpireDate(HrHSupport.today().plusDays(1));
            Long managerId = service.assess(manager);
            equal(managerId, service.assess(manager), "Repeated manager review retains identity");
            equal(2L, count("SELECT current_level FROM hr_employee_skill WHERE employee_id=? AND current_flag=1", OTHER), "Manager review uses explicit verified level");
            jdbc.update("UPDATE hr_employee_skill SET expire_date=DATE_SUB(CURDATE(),INTERVAL 1 DAY) WHERE employee_skill_id=?", managerId);
            HrSkillRequests.Query gapQuery = new HrSkillRequests.Query();
            gapQuery.setEmployeeId(OTHER);
            equal(0, service.gaps(gapQuery).getRows().get(0).skills().get(0).currentLevel(), "Expired current evidence never restores older review");
            equal(4, service.gaps(gapQuery).getRows().get(0).skills().get(0).gap(), "Expired current evidence has full position gap");
            for (String evidenceType : List.of("EXAM", "CERTIFICATE")) {
                reject(() -> service.assess(manual(skillId, OTHER, evidenceType, 9200101L)), "Other employee source rejected for " + evidenceType);
            }
            eventHooks();
            require(count("SELECT COUNT(*) FROM hr_audit_log WHERE business_id=?", selfId) >= 2, "Actual audit rows persisted");
            jdbcReject(() -> jdbc.update("UPDATE hr_training_course SET skill_id=?, target_level=NULL WHERE id=?", skillId, 9200101L), "MySQL rejects incomplete course target");
        }

        private void eventHooks() {
            actor(REVIEWER, 100000L, 0, true);
            Long skillId = service.saveDefinition(new HrSkillRequests.Definition(null, "CHECK_EVENT_SKILL", "真实服务技能联动", "技术", "核验", LEVELS, "ACTIVE", null));
            jdbc.update("INSERT INTO hr_training_course (id,tenant_id,course_code,course_name,status) VALUES (9200201,100000,'CHECK_EVENT_COURSE','真实联动课程','PUBLISHED')");
            service.saveCourse(9200201L, new HrSkillRequests.CourseTarget(0, skillId, 2));
            jdbc.update("INSERT INTO hr_training_session (id,tenant_id,course_id,session_no,start_time,end_time,capacity,enrolled_count,status) VALUES (9200201,100000,9200201,'CHECK_EVENT_SESSION',NOW(),DATE_ADD(NOW(),INTERVAL 1 DAY),20,0,'ONGOING')");
            jdbc.update("INSERT INTO hr_training_enrollment (id,tenant_id,session_id,employee_id,status,completion_status) VALUES (9200201,100000,9200201,?,'APPROVED','PENDING')", EMPLOYEE);
            HrEssSupport own = new HrEssSupport(new HrIntegrationQueryServiceImpl(mapper(HrDirectoryMapper.class)));
            HrTrainingArchiveServiceImpl archives = new HrTrainingArchiveServiceImpl(mapper(HrTrainingEnrollmentMapper.class),
                    mapper(HrTrainingCertificateMapper.class), mapper(HrTrainingCourseMapper.class), mapper(HrTrainingSessionMapper.class),
                    mapper(HrEmployeeMapper.class), mapper(HrTrainingArchiveMapper.class), own);
            HrTrainingEnrollmentServiceImpl enrollment = transactional(new HrTrainingEnrollmentServiceImpl(mapper(HrTrainingEnrollmentMapper.class),
                    mapper(HrTrainingSessionMapper.class), mapper(HrEmployeeMapper.class), own, null, archives, null, JSON, null, events), HrTrainingEnrollmentServiceImpl.class);
            enrollment.complete(9200201L, "PASSED", BigDecimal.valueOf(90), "实际结业服务");
            equal(2L, count("SELECT current_level FROM hr_employee_skill WHERE skill_id=? AND current_flag=1", skillId), "Actual completion service emits and consumes event");
            enrollment.complete(9200201L, "PASSED", BigDecimal.valueOf(90), "重复结业");
            equal(1L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE skill_id=?", skillId), "Repeated real completion is unique");
            enrollment.complete(9200201L, "FAILED", BigDecimal.TEN, "更正结业");
            equal(0L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE skill_id=? AND current_flag=1", skillId), "Real failed completion revokes evidence atomically");
            service.saveCourse(9200201L, new HrSkillRequests.CourseTarget(1, skillId, 3));
            jdbc.update("INSERT INTO hr_exam_paper (id,tenant_id,course_id,paper_name,total_score,pass_score,status) VALUES (9200201,100000,9200201,'真实批改服务',100,60,'PUBLISHED')");
            jdbc.update("INSERT INTO hr_exam_attempt (id,tenant_id,paper_id,employee_id,session_id,status,start_time) VALUES (9200201,100000,9200201,?,9200201,'SUBMITTED',NOW())", EMPLOYEE);
            HrExamServiceImpl exams = transactional(new HrExamServiceImpl(mapper(HrExamPaperMapper.class), mapper(HrExamQuestionBankMapper.class),
                    mapper(HrExamAttemptMapper.class), own, generic, events), HrExamServiceImpl.class);
            exams.grade(9200201L, BigDecimal.valueOf(95), true, "核实通过");
            equal(3L, count("SELECT current_level FROM hr_employee_skill WHERE skill_id=? AND current_flag=1", skillId), "Actual exam grade emits promotion");
            exams.grade(9200201L, BigDecimal.valueOf(95), true, "重复批改");
            equal(2L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE skill_id=?", skillId), "Repeated grade cannot renew evidence");
            service.saveCourse(9200201L, new HrSkillRequests.CourseTarget(2, skillId, 4));
            jdbc.update("INSERT INTO hr_exam_question_bank (id,tenant_id,question_type,content,answer,score,status) VALUES (9200201,100000,'SINGLE','核验客观题',JSON_ARRAY('A'),100,'ACTIVE')");
            jdbc.update("INSERT INTO hr_exam_paper (id,tenant_id,course_id,paper_name,question_ids,total_score,pass_score,status) VALUES (9200202,100000,9200201,'真实交卷服务',JSON_ARRAY(9200201),100,60,'PUBLISHED')");
            actor(EMPLOYEE, 100000L, 4, false);
            Long attemptId = exams.startAttempt(9200202L, 9200201L);
            HrExamAnswerDTO answer = new HrExamAnswerDTO();
            answer.setQuestionId(9200201L);
            answer.setAnswer("A");
            equal("GRADED", exams.submit(attemptId, List.of(answer)).getStatus(), "Actual objective submission is graded");
            equal(4L, count("SELECT current_level FROM hr_employee_skill WHERE skill_id=? AND current_flag=1", skillId), "Actual objective submission emits promotion");
            reject(() -> exams.submit(attemptId, List.of(answer)), "Actual submission rejects repeated answers");
            actor(REVIEWER, 100000L, 0, true);
            service.saveCourse(9200201L, new HrSkillRequests.CourseTarget(3, skillId, 5));
            jdbc.update("INSERT INTO hr_training_certificate (id,tenant_id,cert_no,employee_id,course_id,session_id,issue_date,status) VALUES (9200201,100000,'CHECK_EVENT_CERT',?,9200201,9200201,CURDATE(),'VALID')", EMPLOYEE);
            eventsInTransaction(new HrSkillEvidenceChangedEvent(100000L, "CERTIFICATE", 9200201L));
            equal(5L, count("SELECT current_level FROM hr_employee_skill WHERE skill_id=? AND current_flag=1", skillId), "Certificate consumes actual Spring event");
            HrTrainingCertificateServiceImpl certificates = transactional(new HrTrainingCertificateServiceImpl(mapper(HrTrainingCertificateMapper.class),
                    mapper(HrTrainingCertificateTemplateMapper.class), mapper(HrTrainingCourseMapper.class), mapper(HrTrainingSessionMapper.class),
                    mapper(HrEmployeeMapper.class), null, null, archives, null, events), HrTrainingCertificateServiceImpl.class);
            certificates.revoke(9200201L, "核实撤销");
            equal(0L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE skill_id=? AND current_flag=1", skillId), "Real certificate revocation removes qualification without fallback");
            reject(() -> eventsInTransaction(new HrSkillEvidenceChangedEvent(100001L, "TRAINING", 9200201L)), "Cross tenant event rejected");
            jdbc.update("UPDATE hr_training_course SET status='DRAFT' WHERE id=9200201");
            eventsInTransaction(new HrSkillEvidenceChangedEvent(100000L, "EXAM", 9200201L));
            equal("APPROVED", text("SELECT assessment_status FROM hr_employee_skill WHERE evidence_type='EXAM' AND evidence_biz_id=?", "9200201"), "Course unpublication does not erase genuine historical evidence");
            System.out.println("H2_SKILL_SERVICE_EVENTS: completion=true; objective_submission=true; grading=true; certificate_revocation=true; spring_listener=true; certificate_issuance=false; http=false");
        }

        private void eventsInTransaction(HrSkillEvidenceChangedEvent event) {
            new TransactionTemplate(transactions).executeWithoutResult(status -> events.publishEvent(event));
        }

        private void fixture() {
            for (long identity : List.of(EMPLOYEE, REVIEWER, OTHER)) {
                jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES (?,100000,9200101,?,?,'0',0)", identity, "skill_" + identity, "技能核验" + identity);
                jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,dept_id,position_id,employee_status,hire_date,user_id,deleted) VALUES (?,100000,?,?,'UNKNOWN',9200101,?,'REGULAR','2020-01-01',?,0)", identity, "skill_" + identity, "技能员工" + identity, POSITION, identity);
            }
            jdbc.update("INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (?,5,100000)", EMPLOYEE);
            jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES (9200104,100001,9200101,'skill_other_tenant','另一租户评估人','0',0)");
            jdbc.update("INSERT INTO hr_position (id,tenant_id,position_code,position_name,status,version) VALUES (?,100000,'CHECK_SKILL_POSITION','技能核验岗位',1,0)", POSITION);
            jdbc.update("INSERT INTO hr_training_course (id,tenant_id,course_code,course_name,status) VALUES (9200101,100000,'CHECK_SKILL_COURSE','技能核验课程','PUBLISHED')");
            jdbc.update("INSERT INTO hr_training_course (id,tenant_id,course_code,course_name,status) VALUES (9200102,100000,'CHECK_SKILL_RECOMMEND_COURSE','补足岗位差距的课程','PUBLISHED')");
            jdbc.update("INSERT INTO hr_training_session (id,tenant_id,course_id,session_no,start_time,end_time,capacity,enrolled_count,status) VALUES (9200101,100000,9200101,'CHECK_SKILL_SESSION',NOW(),DATE_ADD(NOW(),INTERVAL 5 DAY),20,0,'ONGOING')");
            jdbc.update("INSERT INTO hr_training_session (id,tenant_id,course_id,session_no,start_time,end_time,capacity,enrolled_count,status) VALUES (9200102,100000,9200102,'CHECK_SKILL_RECOMMEND',NOW(),DATE_ADD(NOW(),INTERVAL 5 DAY),20,0,'REGISTERING')");
            jdbc.update("INSERT INTO hr_training_enrollment (id,tenant_id,session_id,employee_id,status,completion_status) VALUES (9200101,100000,9200101,?,'APPROVED','PASSED')", EMPLOYEE);
            jdbc.update("INSERT INTO hr_exam_paper (id,tenant_id,course_id,paper_name,total_score,pass_score,status) VALUES (9200101,100000,9200101,'技能考试',100,60,'PUBLISHED')");
            jdbc.update("INSERT INTO hr_exam_attempt (id,tenant_id,paper_id,employee_id,session_id,status,pass_flag,score,start_time) VALUES (9200101,100000,9200101,?,9200101,'GRADED',1,100,NOW())", EMPLOYEE);
            jdbc.update("INSERT INTO hr_training_certificate (id,tenant_id,cert_no,employee_id,course_id,session_id,issue_date,expire_date,status) VALUES (9200101,100000,'CHECK_SKILL_CERT',?,9200101,9200101,CURDATE(),DATE_ADD(CURDATE(),INTERVAL 1 YEAR),'VALID')", EMPLOYEE);
        }

        private void source(String type, Long businessId) {
            new TransactionTemplate(transactions).executeWithoutResult(status -> service.applyEvidence(new HrSkillEvidenceChangedEvent(100000L, type, businessId)));
        }

        private void concurrency(Long skillId) throws Exception {
            HrSkillRequests.SelfAssessment input = self(skillId, 4, "并发自报");
            List<Long> ids = race(() -> {
                actor(OTHER, 100000L, 4, false);
                return service.selfAssessment(input);
            });
            equal(ids.get(0), ids.get(1), "Concurrent same request returns one record");
            equal(1L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE employee_id=?", OTHER), "Database lock independently prevents duplicates");
            AtomicInteger successes = new AtomicInteger();
            race(() -> {
                actor(REVIEWER, 100000L, 0, true);
                try {
                    service.review(ids.get(0), new HrSkillRequests.Review(0, true, 4, null, "并发审核"));
                    successes.incrementAndGet();
                } catch (HrHException expected) { equal(409, expected.getStatus(), "Competing review is a conflict"); }
                return 1L;
            });
            equal(1, successes.get(), "Concurrent review has exactly one winner");
            equal(1L, count("SELECT COUNT(*) FROM hr_employee_skill WHERE employee_id=? AND current_flag=1", OTHER), "One current result after competing reviews");
            System.out.println("H2_SKILL_MYSQL_RACES: scenarios=2; duplicate_submissions=0; double_reviews=0");
        }

        private long count(String sql, Object argument) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, argument)); }
        private String text(String sql, Object argument) { return jdbc.queryForObject(sql, String.class, argument); }
        @Override public void close() { events.close(); validators.close(); UserContext.clear(); TenantContext.clear(); PERMISSIONS.remove(); }
    }

    private static final class FixtureAccess extends HrHSupport {
        FixtureAccess(HrRuleSupport support, HrHMapper mapper, HrEmployeeMapper employees, Validator validator) {
            super(support, mapper, employees, null, null, null, null, null, null, JSON, validator);
        }
        @Override public boolean permitted(String permission) { return PERMISSIONS.get() != null && PERMISSIONS.get().contains(permission); }
    }

    private static void actor(long identity, long tenant, int scope, boolean privileged) {
        TenantContext.setTenantId(tenant);
        UserContext.setTenantId(tenant);
        UserContext.setUserId(identity);
        UserContext.setUserName("skill-check");
        UserContext.setDeptId(9200101L);
        UserContext.setDsType(scope);
        PERMISSIONS.set(privileged ? Set.of("hr:skill:list", "hr:skill:manage", "hr:skill:assess", "hr:skill:gap", "hr:skill:own", "hr:skill:self-submit", "hr:training:enroll:add")
                : Set.of("hr:skill:list", "hr:skill:own", "hr:skill:self-submit", "hr:training:enroll:add"));
    }

    private static List<Long> race(Callable<Long> action) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Long>> futures = new ArrayList<>();
            for (int worker = 0; worker < 2; worker++) futures.add(workers.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Race barrier timed out");
                try { return action.call(); }
                finally { UserContext.clear(); TenantContext.clear(); PERMISSIONS.remove(); }
            }));
            require(ready.await(10, TimeUnit.SECONDS), "Race participants ready");
            start.countDown();
            return List.of(futures.get(0).get(30, TimeUnit.SECONDS), futures.get(1).get(30, TimeUnit.SECONDS));
        } finally { workers.shutdownNow(); require(workers.awaitTermination(10, TimeUnit.SECONDS), "Race workers stopped"); }
    }

    private static HrSkillRequests.Definition definition(String status, Map<String, String> levels) {
        return new HrSkillRequests.Definition(null, "SKILL", "技能", "", "", levels, status, null);
    }
    private static HrSkillRequests.Requirement requirement(Long skillId, String weight, boolean mandatory) {
        return new HrSkillRequests.Requirement(skillId, 3, new BigDecimal(weight), mandatory);
    }
    private static HrSkillRequests.SelfAssessment self(Long skillId, int level, String remark) {
        HrSkillRequests.SelfAssessment input = new HrSkillRequests.SelfAssessment();
        input.setSkillId(skillId); input.setLevel(level); input.setRemark(remark); input.setRequestKey(UUID.randomUUID().toString());
        return input;
    }
    private static HrSkillRequests.Assessment manual(Long skillId, Long employeeId, String type, Long businessId) {
        HrSkillRequests.Assessment input = new HrSkillRequests.Assessment();
        input.setSkillId(skillId); input.setEmployeeId(employeeId); input.setEvidenceType(type); input.setEvidenceBizId(businessId);
        input.setLevel(5); input.setRemark("核验证据"); input.setRequestKey(UUID.randomUUID().toString());
        return input;
    }
    private static void require(boolean condition, String label) {
        CHECKS.incrementAndGet();
        if (!condition) throw new AssertionError(label);
    }
    private static void equal(Object expected, Object actual, String label) {
        require(Objects.equals(expected, actual), label + "; expected=" + expected + "; actual=" + actual);
    }
    private static void reject(Runnable action, String label) {
        try { action.run(); }
        catch (HrHException | com.cloudflow.hr.exception.HrBusinessException expected) { CHECKS.incrementAndGet(); return; }
        throw new AssertionError(label + ": unexpectedly accepted");
    }
    private static void jdbcReject(Runnable action, String label) {
        try { action.run(); }
        catch (org.springframework.dao.DataAccessException expected) {
            Throwable cause = expected.getMostSpecificCause();
            if (cause instanceof java.sql.SQLException sqlException && sqlException.getErrorCode() == 3819) {
                CHECKS.incrementAndGet();
                return;
            }
            throw expected;
        }
        throw new AssertionError(label + ": unexpectedly accepted");
    }
}
