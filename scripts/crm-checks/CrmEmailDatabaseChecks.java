package com.cloudflow.crm.service.email;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.controller.inner.InnerMessageDeliveryController;
import com.cloudflow.auth.mapper.*;
import com.cloudflow.auth.message.*;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeInnerInterceptor;
import com.cloudflow.common.datascope.RedisDataScopeHandle;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.api.*;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.cloudflow.crm.domain.dto.CrmMassEmailDraft;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.impl.*;
import com.cloudflow.crm.service.remote.CrmMessageDeliveryClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class CrmEmailDatabaseChecks {
    static final long TENANT = 100000L;
    static final String KEY = "e5-database-test-key-at-least-32-characters";
    static final String HTML = "<p>您好，{{contactName}}，${companyName}，{{campaignName}}</p><a href='https://example.com/offer?a=1&amp;b=2'>详情</a>"
            + "<a href='https://example.com/offer?a=1&amp;b=2'>再次查看</a><a href='https://example.com/terms'>条款</a><img src='https://example.com/logo.png'>";
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules().registerModule(new com.fasterxml.jackson.databind.module.SimpleModule("production-sensitive-module")
            .setSerializerModifier(new com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier()));
    final MessageSecretCipher cipher = new MessageSecretCipher(KEY);
    final JdbcTemplate jdbc;
    final DataSourceTransactionManager manager;
    final TransactionTemplate transactions;
    final SqlSessionTemplate sessions;
    final CrmEmailSmtpFixture smtp;
    final CrmEmailAccessService access;
    final CrmEmailAudienceService audience;
    final CrmTargetListService targetLists;
    final CrmEmailPolicyService policies;
    final CrmEmailSnapshotService snapshots;
    final CrmEmailStatisticsService statistics;
    final CrmCampaignDeliveryService campaigns;
    final CrmEmailTrackingService tracking;
    final CrmEmailMessageSourceService source;
    final MessageDeliveryService deliveries;
    final MessageDispatchService dispatch;
    final MessageSender publisher;
    final InnerMessageDeliveryController messageApi;
    final AtomicInteger checks = new AtomicInteger();
    final Map<Long, MessageDeliverySnapshot> capturedReads = new HashMap<>();
    final Map<Long, Integer> sourceCalls = new HashMap<>();
    final Set<String> consumed = new HashSet<>();
    Runnable boundaryAction;
    boolean boundaryUnavailable;
    int concurrentGroups;

    public static void main(String[] arguments) throws Exception {
        try (CrmEmailSmtpFixture smtp = new CrmEmailSmtpFixture(Path.of(arguments[2]), System.getenv("CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD"))) {
            CrmEmailDatabaseChecks suite = new CrmEmailDatabaseChecks(arguments[0], Path.of(arguments[1]), Path.of(arguments[3]), smtp);
            try {
                CrmEmailChannelDatabaseChecks.run(suite);
                CrmEmailExportAuditDatabaseChecks.run(suite);
                CrmEmailFlowDatabaseChecks.run(suite);
                CrmEmailBoundaryDatabaseChecks.run(suite);
                CrmEmailCampaignArchiveDatabaseChecks.run(suite);
                suite.check(smtp.failures().isEmpty(), "TLS protocol fixture has no unexpected failures");
                suite.equal(0L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE email_encrypted='PENDING'"), "no committed placeholder addresses");
                System.out.println("E5_DATABASE_CHECKS: assertions=" + suite.checks.get() + "; failed=0; concurrent_groups=" + suite.concurrentGroups
                        + "; mysql=true; tenant_scope_sql=true; transactions=true; real_starttls=true; captured_messages=" + smtp.count()
                        + "; interservice_bridge=local_production_methods; http=false; official_provider_contacted=false; production_modified=false");
            } finally { UserContext.clear(); TenantContext.clear(); }
        }
    }

    CrmEmailDatabaseChecks(String url, Path mapperList, Path expectedData, CrmEmailSmtpFixture smtp) throws Exception {
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/crm_email_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("OWNED_DATABASE_REQUIRED");
        DriverManagerDataSource database = new DriverManagerDataSource(url, "root", ""); jdbc = new JdbcTemplate(database);
        Path actualData = Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath();
        if (!actualData.equals(expectedData.toRealPath()) || !actualData.toString().replace('\\', '/').contains("/.cloudflow-runtime/batch-g-integration/")) {
            throw new IllegalArgumentException("OWNED_DATA_DIRECTORY_REQUIRED");
        }
        this.smtp = smtp;
        manager = new DataSourceTransactionManager(database); transactions = new TransactionTemplate(manager);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true); configuration.setCacheEnabled(false); configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig(); global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.crm.mapper");
        for (Class<?> mapper : List.of(SysMessageDeliveryMapper.class, SysMessageRecordMapper.class, SysMessageChannelMapper.class,
                SysMessageTemplateMapper.class, SysMessageSubscribeMapper.class, SysUserMapper.class, SysUserRoleMapper.class, SysDeptMapper.class,
                OutboxEventMapper.class, SysAuditLogMapper.class)) configuration.addMapper(mapper);
        MybatisPlusInterceptor interceptor = new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor();
        ArrayList<InnerInterceptor> filters = new ArrayList<>(interceptor.getInterceptors());
        filters.add(filters.size() - 1, new DataScopeInnerInterceptor(new RedisDataScopeHandle(null)));
        interceptor.setInterceptors(filters);
        configuration.addInterceptor(interceptor);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(database);
        factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        List<Resource> resources = new ArrayList<>();
        for (String file : Files.readAllLines(mapperList)) resources.add(new FileSystemResource(file));
        resources.add(new ClassPathResource("mapper/report/ReportSqlMapper.xml"));
        factory.setMapperLocations(resources.toArray(Resource[]::new));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        identity(10L); seed();
        OutboxPublisher outbox = new OutboxPublisher(mapper(OutboxEventMapper.class), json);
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("e5-database", Map.of("spring.application.name", "cloudflow-service-crm", "cloudflow.message.secret-key", KEY)));
        publisher = new MessageAutoConfiguration().messageSender(outbox, json, environment);
        CrmReferenceService references = new CrmReferenceService(mapper(CrmCustomerMapper.class), mapper(CrmOpportunityMapper.class), mapper(CrmLeadMapper.class),
                mapper(CrmServiceTicketMapper.class), mapper(CrmQuoteMapper.class), mapper(CrmContactMapper.class), null, null);
        CrmTerritoryService territories = new CrmTerritoryService(mapper(CrmTerritoryMapper.class), mapper(CrmCustomerMapper.class), mapper(CrmLeadMapper.class), references);
        CrmAudienceService candidates = new CrmAudienceService(mapper(CrmCustomerMapper.class), mapper(CrmLeadMapper.class), mapper(CrmContactMapper.class), territories);
        targetLists = proxied(new CrmTargetListService(mapper(CrmTargetListMapper.class), mapper(CrmTargetListMemberMapper.class), mapper(CrmCampaignTargetListMapper.class), candidates, references, json,
                proxied(new CrmAuditTrail(mapper(SysAuditLogMapper.class)))));
        access = new CrmEmailAccessService(mapper(CrmEmailAccessMapper.class));
        audience = new CrmEmailAudienceService(mapper(CrmCampaignTargetListMapper.class), mapper(CrmTargetListMapper.class), targetLists, candidates, mapper(CrmEmailSuppressionMapper.class));
        policies = new CrmEmailPolicyService(mapper(CrmEmailPolicyMapper.class));
        CrmEmailContentService content = new CrmEmailContentService(json);
        snapshots = new CrmEmailSnapshotService(mapper(CrmMassEmailRecipientMapper.class), mapper(CrmEmailTrackingLinkMapper.class), new CrmEmailSnapshotCodec(cipher, json), content, json);
        statistics = proxied(new CrmEmailStatisticsService(mapper(CrmCampaignLogMapper.class), mapper(CrmCampaignMapper.class), mapper(CrmMassEmailMapper.class), mapper(CrmMassEmailRecipientMapper.class), json));
        CrmMessageDeliveryClient client = new CrmMessageDeliveryClient() {
            public R<List<MessageEmailTemplateChoice>> templates() { return messageApi.crmTemplates(); }
            public R<MessageEmailTemplate> template(String code) {
                try {
                    JsonNode response = json.readTree(json.writeValueAsBytes(messageApi.crmTemplate(code)));
                    return R.ok(json.treeToValue(response.path("data"), MessageEmailTemplate.class));
                } catch (Exception failure) { throw new IllegalStateException("Template transport serialization failed", failure); }
            }
            public R<MessageDeliverySnapshot> snapshot(Long recordId) {
                return R.ok(capturedReads.containsKey(recordId) ? capturedReads.get(recordId) : deliveries.businessSnapshot(TENANT, recordId, "cloudflow-service-crm"));
            }
        };
        campaigns = new CrmCampaignDeliveryService(mapper(CrmMassEmailMapper.class), mapper(CrmMassEmailRecipientMapper.class), mapper(CrmCampaignMapper.class),
                mapper(CrmEmailSuppressionMapper.class), access, audience, policies, content, snapshots, statistics, client, publisher, transactions, json);
        source = new CrmEmailMessageSourceService(mapper(CrmMassEmailRecipientMapper.class), mapper(CrmMassEmailMapper.class), mapper(CrmCampaignMapper.class),
                mapper(CrmEmailSuppressionMapper.class), snapshots, policies, access, audience, statistics, client, transactions, json);
        tracking = new CrmEmailTrackingService(mapper(CrmMassEmailRecipientMapper.class), mapper(CrmEmailTrackingLinkMapper.class), mapper(CrmEmailSuppressionMapper.class), policies, statistics, transactions);
        CrmMessageDeliverySourceGuard guard = new CrmMessageDeliverySourceGuard(new com.cloudflow.auth.service.remote.RemoteCrmMessageSourceService() {
            @Override public R<List<com.cloudflow.common.message.api.MessageAttachment>> attachments(com.fasterxml.jackson.databind.JsonNode document) { return R.ok(List.of()); }
            @Override public R<MessageSourceResult> verify(com.fasterxml.jackson.databind.JsonNode document) {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "CRM source checked outside auth transaction");
            try {
                MessageSourceCheck request = json.treeToValue(document, MessageSourceCheck.class);
                int count = sourceCalls.merge(request.recordId(), 1, Integer::sum);
                if (count % 3 == 0) {
                    if (boundaryAction != null) { Runnable operation = boundaryAction; boundaryAction = null; operation.run(); }
                    if (boundaryUnavailable) return R.ok(new MessageSourceResult(false, "SOURCE_UNAVAILABLE"));
                }
                return R.ok(source.verify(request));
            } catch (RuntimeException failure) { throw failure; }
            catch (Exception invalid) { throw new IllegalStateException(invalid); }
            }
        }, json);
        String addresses = Arrays.stream(InetAddress.getAllByName("localhost")).map(InetAddress::getHostAddress).collect(java.util.stream.Collectors.joining(","));
        EmailChannelSender email = new EmailChannelSender(mapper(SysMessageChannelMapper.class), mapper(SysUserMapper.class), cipher, new SmtpEndpointPolicy("localhost", addresses, String.valueOf(smtp.port())));
        MessageChannelSenderFactory senders = new MessageChannelSenderFactory(List.of(email));
        deliveries = new MessageDeliveryService(mapper(SysMessageDeliveryMapper.class), mapper(SysMessageRecordMapper.class), mapper(SysMessageChannelMapper.class),
                mapper(SysMessageTemplateMapper.class), mapper(SysMessageSubscribeMapper.class), mapper(SysUserMapper.class), senders, cipher, json,
                manager, List.of(guard), outbox, mapper(SysAuditLogMapper.class));
        dispatch = new MessageDispatchService(json, mapper(SysMessageChannelMapper.class), mapper(SysMessageTemplateMapper.class), mapper(SysMessageRecordMapper.class),
                mapper(SysMessageSubscribeMapper.class), mapper(SysUserMapper.class), mapper(SysUserRoleMapper.class), mapper(SysDeptMapper.class), senders, cipher, publisher, null, deliveries, manager);
        messageApi = new InnerMessageDeliveryController(mapper(SysMessageChannelMapper.class), mapper(SysMessageTemplateMapper.class), email, deliveries, json);
    }

    private void seed() {
        for (long tenant : List.of(TENANT, TENANT + 1)) jdbc.update("INSERT INTO sys_tenant (tenant_id,tenant_code,tenant_name,status,deleted) VALUES (?,?,?,'0',0)", tenant, "e5-" + tenant, "E5 " + tenant);
        jdbc.update("INSERT INTO sys_dept (dept_id,tenant_id,dept_name,status,deleted) VALUES (100,?,'E5','0',0)", TENANT);
        for (long role : List.of(1L, 5L, 9L)) jdbc.update("INSERT INTO sys_role (role_id,tenant_id,role_name,role_key,role_sort,ds_type,status,deleted) VALUES (?,?,?,?,1,?,'0',0)", role, TENANT, "E5 " + role, role == 1 ? "admin" : "e5_" + role, role == 1 ? 0 : 4);
        for (long user : List.of(1L, 5L, 10L, 11L)) {
            jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES (?,?,100,?,?,'0',0)", user, TENANT, "e5-" + user, "E5 " + user);
            jdbc.update("INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (?,?,?)", TENANT, user, user == 1 || user == 5 ? user : 9L);
        }
        jdbc.update("INSERT INTO sys_menu (menu_id,menu_name,perms,status,menu_type) VALUES (1615,'E5 Send','crm:campaign:send','0','F')");
        jdbc.update("INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (?,9,1615)", TENANT);
        jdbc.update("INSERT INTO sys_message_channel (channel_id,tenant_id,channel_code,channel_name,channel_type,status,implemented_flag,priority,retry_count,retry_interval_sec,smtp_host,smtp_port,smtp_ssl_flag,smtp_username,smtp_pwd_cipher,from_address,from_name,deleted,version) VALUES (100,?,'e5','E5','EMAIL','ENABLED',1,10,0,1,'localhost',?,0,'fixture-user',?,'sender@example.com','CloudFlow',0,0)", TENANT, smtp.port(), cipher.encrypt("fixture-password"));
        jdbc.update("INSERT INTO sys_message_template (template_id,tenant_id,template_code,template_name,biz_module,channel_type,content_template,params_declare,force_send_flag,status,deleted,version) VALUES (100,?,'CRM_MARKETING','E5','crm','EMAIL',?,'[]',0,'ENABLED',0,0)", TENANT, HTML);
        setting("crm.email.sendingEnabled", "true"); setting("crm.email.trackingEnabled", "true");
        setting("crm.email.publicOrigin", "https://mail.example.com"); setting("crm.email.allowedHosts", "example.com"); setting("crm.email.confirmationThreshold", "5000");
    }

    void setting(String key, String value) {
        int changed = jdbc.update("UPDATE sys_config SET config_value=? WHERE tenant_id=? AND config_scope='1' AND config_key=?", value, TENANT, key);
        if (changed == 0 && scalar("SELECT COUNT(*) FROM sys_config WHERE tenant_id=? AND config_scope='1' AND config_key=?", TENANT, key) == 0) {
            jdbc.update("INSERT INTO sys_config (tenant_id,config_name,config_key,config_value,config_scope) VALUES (?,?,?,?,'1')", TENANT, key, key, value);
        }
    }
    void identity(long user) { TenantContext.clear(); UserContext.clear(); TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT); UserContext.setUserId(user); UserContext.setUserName("e5-" + user); }
    <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }
    @SuppressWarnings("unchecked")
    <Type> Type proxied(Type target) {
        ProxyFactory factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource())); return (Type) factory.getProxy();
    }
    long scalar(String sql, Object... values) { return jdbc.queryForObject(sql, Long.class, values); }
    void check(boolean value, String label) { checks.incrementAndGet(); if (!value) throw new AssertionError(label); }
    void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + " expected=" + expected + " actual=" + actual); }
    void rejects(Runnable operation, String label) { try { operation.run(); } catch (RuntimeException rejected) { check(true, label); return; } throw new AssertionError(label); }
    CrmCampaign campaign(String label) {
        CrmCampaign campaign = new CrmCampaign(); campaign.setCampaignCode("E5-" + UUID.randomUUID()); campaign.setCampaignName(label); campaign.setCampaignType("EMAIL");
        campaign.setStatus("ACTIVE"); campaign.setOwnerId(UserContext.getUserId()); campaign.setStartDate(LocalDate.now()); campaign.setEndDate(LocalDate.now().plusDays(1));
        CrmRecordSupport.create(campaign, "campaignId"); mapper(CrmCampaignMapper.class).insert(campaign); return mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId());
    }
    CrmLead lead(String label, String address, long owner, int optedOut) {
        CrmLead lead = new CrmLead(); lead.setLeadNo("E5-" + UUID.randomUUID()); lead.setLeadName(label); lead.setContactName(label); lead.setCompanyName("Company " + label); lead.setEmail(address);
        lead.setOwnerId(owner); lead.setDeptId(100L); lead.setStatus("NEW"); lead.setUnsubscribeFlag(optedOut);
        CrmRecordSupport.create(lead, "leadId"); mapper(CrmLeadMapper.class).insert(lead); return lead;
    }
    CrmTargetList list(CrmCampaign campaign, boolean excluded, CrmLead... selected) {
        CrmTargetList list = new CrmTargetList(); list.setListCode("E5-" + UUID.randomUUID()); list.setListName("E5 List"); list.setOwnerId(UserContext.getUserId()); list.setSourceType("MANUAL"); list.setStatus("ACTIVE");
        CrmRecordSupport.create(list, "listId"); mapper(CrmTargetListMapper.class).insert(list);
        for (CrmLead lead : selected) {
            CrmTargetListMember member = new CrmTargetListMember(); member.setListId(list.getListId()); member.setMemberType("LEAD"); member.setMemberRefId(lead.getLeadId()); member.setMemberName(lead.getLeadName());
            CrmRecordSupport.create(member, "memberId"); mapper(CrmTargetListMemberMapper.class).insert(member);
        }
        CrmCampaignTargetList relation = new CrmCampaignTargetList(); relation.setCampaignId(campaign.getCampaignId()); relation.setListId(list.getListId()); relation.setIsExcludingFlag(excluded ? 1 : 0);
        CrmRecordSupport.create(relation, "relationId"); mapper(CrmCampaignTargetListMapper.class).insert(relation); return list;
    }
    CrmMassEmail draft(CrmCampaign campaign) { return campaigns.save(new CrmMassEmailDraft(null, campaign.getCampaignId(), null, "{{contactName}} · {{campaignName}}", "CRM_MARKETING", null, null, null)); }
    CrmMassEmail task(Long id) { return mapper(CrmMassEmailMapper.class).selectById(id); }
    CrmMassEmailRecipient recipient(Long id) { return mapper(CrmMassEmailRecipientMapper.class).selectById(id); }
    List<CrmMassEmailRecipient> recipients(Long id) { return mapper(CrmMassEmailRecipientMapper.class).selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CrmMassEmailRecipient>().eq(CrmMassEmailRecipient::getMassEmailId, id).orderByAsc(CrmMassEmailRecipient::getRecipientId)); }
    CrmMassEmailCommand command(CrmMassEmail task, LocalDateTime schedule, String email) {
        Map<String, Object> preview = campaigns.preview(task.getMassEmailId());
        return new CrmMassEmailCommand((Integer) preview.get("version"), (String) preview.get("previewDigest"), true, (Integer) preview.get("recipientCount"), schedule, email);
    }
    void send(CrmMassEmail task) { campaigns.send(task.getMassEmailId(), command(task, null, null)); }
    BusinessEventEnvelope envelope(String value) { try { return json.readValue(value, BusinessEventEnvelope.class); } catch (Exception failure) { throw new IllegalStateException(failure); } }
    void pump() throws Exception {
        for (String value : jdbc.queryForList("SELECT payload_json FROM outbox_event WHERE tenant_id=? AND event_type='MESSAGE_SEND' ORDER BY id", String.class, TENANT)) {
            BusinessEventEnvelope event = envelope(value); if (consumed.add(event.getEventId())) dispatch.dispatch(event);
        }
        outcomes();
    }
    void outcomes() throws Exception {
        for (String value : jdbc.queryForList("SELECT payload_json FROM outbox_event WHERE tenant_id=? AND event_type='MESSAGE_DELIVERY_RESULT' ORDER BY id", String.class, TENANT)) {
            BusinessEventEnvelope event = envelope(value); if (consumed.add(event.getEventId())) source.deliveryEvent(event);
        }
    }
    List<String> tokens(CrmMassEmailRecipient recipient, String purpose) {
        Matcher matcher = java.util.regex.Pattern.compile("/crm/track/" + purpose + "\\?token=([A-Za-z0-9_-]{43})").matcher(snapshots.request(recipient).getContent());
        List<String> tokens = new ArrayList<>(); while (matcher.find()) if (!tokens.contains(matcher.group(1))) tokens.add(matcher.group(1)); return tokens;
    }
}
