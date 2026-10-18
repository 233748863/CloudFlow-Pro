package com.cloudflow.auth.storage;

import com.cloudflow.auth.config.FileStorageStartupValidator;
import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.domain.vo.SysMessageChannelVO;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileConfigMapper;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.auth.service.impl.SysFileServiceImpl;
import com.cloudflow.auth.storage.impl.OssFileStorageService;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.oss.properties.OssProperties;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.Banner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.util.List;

public class FileStorageChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        check(FileStorageType.values().length == 5, "five storage types");
        check(FileStorageType.fromValue(null) == FileStorageType.LOCAL, "default local");
        check(FileStorageType.fromValue("minio") == FileStorageType.MINIO, "MinIO parsing");
        rejects(() -> FileStorageType.fromValue("unknown"), "unknown provider fails closed");
        OssProperties properties = new OssProperties();
        check("0".equals(properties.getAccessPolicy()), "private default");
        StandardEnvironment environment = new StandardEnvironment();
        new YamlPropertySourceLoader().load("auth-yaml", new ClassPathResource("application.yml"))
                .forEach(source -> environment.getPropertySources().addLast(source));
        check("cloudflow-auth".equals(environment.getProperty("spring.application.name")), "default YAML comes from auth module");
        AuthOssProperties configured = Binder.get(environment).bind("cloudflow.oss", Bindable.of(AuthOssProperties.class)).get();
        check("0".equals(configured.getAccessPolicy()), "packaged YAML preserves private default after property binding");
        properties.requirePrivateAccess();
        for (String policy : new String[]{"1", "2", "", "private"}) {
            properties.setAccessPolicy(policy);
            rejects(properties::requirePrivateAccess, "reject policy " + policy);
        }
        FileStorageSecretCipher cipher = new FileStorageSecretCipher("batch-g-test-encryption-key-32-characters");
        String encrypted = cipher.encrypt("storage-secret-for-test");
        check(!encrypted.contains("storage-secret-for-test"), "secret encrypted");
        check("storage-secret-for-test".equals(cipher.decrypt(encrypted)), "secret round trip");
        check(!encrypted.equals(cipher.encrypt("storage-secret-for-test")), "random encryption nonce");
        rejects(() -> cipher.decrypt(encrypted.substring(3)), "tampering rejected");
        rejects(() -> new FileStorageSecretCipher("").encrypt("secret"), "missing encryption key rejected");
        MessageSecretCipher messageCipher = new MessageSecretCipher("batch-message-test-encryption-key-32-characters");
        String messageSecret = "channel-secret-for-test-4567";
        String messageEncrypted = messageCipher.encrypt(messageSecret);
        check(!messageEncrypted.contains(messageSecret), "nonempty channel secret encrypted");
        check(messageSecret.equals(messageCipher.decrypt(messageEncrypted)), "channel secret round trip");
        check(!messageEncrypted.equals(messageCipher.encrypt(messageSecret)), "channel encryption uses random nonce");
        rejects(() -> messageCipher.decrypt(messageEncrypted.substring(3)), "channel ciphertext tampering rejected");
        rejects(() -> new MessageSecretCipher("").encrypt(messageSecret), "missing channel encryption key rejected");
        rejects(() -> new MessageSecretCipher("different-message-test-encryption-key-32-characters")
                .decrypt(messageEncrypted), "wrong channel encryption key rejected");
        MessageSecretCipher secretMasker = new MessageSecretCipher("unused-for-masking");
        check("****4567".equals(secretMasker.mask("test-secret-4567")), "nonempty channel secret reveals only last four characters");
        check("****".equals(secretMasker.mask("abc")), "short channel secret is fully masked");
        check(secretMasker.mask(null) == null, "absent channel secret stays absent");
        SimpleModule sensitiveModule = new SimpleModule();
        sensitiveModule.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper sensitiveJson = new ObjectMapper().registerModule(sensitiveModule);
        SysMessageChannelVO channelView = new SysMessageChannelVO();
        channelView.setApiSecret(secretMasker.mask("test-secret-4567"));
        channelView.setSmtpPwd(secretMasker.mask("smtp-secret-ABCD"));
        JsonNode channelTree = sensitiveJson.valueToTree(channelView);
        check("****4567".equals(channelTree.path("apiSecret").asText()), "actual global JSON serialization preserves channel secret last four characters");
        check("****ABCD".equals(channelTree.path("smtpPwd").asText()), "actual global JSON serialization preserves SMTP password last four characters");
        String loggedView = new ObjectMapper().writeValueAsString(SensitiveUtils.maskObject(channelView));
        check(!loggedView.contains("4567") && !loggedView.contains("ABCD"), "log masking still fully hides secrets despite response-specific suffix policy");
        channelView.setApiSecret("unexpected-raw-secret-WXYZ");
        channelView.setSmtpPwd("abc");
        channelTree = sensitiveJson.valueToTree(channelView);
        check("****WXYZ".equals(channelTree.path("apiSecret").asText()), "response serializer masks unprocessed secret defensively");
        check("****".equals(channelTree.path("smtpPwd").asText()), "response serializer fully masks short secret");
        channelView.setApiSecret(null); channelView.setSmtpPwd("");
        channelTree = sensitiveJson.valueToTree(channelView);
        check(channelTree.path("apiSecret").isNull() && channelTree.path("smtpPwd").asText().isEmpty(), "response serialization preserves null and empty secret markers");

        new CloudFlowConfig().setProfile(Path.of(System.getProperty("java.io.tmpdir"), "cloudflow-g-file-checks").toString());
        SysFileConfig config = validConfiguration();
        FileStorageRules.validate(config);
        checks++;
        config.setBasePath("../outside");
        SysFileConfig invalidLocal = config;
        rejects(() -> FileStorageRules.validate(invalidLocal), "local traversal rejected");
        rejects(() -> FileStorageRules.localFile("../../outside"), "file traversal rejected");
        config = validConfiguration();
        config.setStorageType("S3");
        config.setEndpoint("https://s3.example.invalid");
        config.setBucket("test-private-bucket");
        config.setRegion("us-east-1");
        config.setAccessKey("test-access-key");
        config.setSecretKeyCipher(encrypted);
        FileStorageRules.validate(config);
        checks++;
        config.setAccessPolicy("1");
        SysFileConfig rejected = config;
        rejects(() -> FileStorageRules.validate(rejected), "database public policy rejected");
        config.setAccessPolicy("0");
        config.setEndpoint("https://user:secret@s3.example.invalid");
        rejects(() -> FileStorageRules.validate(rejected), "endpoint credentials rejected");
        config.setSecretKey("plain-secret");
        String json = new ObjectMapper().writeValueAsString(config);
        check(!json.contains(encrypted) && !json.contains("plain-secret"), "no secret serialization");

        Method guard = SysFileServiceImpl.class.getDeclaredMethod("assertPublicFile", SysFile.class);
        guard.setAccessible(true);
        SysFileServiceImpl files = new SysFileServiceImpl(null, null, null, null, null, null, null);
        SysFile file = new SysFile();
        file.setCreateBy("owner");
        file.setFileType("png");
        try {
            UserContext.setUserName("owner");
            guard.invoke(files, file);
            checks++;
            UserContext.setUserName("other");
            rejects(() -> invoke(guard, files, file), "historical file owner only");
            UserContext.setUserName("owner");
            file.setBizType("UNREGISTERED");
            rejects(() -> invoke(guard, files, file), "unknown business denied");
            file.setBizType(null);
            file.setFileType("HR_GRIEVANCE_EVIDENCE");
            rejects(() -> invoke(guard, files, file), "existing private business guard preserved");
        } finally {
            UserContext.clear();
        }
        startup("0", true);
        startup("1", false);
        startup("2", false);
        System.out.println("Batch G file storage checks passed: " + checks);
    }

    private static SysFileConfig validConfiguration() {
        SysFileConfig config = new SysFileConfig();
        config.setConfigCode("local");
        config.setConfigName("Test local");
        config.setStorageType("LOCAL");
        config.setMasterFlag(1);
        config.setStatus("ENABLED");
        config.setMaxFileSize(52428800L);
        config.setSignedUrlExpireSeconds(300);
        config.setAccessPolicy("0");
        return config;
    }

    private static void invoke(Method method, Object target, Object value) {
        try {
            method.invoke(target, value);
        } catch (InvocationTargetException exception) {
            throw (RuntimeException) exception.getCause();
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError(exception);
        }
    }

    private static void startup(String policy, boolean expected) {
        SpringApplication application = new SpringApplication(StartupTestConfiguration.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setBannerMode(Banner.Mode.OFF);
        application.setLogStartupInfo(false);
        ConfigurableApplicationContext context = null;
        boolean started = false;
        try {
            context = application.run("--test.storage.policy=" + policy, "--logging.level.root=OFF",
                    "--spring.config.location=optional:classpath:/__batch_g_no_config__.properties",
                    "--spring.cloud.nacos.config.enabled=false", "--spring.cloud.bootstrap.enabled=false");
            started = true;
        } catch (RuntimeException exception) {
            Throwable cause = exception;
            while (cause.getCause() != null) cause = cause.getCause();
            check(cause instanceof IllegalStateException && cause.getMessage().contains("accessPolicy=0"), "startup fails for private policy violation");
        } finally {
            if (context != null) context.close();
        }
        check(started == expected, "startup outcome " + policy);
    }

    private static void rejects(Runnable operation, String label) {
        try {
            operation.run();
        } catch (RuntimeException exception) {
            checks++;
            return;
        }
        throw new AssertionError(label);
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    @Configuration(proxyBeanMethods = false)
    public static class StartupTestConfiguration {
        @Bean
        FileStorageStartupValidator validator(@Value("${test.storage.policy}") String policy) {
            AuthOssProperties properties = new AuthOssProperties();
            properties.setEnabled(true);
            properties.setAccessPolicy(policy);
            properties.setEndpoint("s3.example.invalid");
            properties.setBucketName("test-private");
            properties.setAccessKey("test-access");
            properties.setSecretKey("test-secret");
            properties.setRegion("us-east-1");
            FileStorageProperties storage = new FileStorageProperties();
            SysFileConfigMapper mapper = (SysFileConfigMapper) Proxy.newProxyInstance(SysFileConfigMapper.class.getClassLoader(),
                    new Class<?>[]{SysFileConfigMapper.class}, (proxy, method, arguments) -> List.of());
            return new FileStorageStartupValidator(properties, storage, new OssFileStorageService(properties, storage), mapper, null);
        }
    }
}
