package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrCandidatePayload;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrEmployeeReferral;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrEmployeeReferralMapper;
import com.cloudflow.hr.mapper.HrRecruitmentIdentityMapper;
import com.cloudflow.hr.mapper.HrResumeParsedFieldsMapper;
import com.cloudflow.hr.service.HrRecruitmentContacts;
import com.cloudflow.hr.service.HrRecruitmentIdentityService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.impl.HrResumeParserServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class HrReferralIdentityChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_referral_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch schema required");
        try (HikariDataSource source = new HikariDataSource(); StaticApplicationContext application = new StaticApplicationContext()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(6);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setDbConfig(new GlobalConfig.DbConfig());
            global.setMetaObjectHandler(new com.cloudflow.common.handler.MyMetaObjectHandler());
            GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapperType : List.of(HrCandidateMapper.class, HrRecruitmentIdentityMapper.class, HrEmployeeReferralMapper.class,
                    HrResumeParsedFieldsMapper.class, HrAuditLogMapper.class, com.cloudflow.hr.mapper.HrEmployeeMapper.class,
                    com.cloudflow.hr.mapper.HrOfferMapper.class)) configuration.addMapper(mapperType);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setPlugins(new com.cloudflow.common.config.MybatisPlusConfig(new com.cloudflow.common.tenant.TenantConfigProperties()).mybatisPlusInterceptor());
            factory.setMapperLocations(List.of("HrCandidateMapper", "HrRecruitmentIdentityMapper", "HrEmployeeReferralMapper", "HrAuditLogMapper", "HrOfferMapper")
                    .stream().map(name -> new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + name + ".xml"))
                    .toArray(FileSystemResource[]::new));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            DataSourceTransactionManager manager = new DataSourceTransactionManager(source);
            TransactionTemplate transaction = new TransactionTemplate(manager);
            HrCandidateMapper candidates = sessions.getMapper(HrCandidateMapper.class);
            HrEmployeeReferralMapper referrals = sessions.getMapper(HrEmployeeReferralMapper.class);
            HrRecruitmentIdentityService identities = new HrRecruitmentIdentityService(sessions.getMapper(HrRecruitmentIdentityMapper.class), candidates, manager);
            ObjectMapper json = new ObjectMapper().findAndRegisterModules();
            application.getBeanFactory().registerSingleton("hrCandidateMapper", candidates);
            com.cloudflow.hr.service.HrRuleSupport support = new com.cloudflow.hr.service.HrRuleSupport(manager, null,
                    sessions.getMapper(com.cloudflow.hr.mapper.HrEmployeeMapper.class), sessions.getMapper(HrAuditLogMapper.class), json, null);
            com.cloudflow.hr.service.HrReferralProgressService progress = new com.cloudflow.hr.service.HrReferralProgressService(referrals, candidates,
                    sessions.getMapper(com.cloudflow.hr.mapper.HrEmployeeMapper.class), sessions.getMapper(com.cloudflow.hr.mapper.HrOfferMapper.class), support);
            HrTypedCrudService crud = new HrTypedCrudService(application, json, null, null, null, sessions.getMapper(HrAuditLogMapper.class), null, identities, progress, null, null);
            HrResumeParserServiceImpl parser = new HrResumeParserServiceImpl(sessions.getMapper(HrResumeParsedFieldsMapper.class), candidates, json, identities);
            context(100000L);
            int originalCandidates = jdbc.queryForObject("SELECT COUNT(*) FROM hr_candidate", Integer.class);
            Long first = transaction.execute(status -> crud.create(HrCandidate.class, payload("+12025550111", "Same.Name+tag@example.test")));
            equal("same.name+tag@example.test", candidates.selectById(first).getEmail(), "normalized email saved");
            equal(2, count(jdbc, first), "two identities created");
            rejects(HrRecruitmentIdentityService.IdentityConflict.class, () -> transaction.execute(status -> crud.create(HrCandidate.class, payload(null, "SAME.NAME+TAG@EXAMPLE.TEST"))));
            rejects(HrRecruitmentIdentityService.IdentityConflict.class, () -> transaction.execute(status -> crud.create(HrCandidate.class, payload("+1 (202) 555-0111", "new@example.test"))));
            equal(originalCandidates + 1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_candidate", Integer.class), "failed candidates rolled back");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_recruitment_identity WHERE candidate_id <> ? AND create_by='identity-check'", Integer.class, first), "failed contacts rolled back");
            transaction.executeWithoutResult(status -> crud.updateProperties(HrCandidate.class, first, Map.of("phone", "+12025550112", "email", "next@example.test")));
            equal(4, count(jdbc, first), "historical contacts retained");
            rejects(HrRecruitmentIdentityService.IdentityConflict.class, () -> transaction.execute(status -> crud.create(HrCandidate.class, payload("+12025550111", null))));
            rejects(IllegalArgumentException.class, () -> transaction.executeWithoutResult(status -> crud.updateProperties(HrCandidate.class, first, Map.of("phone", "13812345678"))));
            equal("+12025550112", candidates.selectById(first).getPhone(), "new local number rejected intact");
            transaction.executeWithoutResult(status -> crud.updateProperties(HrCandidate.class, first, Map.of("phone", "", "email", "")));
            equal(null, candidates.selectById(first).getPhone(), "blank phone cleared");
            equal(null, candidates.selectById(first).getEmail(), "blank email cleared");
            equal(4, count(jdbc, first), "clearing does not release identities");
            transaction.executeWithoutResult(status -> {
                HrEmployeeReferral duplicate = referral(referrals);
                boolean occupied = identities.occupyReferral(HrRecruitmentContacts.normalize(100000L, "+12025550111", "unclaimed@example.test", true), duplicate.getReferralId());
                equal(false, occupied, "duplicate referral detected");
                duplicate.setStatus("DUPLICATE"); referrals.updateById(duplicate);
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_recruitment_identity WHERE referral_id=?", Integer.class, duplicate.getReferralId()), "partial occupation rolled back to savepoint");
                equal("DUPLICATE", referrals.selectById(duplicate.getReferralId()).getStatus(), "duplicate business row retained");
            });
            Long converted = transaction.execute(status -> {
                HrEmployeeReferral row = referral(referrals);
                HrRecruitmentContacts.Contacts contacts = HrRecruitmentContacts.normalize(100000L, "+12025550222", "convert@example.test", true);
                equal(true, identities.occupyReferral(contacts, row.getReferralId()), "referral claims identities");
                HrCandidate candidate = candidate(candidates, contacts.phone(), contacts.email());
                identities.attachCandidate(row.getReferralId(), candidate); identities.attachCandidate(row.getReferralId(), candidate);
                identities.occupyCandidate(candidate);
                equal(2, count(jdbc, candidate.getId()), "conversion reuses both identities");
                return candidate.getId();
            });
            Long parsedCandidate = transaction.execute(status -> crud.create(HrCandidate.class, payload(null, null)));
            Long parsedId = transaction.execute(status -> parser.parseResume(parsedCandidate, null, "邮箱：convert@example.test"));
            rejects(HrRecruitmentIdentityService.IdentityConflict.class, () -> transaction.executeWithoutResult(status -> parser.confirmParsed(parsedId)));
            equal(null, candidates.selectById(parsedCandidate).getEmail(), "conflicting resume does not change candidate");
            equal("PENDING", sessions.getMapper(HrResumeParsedFieldsMapper.class).selectById(parsedId).getReviewStatus(), "conflicting review remains pending");
            UserContext.setDsType(4); UserContext.setUserName("other-operator");
            rejects(com.cloudflow.hr.service.HrHException.class, () -> parser.listParsed(parsedCandidate));
            rejects(com.cloudflow.hr.service.HrHException.class, () -> transaction.execute(status -> parser.parseResume(converted, null, "content")));
            context(100001L);
            rejects(com.cloudflow.hr.service.HrHException.class, () -> parser.listParsed(parsedCandidate));
            transaction.executeWithoutResult(status -> crud.create(HrCandidate.class, payload("+12025550222", "convert@example.test")));
            equal(2, jdbc.queryForObject("SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100001", Integer.class), "cross tenant identity independent");
            context(100000L);
            concurrent(transaction, crud, referrals, identities, jdbc);
            progressChecks(transaction, crud, progress, referrals, candidates, sessions, jdbc);
            offerDecisionChecks(transaction, sessions.getMapper(com.cloudflow.hr.mapper.HrOfferMapper.class), candidates, jdbc);
            equal(null, referrals.activePosition(100000L, -1L), "position query executes");
            equal(null, transaction.execute(status -> referrals.lockResume(100000L, -1L)), "private file query executes");
            System.out.println("H2_REFERRAL_IDENTITIES: checks=" + checks + "; failed=0; real_mysql=true; same_transaction=true; concurrent_writers=2; nested_rollback=true; resume_scope=true; actual_http=false; contact_output=0");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void offerDecisionChecks(TransactionTemplate transaction, com.cloudflow.hr.mapper.HrOfferMapper offers, HrCandidateMapper candidates, JdbcTemplate jdbc) {
        int before = checks;
        for (String result : List.of("PASSED", "REJECTED")) for (String mode : List.of("APPROVAL", "OR_SIGN", "COUNTERSIGN")) {
            transaction.executeWithoutResult(status -> {
                String instanceId = UUID.randomUUID().toString(); String historyId = UUID.randomUUID().toString();
                com.cloudflow.hr.domain.entity.HrOffer offer = new com.cloudflow.hr.domain.entity.HrOffer();
                offer.setCandidateId(candidate(candidates, null, null).getId());
                offer.setTenantId(100000L); offer.setOfferNo(UUID.randomUUID().toString()); offer.setStatus("APPROVING");
                offer.setDeleted(0); offer.setProcessInstanceId(instanceId); offers.insert(offer);
                String variables = "{\"businessType\":\"OFFER\",\"businessId\":\"" + offer.getId() + "\"}";
                jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,status,variables,deleted) VALUES(?,100000,'offer_approval',?,10,?,?,0)",
                        instanceId, instanceId, result, variables);
                String action = "PASSED".equals(result) ? "APPROVE" : "REJECT";
                if (!"APPROVAL".equals(mode)) action = "COUNTERSIGN_" + action;
                String taskType = "APPROVAL".equals(mode) && "REJECTED".equals(result) ? "REJECT" : mode;
                jdbc.update("INSERT INTO wf_task_history(history_id,tenant_id,task_id,instance_id,operator_id,action,task_type) VALUES(?,100000,?,?,20,?,?)",
                        historyId, historyId, instanceId, action, taskType);
                equal(1, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "actual manual offer decision accepted");
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 21L), "wrong offer actor rejected");
                equal(0, offers.decisionMatches(100001L, offer.getId(), instanceId, result, 20L), "cross tenant offer decision rejected");
                equal(0, offers.decisionMatches(100000L, offer.getId(), UUID.randomUUID().toString(), result, 20L), "wrong offer instance rejected");
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, "PASSED".equals(result) ? "REJECTED" : "PASSED", 20L), "opposite offer result rejected");
                jdbc.update("UPDATE wf_task_history SET operator_id=10 WHERE history_id=?", historyId);
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 10L), "self approved offer rejected");
                jdbc.update("UPDATE wf_task_history SET operator_id=20,task_type='AUTO_APPROVE' WHERE history_id=?", historyId);
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "automatic offer decision rejected");
                jdbc.update("UPDATE wf_task_history SET task_type=? WHERE history_id=?", taskType, historyId);
                jdbc.update("UPDATE wf_process_instance SET status='RUNNING' WHERE instance_id=?", instanceId);
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "unfinished offer instance rejected");
                jdbc.update("UPDATE wf_process_instance SET status=?,variables=JSON_SET(variables,'$.businessType','OTHER') WHERE instance_id=?", result, instanceId);
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "foreign business type rejected");
                jdbc.update("UPDATE wf_process_instance SET variables=JSON_SET(variables,'$.businessType','OFFER','$.businessId','0') WHERE instance_id=?", instanceId);
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "foreign business id rejected");
                jdbc.update("UPDATE wf_process_instance SET variables=?,deleted=1 WHERE instance_id=?", variables, instanceId);
                equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "deleted offer instance rejected");
                if (!"APPROVAL".equals(mode)) {
                    jdbc.update("UPDATE wf_process_instance SET deleted=0 WHERE instance_id=?", instanceId);
                    jdbc.update("UPDATE wf_task_history SET task_type='APPROVAL' WHERE history_id=?", historyId);
                    equal(0, offers.decisionMatches(100000L, offer.getId(), instanceId, result, 20L), "counter decision requires counter task semantics");
                }
                status.setRollbackOnly();
            });
        }
        System.out.println("H2_OFFER_DECISIONS: scenarios=6; checks=" + (checks - before) + "; failed=0; actual_mapper=true; real_mysql=true; actual_http=false");
    }

    private static void concurrent(TransactionTemplate transaction, HrTypedCrudService crud, HrEmployeeReferralMapper referrals,
            HrRecruitmentIdentityService identities, JdbcTemplate jdbc) throws Exception {
        for (boolean referralRace : List.of(false, true)) {
            String phone = referralRace ? "+12025550334" : "+12025550333";
            CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
            AtomicInteger winners = new AtomicInteger(); AtomicInteger duplicates = new AtomicInteger();
            ExecutorService executor = Executors.newFixedThreadPool(2);
            try {
                List<Future<?>> tasks = java.util.stream.IntStream.range(0, 2).<Future<?>>mapToObj(index -> executor.submit(() -> {
                    context(100000L); ready.countDown();
                    try {
                        if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Race start timed out");
                        transaction.executeWithoutResult(status -> {
                            if (referralRace && index == 1) {
                                HrEmployeeReferral row = referral(referrals);
                                if (identities.occupyReferral(HrRecruitmentContacts.normalize(100000L, phone, null, true), row.getReferralId())) winners.incrementAndGet();
                                else { row.setStatus("DUPLICATE"); referrals.updateById(row); duplicates.incrementAndGet(); }
                            } else { crud.create(HrCandidate.class, payload(phone, null)); winners.incrementAndGet(); }
                        });
                    } catch (HrRecruitmentIdentityService.IdentityConflict duplicate) { duplicates.incrementAndGet(); }
                    catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
                    finally { UserContext.clear(); TenantContext.clear(); }
                })).toList();
                if (!ready.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Race readiness timed out"); start.countDown();
                for (Future<?> task : tasks) task.get(30, TimeUnit.SECONDS);
                equal(1, winners.get(), "one identity winner"); equal(1, duplicates.get(), "one duplicate loser");
                HrRecruitmentContacts.Identity identity = HrRecruitmentContacts.normalize(100000L, phone, null, true).identities().get(0);
                equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100000 AND identity_type='PHONE' AND identity_hash=?", Integer.class, identity.hash()), "one durable occupation");
            } finally { executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); }
        }
    }

    private static void progressChecks(TransactionTemplate transaction, HrTypedCrudService crud,
            com.cloudflow.hr.service.HrReferralProgressService progress, HrEmployeeReferralMapper referrals,
            HrCandidateMapper candidates, SqlSessionTemplate sessions, JdbcTemplate jdbc) {
        for (boolean future : List.of(false, true)) {
            HrCandidate candidate = transaction.execute(status -> candidate(candidates, null, null));
            HrEmployeeReferral row = transaction.execute(status -> {
                HrEmployeeReferral created = referral(referrals); created.setCandidateId(candidate.getId());
                created.setStatus("SCREENING"); referrals.updateById(created); return created;
            });
            transaction.executeWithoutResult(status -> crud.updateProperties(HrCandidate.class, candidate.getId(), Map.of("status", "INTERVIEW")));
            equal("INTERVIEWING", referrals.selectById(row.getReferralId()).getStatus(), "candidate interview synchronizes referral");
            rejects(com.cloudflow.hr.service.HrHException.class, () -> transaction.executeWithoutResult(status ->
                    crud.updateProperties(HrCandidate.class, candidate.getId(), Map.of("status", "HIRED"))));
            equal("INTERVIEW", candidates.selectById(candidate.getId()).getStatus(), "forged hire rolls back candidate");
            com.cloudflow.hr.domain.entity.HrEmployee employee = new com.cloudflow.hr.domain.entity.HrEmployee();
            employee.setTenantId(100000L); employee.setEmployeeNo(UUID.randomUUID().toString()); employee.setName("真实入职依据验证");
            employee.setGender("UNKNOWN"); employee.setEmployeeStatus("PROBATION"); employee.setDeleted(0); employee.setUserId(1L);
            employee.setHireDate(java.time.LocalDate.now().plusDays(future ? 1 : -1));
            sessions.getMapper(com.cloudflow.hr.mapper.HrEmployeeMapper.class).insert(employee);
            com.cloudflow.hr.domain.entity.HrOffer offer = new com.cloudflow.hr.domain.entity.HrOffer();
            offer.setTenantId(100000L); offer.setOfferNo(UUID.randomUUID().toString()); offer.setCandidateId(candidate.getId());
            offer.setStatus("APPROVED"); offer.setDeleted(0); offer.setProcessInstanceId(UUID.randomUUID().toString());
            sessions.getMapper(com.cloudflow.hr.mapper.HrOfferMapper.class).insert(offer);
            equal(true, progress.offerEmployment(offer, employee), "referral offer handled");
            equal(future ? "OFFERED" : "HIRED", referrals.selectById(row.getReferralId()).getStatus(), "hire date gates referral state");
            equal(future ? "OFFER" : "HIRED", candidates.selectById(candidate.getId()).getStatus(), "hire date gates candidate state");
            equal(true, progress.offerEmployment(offer, employee), "repeated employment source accepted once");
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_REFERRAL' AND business_id=? AND operation_type='EMPLOYMENT_SOURCE'", Integer.class, row.getReferralId()), "one durable employment source");
            equal(0, progress.applyDueEmployment(), "due job does not advance future hire or repeat effective hire");
            if (future) rejects(com.cloudflow.hr.service.HrHException.class, () -> progress.requireEmployment(referrals.selectById(row.getReferralId())));
            else equal(employee.getId(), com.cloudflow.hr.service.HrHSupport.number(progress.requireEmployment(referrals.selectById(row.getReferralId())).get("employeeId")), "bonus gets actual employee evidence");
        }
        HrCandidatePayload forged = payload(null, null); forged.setSource("REFERRAL");
        rejects(com.cloudflow.hr.service.HrHException.class, () -> transaction.execute(status -> crud.create(HrCandidate.class, forged)));
    }

    private static HrCandidatePayload payload(String phone, String email) {
        HrCandidatePayload request = new HrCandidatePayload(); request.setName("身份去重核验"); request.setPhone(phone); request.setEmail(email);
        return request;
    }

    private static HrCandidate candidate(HrCandidateMapper candidates, String phone, String email) {
        HrCandidate candidate = new HrCandidate(); candidate.setTenantId(100000L); candidate.setName("转换核验");
        candidate.setPhone(phone); candidate.setEmail(email); candidate.setStatus("SCREENING"); candidate.setDeleted(0); candidate.setVersion(0);
        candidate.setCreateBy("identity-check"); candidates.insert(candidate); return candidate;
    }

    private static HrEmployeeReferral referral(HrEmployeeReferralMapper referrals) {
        HrEmployeeReferral row = new HrEmployeeReferral(); row.setTenantId(100000L); row.setReferralNo(UUID.randomUUID().toString());
        row.setReferrerEmployeeId(1L); row.setReferrerName("核验推荐人"); row.setCandidateName("身份核验"); row.setContactPhone("+12025550999");
        row.setTargetPositionId(1L); row.setResumeFileId(1L); row.setStatus("SUBMITTED"); row.setBonusApplicableFlag(0); row.setBonusStatus("NOT_APPLICABLE");
        row.setVersion(0); referrals.insert(row); return row;
    }

    private static int count(JdbcTemplate jdbc, Long candidateId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100000 AND candidate_id=?", Integer.class, candidateId);
    }

    private static void context(Long tenantId) {
        TenantContext.setTenantId(tenantId); UserContext.setTenantId(tenantId); UserContext.setUserId(1L); UserContext.setUserName("identity-check"); UserContext.setDsType(0);
    }

    private static void equal(Object expected, Object actual, String label) {
        checks++; if (!Objects.equals(expected, actual)) throw new AssertionError(label);
    }

    private static void rejects(Class<? extends RuntimeException> expected, Runnable action) {
        checks++;
        try { action.run(); } catch (RuntimeException failure) { if (expected.isInstance(failure)) return; throw failure; }
        throw new AssertionError("Expected rejection: " + expected.getSimpleName());
    }
}
