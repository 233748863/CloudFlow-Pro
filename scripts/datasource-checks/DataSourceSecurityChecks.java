package com.cloudflow.common.datasource.runtime;

import com.baomidou.dynamic.datasource.DynamicRoutingDataSource;
import com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration;
import com.cloudflow.common.datasource.config.RuntimeDataSourceConfiguration;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.cloudflow.common.datasource.mapper.RuntimeDataSourceMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.net.InetAddress;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.cloud.client.DefaultServiceInstance;
import org.springframework.cloud.client.serviceregistry.Registration;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;

public class DataSourceSecurityChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        network();
        secrets();
        signatures();
        keysAndStoppedRoutes();
        requests();
        instanceIdentity();
        applicationMapperFallback();
        System.out.println("DATASOURCE_SECURITY_CHECKS=" + checks + "; failures=0; real_database_acceptance=false");
    }

    private static void applicationMapperFallback() {
        AutoConfiguration configuration = RuntimeDataSourceConfiguration.class.getAnnotation(AutoConfiguration.class);
        check("运行时Mapper在业务默认Mapper扫描之后加载", configuration != null
                && List.of(configuration.afterName()).contains(MybatisPlusAutoConfiguration.class.getName()));
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(DataSource.class, UnpooledDataSource::new);
            AutoConfigurationPackages.register(context, "com.cloudflow.common.datasource.runtime");
            context.register(MapperFallbackConfiguration.class);
            context.refresh();
            check("没有显式MapperScan的业务仍注册默认Mapper", context.getBean(ApplicationMapperProbe.class) != null);
            check("默认业务Mapper与动态数据源Mapper同时可用", context.getBean(RuntimeDataSourceMapper.class) != null);
        }
    }

    @Mapper
    public interface ApplicationMapperProbe { }

    @Configuration(proxyBeanMethods = false)
    @ImportAutoConfiguration({MybatisPlusAutoConfiguration.class, RuntimeDataSourceConfiguration.class})
    public static class MapperFallbackConfiguration { }

    private static void network() throws Exception {
        DataSourceRuntimeProperties properties = properties();
        AtomicInteger resolutions = new AtomicInteger();
        DataSourceNetworkPolicy policy = new DataSourceNetworkPolicy(properties, host -> {
            resolutions.incrementAndGet();
            return new InetAddress[] {InetAddress.getByAddress(new byte[] {127, 0, 0, 1})};
        });
        String url = "jdbc:mysql://reports.internal:3306/reporting";
        DataSourceNetworkPolicy.Endpoint endpoint = policy.validate(url, "reports_ro");
        check("合法地址只连接已固定的IP", endpoint.pinnedUrl().equals("jdbc:mysql://127.0.0.1:3306/reporting"));
        List<String> invalid = List.of(url + "?allowLoadLocalInfile=true", url + "#fragment",
                url.replace("reports.internal", "root@reports.internal"), url.replace("reports.internal", "reports.internal,other"),
                url.replace("reports.internal", "reports.internal%00.evil"), url.replace("reporting", "../reporting"),
                url.replace("reporting", "reporting/table"), url.replace(":3306", ""), url.replace(":3306", ":65536"),
                url.replace("mysql", "mariadb"), " " + url, url + " ", url + "\n", url.replace("reporting", "%72eporting"),
                url.replace("reports.internal", "127.1"), url.replace("reports.internal", "2130706433"),
                url.replace("reports.internal", "0177.0.0.1"), url.replace("//", "\\\\"));
        for (String value : invalid) denied("拒绝非法JDBC地址", () -> policy.validate(value, "reports_ro"));
        check("地址语法拒绝不触发DNS", resolutions.get() == 1);
        denied("拒绝名单外账号", () -> policy.validate(url, "other_ro"));
        properties.getTargets().get(0).getUsernames().add("root");
        denied("名单不能开放root账号", () -> policy.validate(url, "root"));
        DataSourceNetworkPolicy mixed = new DataSourceNetworkPolicy(properties, host -> new InetAddress[] {
                InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), InetAddress.getByAddress(new byte[] {10, 0, 0, 8})});
        denied("混合DNS结果含一个未批准地址即拒绝", () -> mixed.validate(url, "reports_ro"));
        DataSourceNetworkPolicy rebound = new DataSourceNetworkPolicy(properties,
                host -> new InetAddress[] {InetAddress.getByAddress(new byte[] {10, 0, 0, 8})});
        denied("后续DNS重绑定不复用首次允许结果", () -> rebound.validate(url, "reports_ro"));
        properties.getTargets().add(properties.getTargets().get(0));
        denied("重复网络目标配置失败关闭", () -> policy.validate(url, "reports_ro"));
        properties.getTargets().remove(1);
        for (String address : List.of("0.0.0.0", "224.0.0.1", "169.254.169.254", "localhost", "127.1", "[::1]", "::", "fe80::1%1")) {
            denied("拒绝非法或特殊允许IP", () -> DataSourceNetworkPolicy.literal(address));
        }
        check("IPv6只接收真实字面量", DataSourceNetworkPolicy.literal("::1").equals("0:0:0:0:0:0:0:1"));
        policy.validateServices(List.of("cloudflow-service-hr"));
        check("批准服务子集有效", true);
        denied("拒绝任意服务名", () -> policy.validateServices(List.of("attacker")));
        denied("拒绝未部署服务", () -> policy.validateServices(List.of("cloudflow-service-crm")));
        denied("拒绝重复服务名", () -> policy.validateServices(List.of("cloudflow-service-hr", "cloudflow-service-hr")));
    }

    private static void secrets() throws Exception {
        DataSourceRuntimeProperties properties = properties();
        DataSourceSecretCipher cipher = new DataSourceSecretCipher(properties);
        String password = "Nonempty-Readonly-Password-2026!";
        String first = cipher.encrypt(password);
        String second = cipher.encrypt(password);
        check("非空密码随机加密且往返一致", !first.equals(second) && !first.contains(password)
                && password.equals(cipher.decrypt(first)) && password.equals(cipher.decrypt(second)));
        char changed = first.charAt(20) == 'A' ? 'B' : 'A';
        denied("密文篡改拒绝", () -> cipher.decrypt(first.substring(0, 20) + changed + first.substring(21)));
        denied("旧用途密文不能混入", () -> cipher.decrypt(first.substring(4)));
        denied("星号不能作为真实密码", () -> cipher.encrypt("********"));
        denied("空密码拒绝", () -> cipher.encrypt(" "));
        denied("超长密码拒绝", () -> cipher.encrypt("a".repeat(513)));
        RuntimeDataSourceConfig entity = new RuntimeDataSourceConfig();
        entity.setPasswordEncrypted(first);
        check("实体序列化和字符串不含密文", !new ObjectMapper().writeValueAsString(entity).contains(first)
                && !entity.toString().contains(first));
        properties.setSecretKey("Different-DataSource-Only-Secret-Key-2026");
        denied("错误独立主密钥拒绝", () -> cipher.decrypt(first));
        properties.setSecretKey("");
        denied("缺主密钥禁止保存非空密码", () -> cipher.encrypt(password));
        denied("缺主密钥禁止读取密码", () -> cipher.decrypt(first));
        check("部署默认关闭", !new DataSourceRuntimeProperties().configured());
        properties = properties();
        properties.setSecretKey(properties.getControlKey());
        check("控制签名与密码主密钥不能共用", !properties.configured());
    }

    private static void signatures() {
        DataSourceRuntimeProperties properties = properties();
        Clock now = Clock.fixed(Instant.ofEpochMilli(1790500000000L), ZoneOffset.UTC);
        DataSourceControlSignature signature = new DataSourceControlSignature(properties, now);
        String instance = DataSourceControlSignature.instanceKey("cloudflow-service-hr", "127.0.0.1", 19001, false);
        String path = "/inner/hr/data-source/apply";
        DataSourceApplyRequest request = request(101L, 3);
        Map<String, String> headers = signature.sign(path, instance, request);
        verify(signature, path, instance, "cloudflow-auth", "127.0.0.1", headers, request);
        check("允许来源签名通过", true);
        denied("同一内部签名不能重放", () -> verify(signature, path, instance, "cloudflow-auth", "127.0.0.1", headers, request));
        Map<String, String> fresh = signature.sign(path, instance, request);
        denied("伪造auth服务头但来源不符拒绝", () -> verify(signature, path, instance, "cloudflow-auth", "10.0.0.9", fresh, request));
        denied("其他服务来源拒绝", () -> verify(signature, path, instance, "cloudflow-service-oa", "127.0.0.1", fresh, request));
        denied("目标实例不能被替换", () -> verify(signature, path, "other", "cloudflow-auth", "127.0.0.1", fresh, request));
        denied("指令版本不能被修改", () -> verify(signature, path, instance, "cloudflow-auth", "127.0.0.1", fresh, request(101L, 4)));
        denied("指令路径不能被替换", () -> verify(signature, "/inner/oa/data-source/apply", instance, "cloudflow-auth", "127.0.0.1", fresh, request));
        DataSourceControlSignature expired = new DataSourceControlSignature(properties, Clock.offset(now, java.time.Duration.ofSeconds(31)));
        denied("超过三十秒签名拒绝", () -> verify(expired, path, instance, "cloudflow-auth", "127.0.0.1", fresh, request));
        DataSourceControlSignature future = new DataSourceControlSignature(properties, Clock.offset(now, java.time.Duration.ofSeconds(-6)));
        denied("超过五秒未来签名拒绝", () -> verify(future, path, instance, "cloudflow-auth", "127.0.0.1", fresh, request));
        verify(signature, path, instance, "cloudflow-auth", "127.0.0.1", fresh, request);
        check("失败校验不消费合法指令", true);
        properties.setEnabled(false);
        denied("停用后已有签名无效", () -> verify(signature, path, instance, "cloudflow-auth", "127.0.0.1", fresh, request));
    }

    private static void keysAndStoppedRoutes() throws Exception {
        DynamicRoutingDataSource routing = new DynamicRoutingDataSource(List.of());
        ScheduledExecutorService retirement = Executors.newSingleThreadScheduledExecutor();
        ManagedRuntimeDataSource existing = new ManagedRuntimeDataSource(101L, retirement);
        ManagedRuntimeDataSource master = new ManagedRuntimeDataSource(0L, retirement);
        routing.addDataSource("business", master);
        routing.addDataSource("reports", existing);
        DataSourceKeyPolicy keys = new DataSourceKeyPolicy(routing, "business");
        try {
            for (String key : List.of("master", "default", "primary", "business", "reports", "master_readonly", "reports_readonly", "UPPER", "1reports")) {
                denied("保护主库及既有名称和分组别名", () -> keys.validate(key, 102L));
            }
            keys.validate("reports", 101L);
            keys.validate("new-reports", 102L);
            check("原配置可替换自身且允许独立新注册键", true);
            check("停用入口保持原注册对象不回落主库", routing.getDataSource("reports") == existing);
            try { existing.getConnection(); throw new AssertionError("Disabled source unexpectedly connected"); }
            catch (SQLException failure) { check("停用入口明确拒绝取连接", "08003".equals(failure.getSQLState())); }
            try { existing.unwrap(com.zaxxer.hikari.HikariDataSource.class); throw new AssertionError("Pool unexpectedly exposed"); }
            catch (SQLException failure) { check("不暴露内部连接池和凭据", true); }
        } finally { routing.destroy(); retirement.shutdownNow(); }
    }

    private static void requests() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        DataSourceApplyRequest valid = mapper.readValue("{\"configId\":101,\"version\":2}", DataSourceApplyRequest.class);
        valid.validate();
        check("指令只需要编号与版本", valid.getConfigId() == 101L && valid.getVersion() == 2);
        for (String field : List.of("url", "password", "dsKey", "sql", "driverClass", "tenantId", "targetServices")) {
            try {
                mapper.readValue("{\"configId\":101,\"version\":2,\"" + field + "\":\"injected\"}", DataSourceApplyRequest.class);
                throw new AssertionError("Extra command field accepted");
            } catch (com.fasterxml.jackson.databind.JsonMappingException failure) { check("内部指令拒绝额外字段" + field, true); }
        }
        denied("负版本拒绝", () -> request(101L, -1).validate());
        denied("负编号拒绝", () -> request(-1L, 1).validate());
    }

    private static DataSourceRuntimeProperties properties() {
        DataSourceRuntimeProperties result = new DataSourceRuntimeProperties();
        result.setEnabled(true);
        result.setManagementTenantId(100000L);
        result.setSecretKey("Datasource-Encryption-Only-Secret-2026");
        result.setControlKey("Datasource-Internal-Control-Secret-2026");
        result.setAllowedAuthAddresses(Set.of("127.0.0.1"));
        result.setAllowedServices(Set.of("cloudflow-service-hr"));
        DataSourceRuntimeProperties.Target target = new DataSourceRuntimeProperties.Target();
        target.setHost("reports.internal");
        target.setPort(3306);
        target.setDatabase("reporting");
        target.setAddresses(Set.of("127.0.0.1"));
        target.setUsernames(new java.util.HashSet<>(Set.of("reports_ro")));
        result.setTargets(new ArrayList<>(List.of(target)));
        return result;
    }

    private static void instanceIdentity() throws Exception {
        DataSourceRuntimeProperties properties = properties();
        properties.setInstanceHost("127.0.0.1");
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("registration", new TestRegistration());
        DataSourceInstanceIdentity identity = new DataSourceInstanceIdentity(properties, beans.getBeanProvider(Registration.class),
                "cloudflow-service-hr", "0.0.0.0", false);
        Field port = DataSourceInstanceIdentity.class.getDeclaredField("port");
        port.setAccessible(true);
        port.setInt(identity, 19001);
        check("显式部署实例地址优先于服务注册Bean", identity.key().equals(DataSourceControlSignature.instanceKey("cloudflow-service-hr", "127.0.0.1", 19001, false)));
        properties.setInstanceHost("");
        check("未显式配置时采用真实服务发现地址", identity.key().equals(DataSourceControlSignature.instanceKey("cloudflow-service-hr", "10.0.0.2", 19002, false)));
        StaticListableBeanFactory empty = new StaticListableBeanFactory();
        DataSourceInstanceIdentity wildcard = new DataSourceInstanceIdentity(properties, empty.getBeanProvider(Registration.class),
                "cloudflow-service-hr", "0.0.0.0", false);
        port.setInt(wildcard, 19001);
        denied("未登记实例不能使用通配监听地址", wildcard::key);
        properties.setInstanceHost("::");
        denied("显式通配地址不能覆盖为可发现实例", identity::key);
        properties.setInstanceHost("127.0.0.1");
        port.setInt(identity, 0);
        denied("服务端口未就绪拒绝实例身份", identity::key);
    }

    private static final class TestRegistration extends DefaultServiceInstance implements Registration {
        private TestRegistration() { super("test", "cloudflow-service-hr", "10.0.0.2", 19002, false); }
    }

    private static DataSourceApplyRequest request(Long configId, int version) {
        DataSourceApplyRequest request = new DataSourceApplyRequest();
        request.setConfigId(configId);
        request.setVersion(version);
        return request;
    }

    private static void verify(DataSourceControlSignature verifier, String path, String instance, String source,
            String address, Map<String, String> headers, DataSourceApplyRequest request) {
        verifier.verify(path, instance, source, address, headers.get(DataSourceControlSignature.TIME_HEADER),
                headers.get(DataSourceControlSignature.NONCE_HEADER), headers.get(DataSourceControlSignature.TARGET_HEADER),
                headers.get(DataSourceControlSignature.SIGNATURE_HEADER), request);
    }

    private static void denied(String name, Runnable operation) {
        try { operation.run(); throw new AssertionError(name); }
        catch (DataSourceFailure failure) { check(name, failure.getErrorCode() != null && failure.getCode() >= 400); }
    }

    private static void check(String name, boolean condition) {
        if (!condition) throw new AssertionError(name);
        checks++;
        System.out.println("PASS " + name);
    }
}
