package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.encrypt.interceptor.MybatisDecryptInterceptor;
import com.cloudflow.common.encrypt.interceptor.MybatisEncryptInterceptor;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.domain.dto.HrCandidatePayload;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrResumeParsedFields;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrResumeParsedFieldsMapper;
import com.cloudflow.hr.service.HrRecruitmentContacts;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.impl.HrResumeParserServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class HrContactCapacityDatabaseChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_contact_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch schema required");
        try (HikariDataSource source = new HikariDataSource(); StaticApplicationContext application = new StaticApplicationContext()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            Map<String, Integer> widths = Map.of("hr_candidate.email", 254, "hr_resume_parsed_fields.parsed_email", 254,
                    "hr_employee.email", 512, "hr_employee.phone", 64, "sys_user.email", 254, "sys_user.phonenumber", 16);
            for (Map.Entry<String, Integer> column : widths.entrySet()) {
                String[] names = column.getKey().split("\\.");
                equal(column.getValue(), jdbc.queryForObject("SELECT character_maximum_length FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?", Integer.class, names[0], names[1]), "approved capacity");
            }
            EncryptorProperties encryption = new EncryptorProperties();
            encryption.setEnabled(true); encryption.setAesKey(UUID.randomUUID().toString().replace("-", ""));
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(configuration, global);
            configuration.addMapper(HrCandidateMapper.class); configuration.addMapper(HrResumeParsedFieldsMapper.class);
            configuration.addMapper(HrEmployeeMapper.class); configuration.addMapper(SysUserMapper.class);
            configuration.addMapper(HrAuditLogMapper.class);
            configuration.addMapper(com.cloudflow.hr.mapper.HrRecruitmentIdentityMapper.class);
            configuration.addMapper(com.cloudflow.hr.mapper.HrEmployeeReferralMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setMapperLocations(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml"),
                    new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrCandidateMapper.xml"),
                    new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrRecruitmentIdentityMapper.xml"),
                    new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrEmployeeReferralMapper.xml"));
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor(),
                    new MybatisEncryptInterceptor(encryption), new MybatisDecryptInterceptor(encryption));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            ObjectMapper json = new ObjectMapper().findAndRegisterModules();
            json.registerModule(new SimpleModule("actual-sensitive-rules").setSerializerModifier(new SensitiveBeanSerializerModifier()));
            HrCandidateMapper candidates = sessions.getMapper(HrCandidateMapper.class);
            HrResumeParsedFieldsMapper parsed = sessions.getMapper(HrResumeParsedFieldsMapper.class);
            HrEmployeeMapper employees = sessions.getMapper(HrEmployeeMapper.class);
            SysUserMapper users = sessions.getMapper(SysUserMapper.class);
            application.getBeanFactory().registerSingleton("hrCandidateMapper", candidates);
            com.cloudflow.hr.service.HrRecruitmentIdentityService identities = new com.cloudflow.hr.service.HrRecruitmentIdentityService(
                    sessions.getMapper(com.cloudflow.hr.mapper.HrRecruitmentIdentityMapper.class), candidates, new DataSourceTransactionManager(source));
            com.cloudflow.hr.service.HrRuleSupport support = new com.cloudflow.hr.service.HrRuleSupport(new DataSourceTransactionManager(source), null,
                    employees, sessions.getMapper(HrAuditLogMapper.class), json, null);
            com.cloudflow.hr.service.HrReferralProgressService progress = new com.cloudflow.hr.service.HrReferralProgressService(
                    sessions.getMapper(com.cloudflow.hr.mapper.HrEmployeeReferralMapper.class), candidates, employees, null, support);
            HrTypedCrudService crud = new HrTypedCrudService(application, json, employees, null, null, sessions.getMapper(HrAuditLogMapper.class), null, identities, progress, null, null);
            HrResumeParserServiceImpl parser = new HrResumeParserServiceImpl(parsed, candidates, json, identities);
            UserContext.setTenantId(100000L); UserContext.setUserId(1L); UserContext.setUserName("capacity-check"); TenantContext.setTenantId(100000L);
            UserContext.setDsType(0);
            TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
            try {
                transaction.executeWithoutResult(status -> {
                    String email = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
                    String phone = "+123456789012345";
                    HrRecruitmentContacts.Contacts contact = HrRecruitmentContacts.normalize(100000L, phone, email, true);
                    String directPhone = "+223456789012345"; String directEmail = "z" + email.substring(1);
                    HrCandidatePayload direct = new HrCandidatePayload(); direct.setName("真实保存容量核验"); direct.setPhone(directPhone); direct.setEmail(directEmail);
                    Long directId = crud.create(HrCandidate.class, direct);
                    equal(directPhone, candidates.selectById(directId).getPhone(), "typed creation keeps full phone with sensitive module");
                    equal(directEmail, candidates.selectById(directId).getEmail(), "typed creation keeps full email with sensitive module");
                    equal(directPhone, crud.toInternalMap(direct).get("phone"), "onboarding internal phone preserved");
                    equal(directEmail, crud.toInternalMap(direct).get("email"), "onboarding internal email preserved");
                    equal(false, phone.equals(crud.toMap(direct).get("phone")), "ordinary phone projection still masked");
                    equal(false, email.equals(crud.toMap(direct).get("email")), "ordinary email projection still masked");
                    direct.setPhone("+12025550123"); direct.setEmail("person.name+tag@example.test"); direct.setStatus("SCREENING"); direct.setVersion(0);
                    crud.update(HrCandidate.class, directId, direct);
                    equal(direct.getPhone(), candidates.selectById(directId).getPhone(), "typed update keeps full phone");
                    equal(direct.getEmail(), candidates.selectById(directId).getEmail(), "typed update keeps full email");
                    HrCandidate candidate = new HrCandidate(); candidate.setTenantId(100000L); candidate.setName("容量核验候选人"); candidate.setDeleted(0);
                    equal(1, candidates.insert(candidate), "empty candidate created");
                    Long parsedId = parser.parseResume(candidate.getId(), null, "手机：" + contact.phone() + "\n邮箱：" + contact.email());
                    HrResumeParsedFields result = parsed.selectById(parsedId);
                    equal(email, result.getParsedEmail(), "full email parsed"); equal(phone, result.getParsedPhone(), "full phone parsed");
                    parser.confirmParsed(parsedId);
                    HrCandidate filled = candidates.selectById(candidate.getId());
                    equal(email, filled.getEmail(), "candidate full email"); equal(phone, filled.getPhone(), "candidate full phone");
                    equal("CONFIRMED", parsed.selectById(parsedId).getReviewStatus(), "parsed confirmed");
                    UserCreateDTO transfer = new UserCreateDTO(); transfer.setTenantId(100000L); transfer.setUserName("capacity_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
                    transfer.setNickName(filled.getName()); transfer.setEmail(filled.getEmail()); transfer.setPhonenumber(filled.getPhone());
                    equal(false, email.equals(json.valueToTree(transfer).path("email").asText()), "ordinary account payload still masked");
                    SysUser account = json.convertValue(MessagePayloadCodec.internalTree(transfer, json), SysUser.class); account.setDeleted(0);
                    equal(1, users.insert(account), "account stored");
                    SysUser restored = users.selectById(account.getUserId());
                    equal(email, restored.getEmail(), "account full email"); equal(phone, restored.getPhonenumber(), "account full phone");
                    HrEmployee employee = new HrEmployee(); employee.setTenantId(100000L); employee.setUserId(account.getUserId());
                    employee.setEmployeeNo(transfer.getUserName()); employee.setName(filled.getName()); employee.setGender("UNKNOWN"); employee.setDeleted(0);
                    employee.setEmail(filled.getEmail()); employee.setPhone(filled.getPhone());
                    equal(1, employees.insert(employee), "employee encrypted write");
                    equal(email, employee.getEmail(), "input email restored after encryption"); equal(phone, employee.getPhone(), "input phone restored after encryption");
                    equal(344, jdbc.queryForObject("SELECT CHAR_LENGTH(email) FROM hr_employee WHERE id=?", Integer.class, employee.getId()), "full email ciphertext length");
                    equal(44, jdbc.queryForObject("SELECT CHAR_LENGTH(phone) FROM hr_employee WHERE id=?", Integer.class, employee.getId()), "full phone ciphertext length");
                    equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_employee WHERE id=? AND (email=? OR phone=?)", Integer.class, employee.getId(), email, phone), "plaintext absent");
                    HrEmployee decrypted = employees.selectById(employee.getId());
                    equal(email, decrypted.getEmail(), "employee full email decrypted"); equal(phone, decrypted.getPhone(), "employee full phone decrypted");
                    HrResumeParsedFieldsPayload revision = new HrResumeParsedFieldsPayload();
                    revision.setParsedEmail("Person.Name+Tag@EXAMPLE.TEST"); revision.setParsedPhone("+1 (202) 555-0123");
                    parser.updateParsed(parsedId, revision);
                    HrResumeParsedFields revised = parsed.selectById(parsedId);
                    equal("person.name+tag@example.test", revised.getParsedEmail(), "reviewed email normalized");
                    equal("+12025550123", revised.getParsedPhone(), "reviewed phone normalized");
                    parser.confirmParsed(parsedId);
                    equal(email, candidates.selectById(candidate.getId()).getEmail(), "manual candidate email preserved");
                    equal(phone, candidates.selectById(candidate.getId()).getPhone(), "manual candidate phone preserved");
                    revision.setParsedPhone("13812345678");
                    rejects(IllegalArgumentException.class, () -> parser.updateParsed(parsedId, revision));
                    equal("+12025550123", parsed.selectById(parsedId).getParsedPhone(), "invalid edit unchanged");
                    parser.parseResume(candidate.getId(), null, "手机：13812345678\n邮箱：" + email + "e");
                    HrResumeParsedFields invalid = parsed.selectById(parsedId);
                    equal(null, invalid.getParsedPhone(), "country not guessed"); equal(null, invalid.getParsedEmail(), "overlong email not truncated");
                    equal(true, invalid.getRawText().contains("13812345678"), "unrecognized phone retained in raw text");
                    rejects(DataIntegrityViolationException.class, () -> jdbc.update("UPDATE hr_candidate SET email=? WHERE id=?", email + "e", candidate.getId()));
                    rejects(DataIntegrityViolationException.class, () -> jdbc.update("UPDATE hr_resume_parsed_fields SET parsed_email=? WHERE id=?", email + "e", parsedId));
                    rejects(DataIntegrityViolationException.class, () -> jdbc.update("UPDATE sys_user SET email=? WHERE user_id=?", email + "e", account.getUserId()));
                    rejects(DataIntegrityViolationException.class, () -> jdbc.update("UPDATE sys_user SET phonenumber=? WHERE user_id=?", phone + "6", account.getUserId()));
                    equal(email, users.selectById(account.getUserId()).getEmail(), "oversized account update rejected intact");
                    status.setRollbackOnly();
                });
            } finally { UserContext.clear(); TenantContext.clear(); }
            System.out.println("H2_CONTACT_CAPACITY_DATABASE: checks=" + checks + "; failed=0; real_mysql=true; real_mappers=true; actual_resume_service=true; actual_field_encryption=true; account_transport=json_contract; actual_onboarding_http=false; fixture_transaction_rolled_back=true; contact_output=0");
        }
    }

    private static void equal(Object expected, Object actual, String label) {
        checks++;
        if (!Objects.equals(expected, actual)) throw new AssertionError(label);
    }

    private static void rejects(Class<? extends RuntimeException> expected, Runnable action) {
        checks++;
        try { action.run(); }
        catch (RuntimeException failure) {
            if (expected.isInstance(failure)) return;
            throw new AssertionError("Unexpected failure type: " + failure.getClass().getSimpleName());
        }
        throw new AssertionError("Expected validation rejection");
    }
}
