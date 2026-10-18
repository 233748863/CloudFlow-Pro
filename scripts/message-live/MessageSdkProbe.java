package com.cloudflow.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.constant.MessageCategory;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.List;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Calls the production SDK and Mapper against this round's owned database. */
public final class MessageSdkProbe {
    public static void main(String[] arguments) throws Exception {
        Path run = Path.of(arguments[0]).toRealPath();
        if (!run.getParent().getFileName().toString().equals("batch-g-integration")
                || !run.getFileName().toString().matches("[a-f0-9]{32}")
                || run.getFileName().toString().equals("9799534e1a3a47b5958330f14ae16dc7")) {
            throw new IllegalArgumentException("Owned integration directory required");
        }
        ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
        Map<String, Object> settings = json.readValue(Files.readString(run.resolve("private/probe.json")),
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() { });
        String url = (String) settings.get("jdbcUrl");
        if (!url.startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Loopback required");
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        JdbcTemplate jdbc = new JdbcTemplate(source);
        if (!Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath()
                .equals(run.resolve("mysql-data").toRealPath())) throw new IllegalStateException("Datadir mismatch");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMapper(OutboxEventMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setMapperLocations(new FileSystemResource((String) settings.get("mapper")));
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("owned-probe", Map.of(
                "spring.application.name", "cloudflow-a2-probe",
                "cloudflow.message.secret-key", settings.get("messageSecret"))));
        MessageSender sender = new MessageAutoConfiguration().messageSender(
                new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json), json, environment);
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        UserContext.setTenantId(100000L);
        UserContext.setUserId(990000701L);
        String mode = arguments[1];
        int count = Integer.parseInt(arguments[2]);
        for (int index = 0; index < count; index++) {
            String title = arguments[3] + "-" + index;
            Long receiver = mode.equals("center-other") ? 990000702L : 990000701L;
            MessageSendRequest request = MessageSendRequest.legacy(receiver, title,
                    "A2 independent delivery verification", "SYSTEM", 990000701L, "A2 probe").toBuilder()
                    .bizId(title).deduplicationKey(title).forceSend(true)
                    .scheduleTime(mode.equals("lease") || mode.equals("scheduled") ? LocalDateTime.now().plusMinutes(2) : null).build();
            if (mode.equals("center") || mode.equals("center-other")) {
                MessageCategory[] categories = {MessageCategory.TODO, MessageCategory.CC,
                        MessageCategory.ANNOUNCEMENT, MessageCategory.SYSTEM, MessageCategory.BIZ_REMINDER};
                request = request.toBuilder().category(categories[index % categories.length])
                        .linkUrl("/approval/detail/301?from=message#history").build();
            }
            if (mode.equals("sms")) {
                request = request.toBuilder().channelTypes(List.of(MessageChannelType.SMS)).build();
            }
            if (mode.startsWith("subscription-")) {
                MessageCategory category = mode.equals("subscription-disabled") || mode.equals("subscription-forced")
                        ? MessageCategory.TODO : mode.equals("subscription-equal") ? MessageCategory.CC : MessageCategory.SYSTEM;
                request = request.toBuilder().category(category).forceSend(mode.equals("subscription-forced"))
                        .bizId(null).build();
            }
            MessageSendRequest message = request;
            transaction.execute(status -> {
                if (mode.equals("rollback")) jdbc.update("UPDATE sys_user SET nick_name=? WHERE user_id=990000701", title);
                sender.send(message);
                if (mode.equals("rollback")) status.setRollbackOnly();
                return null;
            });
        }
        System.out.println("A2_SDK_PROBE: mode=" + mode + "; sent=" + count);
    }
}
