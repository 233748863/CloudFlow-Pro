package com.cloudflow.hr.checks;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.json.SaJsonTemplate;
import cn.dev33.satoken.json.SaJsonTemplateForJackson;
import cn.dev33.satoken.serializer.SaSerializerTemplate;
import cn.dev33.satoken.serializer.impl.SaSerializerTemplateForJdkUseBase64;
import cn.dev33.satoken.serializer.impl.SaSerializerTemplateForJson;
import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.session.SaTerminalInfo;
import com.cloudflow.common.config.RedisConfig;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.idempotent.support.RepeatSubmitKeyResolver;
import com.cloudflow.hr.config.HrJacksonConfig;
import com.cloudflow.hr.config.HrMoneyHttpConfig;
import com.cloudflow.hr.config.HrRequestMetadataInitializer;
import com.cloudflow.hr.domain.dto.HrAttendanceRecalcRequest;
import com.fasterxml.jackson.databind.BeanDescription;
import com.fasterxml.jackson.databind.DeserializationConfig;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationConfig;
import com.fasterxml.jackson.databind.deser.BeanDeserializerModifier;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.BeanSerializerModifier;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.metadata.BeanDescriptor;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpHeaders;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpOutputMessage;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.GenericWebApplicationContext;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

public final class HrRequestMetadataChecks {
    private static final Map<Class<?>, Integer> READERS = new HashMap<>();
    private static final Map<Class<?>, Integer> WRITERS = new HashMap<>();
    private static int controllerInstances;
    private static int payloadInstances;
    private static int accessorCalls;
    private static int businessCalls;
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new HrJacksonConfig().hrJacksonCustomizer().customize(builder);
        ObjectMapper applicationMapper = builder.build();
        SimpleModule observation = new SimpleModule("request-metadata-observation");
        observation.setDeserializerModifier(new BeanDeserializerModifier() {
            @Override
            public JsonDeserializer<?> modifyDeserializer(DeserializationConfig config,
                    BeanDescription description, JsonDeserializer<?> deserializer) {
                READERS.merge(description.getBeanClass(), 1, Integer::sum);
                return deserializer;
            }
        });
        observation.setSerializerModifier(new BeanSerializerModifier() {
            @Override
            public JsonSerializer<?> modifySerializer(SerializationConfig config,
                    BeanDescription description, JsonSerializer<?> serializer) {
                WRITERS.merge(description.getBeanClass(), 1, Integer::sum);
                return serializer;
            }
        });
        applicationMapper.registerModule(observation);
        MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter(applicationMapper);
        List<HttpMessageConverter<?>> converters = new ArrayList<>(List.of(converter));
        new HrMoneyHttpConfig().extendMessageConverters(converters);
        require(converter.getObjectMapper() != applicationMapper, "HTTP and internal JSON keep separate configured mappers");
        require(READERS.isEmpty() && WRITERS.isEmpty(), "no request metadata was prepared before the lifecycle");

        try (GenericWebApplicationContext context = new GenericWebApplicationContext()) {
            context.registerBean(ObjectMapper.class, () -> applicationMapper);
            context.registerBean(RepeatSubmitKeyResolver.class, () -> new RepeatSubmitKeyResolver(applicationMapper));
            context.registerBean(ObservedValidator.class);
            context.registerBean(RequestMappingHandlerAdapter.class, () -> {
                RequestMappingHandlerAdapter adapter = new RequestMappingHandlerAdapter();
                adapter.setMessageConverters(converters);
                return adapter;
            });
            context.registerBean(RequestMappingHandlerMapping.class);
            context.registerBean(ProbeController.class, definition -> definition.setLazyInit(true));
            context.registerBean(InheritedController.class, definition -> definition.setLazyInit(true));
            context.registerBean(HrRequestMetadataInitializer.class);
            context.refresh();
            require(context.isActive(), "Spring completed startup with request preparation enabled");
            require(controllerInstances == 0, "metadata does not instantiate lazy controllers");
            require(payloadInstances == 0, "metadata does not construct request payloads");
            require(accessorCalls == 0, "metadata does not execute request getters");
            require(businessCalls == 0, "metadata does not execute handlers");
            ObservedValidator validator = context.getBean(ObservedValidator.class);
            require(validator.prepared.containsAll(List.of(HrAttendanceRecalcRequest.class, Payload.class,
                    InheritedPayload.class, OptionalPayload.class)), "configured validator prepares every request body type");
            require(!validator.prepared.contains(QueryPayload.class) && validator.validationCalls == 0,
                    "startup prepares constraints without validating objects or inspecting query-only types");
            for (Class<?> requestType : List.of(HrAttendanceRecalcRequest.class, Payload.class,
                    InheritedPayload.class, OptionalPayload.class)) {
                require(READERS.getOrDefault(requestType, 0) >= 2, "both configured mappers prepared " + requestType.getSimpleName());
                require(WRITERS.getOrDefault(requestType, 0) >= 3, "HTTP, internal and copied digest writers prepared " + requestType.getSimpleName());
            }
            require(!READERS.containsKey(QueryPayload.class) && !WRITERS.containsKey(QueryPayload.class),
                    "query-only arguments are not treated as JSON request bodies");
            Map<Class<?>, Integer> readersBefore = Map.copyOf(READERS);
            Map<Class<?>, Integer> writersBefore = Map.copyOf(WRITERS);
            context.getBean(HrRequestMetadataInitializer.class).afterSingletonsInstantiated();
            require(readersBefore.equals(READERS) && writersBefore.equals(WRITERS), "repeat preparation reuses cached metadata");
            require(controllerInstances == 0 && payloadInstances == 0 && accessorCalls == 0 && businessCalls == 0,
                    "repeat preparation has no business execution or payload access");

            HrAttendanceRecalcRequest attendance = HrAttendanceRecalcRequest.class.cast(converter.read(
                    HrAttendanceRecalcRequest.class, input("{\"employeeIds\":[77,88],\"startDate\":\"2026-09-01\","
                            + "\"endDate\":\"2026-09-30\",\"confirmed\":true,\"forceOverwrite\":false}")));
            require(attendance.getEmployeeIds().equals(List.of(77L, 88L)), "inherited employee selection is preserved");
            require(attendance.getStartDate().equals(LocalDate.of(2026, 9, 1))
                    && attendance.getEndDate().equals(LocalDate.of(2026, 9, 30)), "attendance dates keep their configured representation");
            require(attendance.isConfirmed() && !attendance.isForceOverwrite(), "confirmation and overwrite flags are unchanged");
            Payload payload = Payload.class.cast(converter.read(Payload.class,
                    input("{\"amount\":9999999999999999.99,\"at\":\"2026-09-30 18:07:29\"}")));
            require(payload.amount.equals(new BigDecimal("9999999999999999.99")), "large input amounts remain exact");
            require(payload.at.equals(LocalDateTime.of(2026, 9, 30, 18, 7, 29)), "date-time parsing keeps the HR format");
            JsonOutput output = new JsonOutput();
            converter.write(payload, MediaType.APPLICATION_JSON, output);
            require(output.text().contains("\"amount\":\"9999999999999999.99\""), "HTTP money remains a decimal string");
            require(output.text().contains("\"at\":\"2026-09-30 18:07:29\""), "HTTP date-time output is unchanged");
            require(applicationMapper.writeValueAsString(payload).contains("\"amount\":9999999999999999.99"),
                    "internal snapshots retain numeric amounts");
            boolean rejected = false;
            try {
                converter.read(Payload.class, input("{\"amount\":\"invalid\"}"));
            } catch (HttpMessageNotReadableException expected) {
                rejected = true;
            }
            require(rejected, "invalid monetary input is still rejected");
            require(controllerInstances == 0 && businessCalls == 0, "codec verification does not dispatch business requests");
            String protectedLog = LogSanitizer.json(Map.of("employeeIds", List.of(77L, 88L),
                    "phone", "13800000000", "nested", Map.of("accessToken", "synthetic-session-value",
                            "note", "联系 sample@example.test")), applicationMapper, 2000);
            JsonNode logged = applicationMapper.readTree(protectedLog);
            require(logged.path("phone").asText().equals("[REDACTED]"), "prepared JSON tree keeps phone redaction");
            require(logged.path("nested").path("accessToken").asText().equals("[REDACTED]"),
                    "prepared JSON tree keeps nested credential redaction");
            require(!logged.path("nested").path("note").asText().contains("sample@example.test"),
                    "prepared JSON tree keeps inline address redaction");
            require(logged.path("employeeIds").get(0).asLong() == 77L
                    && logged.path("employeeIds").get(1).asLong() == 88L, "ordinary log values remain exact");
            require(validator.validate(new Payload()).size() == 1, "prepared real constraints still reject a missing amount");
            require(validator.validate(payload).isEmpty(), "prepared real constraints still accept an exact valid amount");
        }
        verifySessionMetadata();
        verifyRedisMetadata();
        System.out.println("HR_REQUEST_METADATA_CHECKS: checks=" + checks
                + "; passed=true; controller_instances=" + controllerInstances
                + "; business_calls=" + businessCalls + "; database_calls=0; external_messages=0");
    }

    private static void verifySessionMetadata() throws Exception {
        SaJsonTemplate previousJson = SaManager.getSaJsonTemplate();
        SaSerializerTemplate previousSerializer = SaManager.getSaSerializerTemplate();
        int previousRefreshPeriod = SaManager.getConfig().getDataRefreshPeriod();
        SaManager.getConfig().setDataRefreshPeriod(-1);
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        AtomicInteger storageCalls = new AtomicInteger();
        AtomicInteger customCalls = new AtomicInteger();
        SaTokenDao guardedDao = (SaTokenDao) Proxy.newProxyInstance(SaTokenDao.class.getClassLoader(),
                new Class<?>[]{SaTokenDao.class}, (proxy, method, values) -> {
                    if (method.getName().equals("init") || method.getName().equals("destroy")) return null;
                    if (method.getDeclaringClass() == Object.class) {
                        return switch (method.getName()) {
                            case "toString" -> "GuardedSessionMetadataDao";
                            case "hashCode" -> System.identityHashCode(proxy);
                            case "equals" -> proxy == values[0];
                            default -> throw new AssertionError("Unexpected object method");
                        };
                    }
                    storageCalls.incrementAndGet();
                    throw new AssertionError("Session metadata must not access stored sessions");
                });
        try {
            SaManager.setSaTokenDao(guardedDao);
            SaJsonTemplateForJackson selected = new SaJsonTemplateForJackson();
            SaSerializerTemplateForJson serializer = new SaSerializerTemplateForJson();
            SaManager.setSaJsonTemplate(selected);
            SaManager.setSaSerializerTemplate(serializer);
            Set<Class<?>> readers = new HashSet<>();
            Set<Class<?>> writers = new HashSet<>();
            SimpleModule observation = new SimpleModule("session-metadata-observation");
            observation.setDeserializerModifier(new BeanDeserializerModifier() {
                @Override
                public JsonDeserializer<?> modifyDeserializer(DeserializationConfig config,
                        BeanDescription description, JsonDeserializer<?> deserializer) {
                    readers.add(description.getBeanClass());
                    return deserializer;
                }
            });
            observation.setSerializerModifier(new BeanSerializerModifier() {
                @Override
                public JsonSerializer<?> modifySerializer(SerializationConfig config,
                        BeanDescription description, JsonSerializer<?> valueSerializer) {
                    writers.add(description.getBeanClass());
                    return valueSerializer;
                }
            });
            selected.objectMapper.registerModule(observation);
            ObjectMapper originalMapper = selected.objectMapper;
            ObjectMapper originalMapMapper = selected.mapObjectMapper;
            require(readers.isEmpty() && writers.isEmpty(), "session metadata starts unprepared");
            try (GenericWebApplicationContext context = new GenericWebApplicationContext()) {
                context.registerBean(HrRequestMetadataInitializer.class);
                context.refresh();
                HrRequestMetadataInitializer initializer = context.getBean(HrRequestMetadataInitializer.class);
                require(readers.containsAll(List.of(SaSession.class, SaTerminalInfo.class)),
                        "startup prepares session and terminal readers in the actual session mapper");
                require(writers.containsAll(List.of(SaSession.class, SaTerminalInfo.class)),
                        "startup prepares session and terminal writers in the actual session mapper");
                require(selected.objectMapper == originalMapper && selected.mapObjectMapper == originalMapMapper,
                        "session and ordinary map codec configurations are retained");
                require(SaManager.getSaSerializerTemplate() == serializer && SaManager.getSaJsonTemplate() == selected,
                        "startup retains the configured session serializer and JSON template");
                require(storageCalls.get() == 0, "startup does not read or modify Redis sessions");

                SaSession sample = new SaSession();
                sample.setId("metadata-session-fixture");
                sample.setLoginId(9223372036854775806L);
                sample.setCreateTime(1790000000000L);
                sample.getDataMap().put("loginUser", new HashMap<>(Map.of("ownerTenantId", 100000L,
                        "tenantId", 100001L, "userId", 9223372036854775806L, "userVersion", 7,
                        "permissions", new HashSet<>(List.of("hr:attendance:recalculate", "hr:attendance:query")),
                        "roles", new ArrayList<>(List.of("hr")))));
                sample.getTerminalList().add(new SaTerminalInfo());
                SaJsonTemplateForJackson baseline = new SaJsonTemplateForJackson();
                String baselineBytes = baseline.objectToJson(sample);
                String preparedBytes = serializer.objectToString(sample);
                require(baselineBytes.equals(preparedBytes), "session wire representation matches the unchanged serializer");
                SaSession restored = serializer.stringToObject(baselineBytes, SaSession.class);
                require(restored.getId().equals(sample.getId()) && restored.getCreateTime() == sample.getCreateTime(),
                        "existing session identity and creation time deserialize unchanged");
                require(restored.getLoginId().equals(sample.getLoginId()), "large login identifiers remain exact");
                require(restored.getDataMap().equals(sample.getDataMap()),
                        "tenant identity, account version, roles and permissions survive the original representation");
                require(restored.getTerminalList().size() == 1, "terminal collection survives session round trip");
                require(baseline.objectToJson(Map.of("value", 77, "name", "普通内容"))
                        .equals(selected.objectToJson(Map.of("value", 77, "name", "普通内容"))),
                        "ordinary map JSON remains compatible");
                initializer.afterSingletonsInstantiated();
                require(serializer.objectToString(sample).equals(preparedBytes), "repeated preparation preserves existing session bytes");

                SaJsonTemplate customJson = (SaJsonTemplate) Proxy.newProxyInstance(SaJsonTemplate.class.getClassLoader(),
                        new Class<?>[]{SaJsonTemplate.class}, (proxy, method, values) -> {
                            customCalls.incrementAndGet();
                            throw new AssertionError("Custom session JSON must not be invoked for metadata preparation");
                        });
                SaManager.setSaJsonTemplate(customJson);
                initializer.afterSingletonsInstantiated();
                require(SaManager.getSaJsonTemplate() == customJson && customCalls.get() == 0,
                        "custom JSON templates are retained without invoking them");
                SaSerializerTemplate alternate = new SaSerializerTemplateForJdkUseBase64();
                SaManager.setSaSerializerTemplate(alternate);
                SaManager.setSaJsonTemplate(selected);
                initializer.afterSingletonsInstantiated();
                require(SaManager.getSaSerializerTemplate() == alternate, "alternate session serialization remains configured");
                require(storageCalls.get() == 0 && customCalls.get() == 0,
                        "startup and compatibility checks perform no session storage or custom codec calls");
            }
        } finally {
            SaManager.setSaTokenDao(previousDao);
            SaManager.setSaJsonTemplate(previousJson);
            SaManager.setSaSerializerTemplate(previousSerializer);
            SaManager.getConfig().setDataRefreshPeriod(previousRefreshPeriod);
        }
        require(SaManager.getConfig().getDataRefreshPeriod() == previousRefreshPeriod,
                "standalone in-memory session cleanup setting is restored");
    }

    private static void verifyRedisMetadata() {
        AtomicInteger connectionCalls = new AtomicInteger();
        AtomicInteger customCalls = new AtomicInteger();
        RedisConnectionFactory connections = (RedisConnectionFactory) Proxy.newProxyInstance(
                RedisConnectionFactory.class.getClassLoader(), new Class<?>[]{RedisConnectionFactory.class},
                (proxy, method, values) -> {
                    connectionCalls.incrementAndGet();
                    throw new AssertionError("Metadata must not acquire a Redis connection");
                });
        RedisTemplate<String, Object> template = new RedisConfig().redisTemplate(connections);
        GenericJackson2JsonRedisSerializer serializer = (GenericJackson2JsonRedisSerializer) template.getValueSerializer();
        Set<Class<?>> readers = new HashSet<>();
        Set<Class<?>> writers = new HashSet<>();
        ObjectMapper[] selectedMapper = new ObjectMapper[1];
        serializer.configure(mapper -> {
            selectedMapper[0] = mapper;
            SimpleModule observation = new SimpleModule("redis-metadata-observation");
            observation.setDeserializerModifier(new BeanDeserializerModifier() {
                @Override
                public JsonDeserializer<?> modifyDeserializer(DeserializationConfig config,
                        BeanDescription description, JsonDeserializer<?> deserializer) {
                    readers.add(description.getBeanClass());
                    return deserializer;
                }
            });
            observation.setSerializerModifier(new BeanSerializerModifier() {
                @Override
                public JsonSerializer<?> modifySerializer(SerializationConfig config,
                        BeanDescription description, JsonSerializer<?> valueSerializer) {
                    writers.add(description.getBeanClass());
                    return valueSerializer;
                }
            });
            mapper.registerModule(observation);
        });
        SerializationConfig serializationConfig = selectedMapper[0].getSerializationConfig();
        DeserializationConfig deserializationConfig = selectedMapper[0].getDeserializationConfig();
        RedisSerializer<Object> custom = new RedisSerializer<>() {
            @Override
            public byte[] serialize(Object value) {
                customCalls.incrementAndGet();
                throw new AssertionError("Custom serializers must remain unused during startup");
            }
            @Override
            public Object deserialize(byte[] value) {
                customCalls.incrementAndGet();
                throw new AssertionError("Custom serializers must remain unused during startup");
            }
        };
        RedisTemplate<String, Object> customTemplate = new RedisTemplate<>();
        customTemplate.setConnectionFactory(connections);
        customTemplate.setValueSerializer(custom);
        customTemplate.setHashValueSerializer(custom);
        UserDataScopeSnapshot sample = new UserDataScopeSnapshot();
        sample.setTenantId(100001L);
        sample.setUserId(9223372036854775806L);
        sample.setUserVersion(7);
        sample.setDsType(3);
        sample.setDsDeptIds(new ArrayList<>(List.of(9223372036854775805L, 77L)));
        sample.setRefreshedAt(LocalDateTime.of(2026, 9, 30, 18, 7, 29));
        RedisTemplate<String, Object> baseline = new RedisConfig().redisTemplate(connections);
        byte[] oldBytes = ((GenericJackson2JsonRedisSerializer) baseline.getValueSerializer()).serialize(sample);
        require(readers.isEmpty() && writers.isEmpty(), "actual Redis metadata starts unprepared");
        try (GenericWebApplicationContext context = new GenericWebApplicationContext()) {
            context.registerBean("redisTemplate", RedisTemplate.class, () -> template);
            context.registerBean("customRedisTemplate", RedisTemplate.class, () -> customTemplate);
            context.registerBean(HrRequestMetadataInitializer.class);
            context.refresh();
            require(readers.contains(UserDataScopeSnapshot.class) && writers.contains(UserDataScopeSnapshot.class),
                    "startup prepares the actual Redis data-scope reader and writer");
            require(template.getValueSerializer() == serializer && template.getHashValueSerializer() == serializer,
                    "Redis value and hash serializers retain their identities");
            require(selectedMapper[0].getSerializationConfig() == serializationConfig
                    && selectedMapper[0].getDeserializationConfig() == deserializationConfig,
                    "Redis typing, modules and format configuration are unchanged");
            require(connectionCalls.get() == 0 && customCalls.get() == 0,
                    "metadata performs no Redis connection or custom serializer calls");
            UserDataScopeSnapshot restored = UserDataScopeSnapshot.class.cast(serializer.deserialize(oldBytes));
            require(sample.equals(restored), "old permission snapshot preserves tenant, user, version, scope, departments and time");
            require(Arrays.equals(oldBytes, serializer.serialize(sample)), "prepared permission snapshot bytes remain compatible");
            require(customTemplate.getValueSerializer() == custom && customTemplate.getHashValueSerializer() == custom,
                    "custom Redis serializers remain configured");
            context.getBean(HrRequestMetadataInitializer.class).afterSingletonsInstantiated();
            require(Arrays.equals(oldBytes, serializer.serialize(sample)), "repeated metadata preparation preserves Redis bytes");
        }
        require(connectionCalls.get() == 0 && customCalls.get() == 0,
                "startup and Redis compatibility verification never access stored sessions");
    }

    private static HttpInputMessage input(String value) {
        return new HttpInputMessage() {
            @Override public InputStream getBody() { return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)); }
            @Override public HttpHeaders getHeaders() {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                return headers;
            }
        };
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static final class JsonOutput implements HttpOutputMessage {
        private final ByteArrayOutputStream body = new ByteArrayOutputStream();
        private final HttpHeaders headers = new HttpHeaders();
        @Override public OutputStream getBody() { return body; }
        @Override public HttpHeaders getHeaders() { return headers; }
        private String text() { return body.toString(StandardCharsets.UTF_8); }
    }

    @RestController
    @RequestMapping("/metadata-probe")
    public static final class ProbeController {
        public ProbeController() { controllerInstances++; }
        @PostMapping("/attendance")
        public void attendance(@RequestBody HrAttendanceRecalcRequest request) { businessCalls++; }
        @PostMapping("/payload")
        public void payload(@RequestBody Payload request) { businessCalls++; }
        @PostMapping("/optional")
        public void optional(@RequestBody Optional<OptionalPayload> request) { businessCalls++; }
        @GetMapping("/query")
        public void query(@RequestParam QueryPayload request) { businessCalls++; }
    }

    public abstract static class InheritedBase<RequestType> {
        @PostMapping("/body")
        public void receive(@RequestBody RequestType request) { businessCalls++; }
    }

    @RestController
    @RequestMapping("/inherited-metadata-probe")
    public static final class InheritedController extends InheritedBase<InheritedPayload> {
        public InheritedController() { controllerInstances++; }
    }

    public static class Payload {
        @NotNull
        public BigDecimal amount;
        public LocalDateTime at;
        public Payload() { payloadInstances++; }
        public String getName() { accessorCalls++; return "metadata-check"; }
    }

    public static final class InheritedPayload extends Payload { }
    public static final class OptionalPayload extends Payload { }
    public static final class QueryPayload extends Payload { }

    public static final class ObservedValidator extends LocalValidatorFactoryBean {
        private final Set<Class<?>> prepared = new HashSet<>();
        private int validationCalls;

        @Override
        public BeanDescriptor getConstraintsForClass(Class<?> type) {
            prepared.add(type);
            return super.getConstraintsForClass(type);
        }

        @Override
        public <BeanType> Set<ConstraintViolation<BeanType>> validate(BeanType value, Class<?>... groups) {
            validationCalls++;
            return super.validate(value, groups);
        }
    }
}
