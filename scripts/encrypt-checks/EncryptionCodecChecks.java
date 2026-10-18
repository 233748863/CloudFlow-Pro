import cn.hutool.crypto.symmetric.AES;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.encrypt.core.EncryptUtils;
import com.cloudflow.common.encrypt.core.EncryptUtils.EncryptException;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import com.cloudflow.common.encrypt.interceptor.MybatisDecryptInterceptor;
import com.cloudflow.common.encrypt.interceptor.MybatisEncryptInterceptor;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.cloudflow.hr.domain.dto.HrEmployeeCompPayload;
import com.cloudflow.hr.domain.dto.HrSalarySlipPayload;
import com.cloudflow.hr.domain.dto.HrTaxProfilePayload;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrTaxProfile;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.cloudflow.hr.mapper.HrTaxProfileMapper;
import com.cloudflow.hr.service.HrHCipherService;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.DefaultSerializerProvider;
import com.fasterxml.jackson.databind.ser.SerializerFactory;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.executor.resultset.ResultSetHandler;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Invocation;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public final class EncryptionCodecChecks {
    static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    static final AtomicInteger ASSERTIONS = new AtomicInteger();
    private static final EncryptorProperties PROPERTIES = properties();
    private static final Method UPDATE;
    private static final Method READ;

    static {
        try {
            UPDATE = Executor.class.getMethod("update", MappedStatement.class, Object.class);
            READ = ResultSetHandler.class.getMethod("handleResultSets", Statement.class);
        } catch (ReflectiveOperationException failure) {
            throw new ExceptionInInitializerError(failure);
        }
    }

    public static void main(String[] arguments) {
        try {
            group("current-source and annotation scope", EncryptionCodecChecks::sourceScope);
            group("real HR payload round trips", EncryptionCodecChecks::payloadRoundTrips);
            group("identity aliases cycles and distinct equals", EncryptionCodecChecks::identityChecks);
            group("invalid writes and original restoration", EncryptionCodecChecks::invalidWrites);
            group("downstream and encryption failure restoration", EncryptionCodecChecks::failureRestoration);
            group("JSON serialization failure is fail closed", EncryptionCodecChecks::serializationFailure);
            group("strict JSON ciphertext reads", EncryptionCodecChecks::strictReads);
            group("legacy H amounts and D salary boundary", EncryptionCodecChecks::legacyCompatibility);
            group("disabled and absent values", EncryptionCodecChecks::disabledAndAbsent);
            group("shared class definitions retain per-call keys and objects", EncryptionCodecChecks::concurrentDefinitions);
            int offline = ASSERTIONS.get();
            System.out.println("PASS codec offline assertions=" + offline + "; actual current interceptors and HR payloads; no database access");
            if ("1".equals(System.getenv("ENCRYPT_CHECK_DATABASE"))) {
                EncryptionCodecDatabaseChecks.run(PROPERTIES);
                System.out.println("PASS codec isolated MySQL assertions=" + (ASSERTIONS.get() - offline)
                        + "; copied two table definitions only; owned database dropped; total=" + ASSERTIONS.get());
            }
        } catch (Throwable failure) {
            System.err.println("FAIL codec " + failure.getClass().getSimpleName()
                    + (failure instanceof AssertionError ? ": " + failure.getMessage() : ""));
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                System.err.println("Codec cause: " + cause.getClass().getSimpleName());
                for (StackTraceElement location : cause.getStackTrace()) {
                    if (location.getClassName().startsWith("EncryptionCodec")) {
                        System.err.println("Codec location: " + location.getClassName() + "#" + location.getMethodName() + ":" + location.getLineNumber());
                    }
                }
                if (cause instanceof SQLException sql) {
                    System.err.println("Database diagnostic: SQLState=" + sql.getSQLState() + "; errorCode=" + sql.getErrorCode());
                    for (StackTraceElement location : cause.getStackTrace()) {
                        if (location.getClassName().startsWith("EncryptionCodec")) {
                            System.err.println("Database location: " + location.getClassName() + "#" + location.getMethodName() + ":" + location.getLineNumber());
                        }
                    }
                }
            }
            System.exit(1);
        }
    }

    private static void sourceScope() throws Exception {
        Path classes = Path.of(System.getenv("ENCRYPT_CHECK_CLASS_DIR")).toRealPath();
        for (Class<?> source : List.of(EncryptField.class, EncryptUtils.class, EncryptorProperties.class,
                MybatisEncryptInterceptor.class, MybatisDecryptInterceptor.class, HrEmployeeCompPayload.class,
                HrTaxProfilePayload.class, HrEmployeeComp.class, HrTaxProfile.class, HrEmployeeCompMapper.class,
                HrTaxProfileMapper.class, HrCompChange.class, HrSalarySlipPayload.class, HrHCipherService.class)) {
            equal(classes, Path.of(source.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath(),
                    "current source class origin: " + source.getSimpleName());
        }
        check(HrEmployeeCompPayload.class.getDeclaredField("componentValuesText").getAnnotation(EncryptField.class).jsonStorage(), "assignment JSON flag");
        check(HrTaxProfilePayload.class.getDeclaredField("taxConfigText").getAnnotation(EncryptField.class).jsonStorage(), "profile JSON flag");
        check(!HrEmployeeCompPayload.class.getDeclaredField("totalSalaryText").getAnnotation(EncryptField.class).jsonStorage(), "assignment amount keeps legacy format");
        check(!HrTaxProfilePayload.class.getDeclaredField("thresholdText").getAnnotation(EncryptField.class).jsonStorage(), "profile threshold keeps legacy format");
        for (Field field : HrSalarySlipPayload.class.getDeclaredFields()) {
            check(field.getAnnotation(EncryptField.class) == null, "D salary field remains outside encryption: " + field.getName());
        }
        equal(false, EncryptField.class.getMethod("jsonStorage").getDefaultValue(), "JSON mode defaults off");
    }

    private static void payloadRoundTrips() throws Throwable {
        for (Map<String, Object> value : List.<Map<String, Object>>of(Map.of(), Map.of("base", 12800, "bonus", 350),
                Map.of("note", "中文 \"quote\" \\ slash\nline", "items", List.of(1, 2, 3)),
                Map.of("nested", Map.of("enabled", true, "amount", new BigDecimal("123.45"))))) {
            HrEmployeeComp assignment = assignment(1);
            HrTaxProfile profile = profile(1);
            assignment.setComponentValues(value);
            profile.setTaxConfig(value);
            List<Original> originals = snapshot(assignment, profile);
            List<String> persisted = new ArrayList<>();
            equal(7, write(Map.of("assignment", assignment, "profile", profile), () -> {
                persisted.add(assignment.getComponentValuesText());
                persisted.add(assignment.getTotalSalaryText());
                persisted.add(profile.getTaxConfigText());
                persisted.add(profile.getThresholdText());
                jsonCipher(persisted.get(0), JSON.writeValueAsString(value), "assignment stored JSON");
                jsonCipher(persisted.get(2), JSON.writeValueAsString(value), "profile stored JSON");
                equal("12800.00", EncryptUtils.decrypt(persisted.get(1), AlgorithmType.AES, PROPERTIES.getAesKey()), "legacy salary readable");
                equal("5000.00", EncryptUtils.decrypt(persisted.get(3), AlgorithmType.AES, PROPERTIES.getAesKey()), "legacy threshold readable");
            }, PROPERTIES), "executor return retained");
            restored(originals, "successful real HR payload write");
            HrEmployeeComp loadedAssignment = new HrEmployeeComp();
            HrTaxProfile loadedProfile = new HrTaxProfile();
            loadedAssignment.setComponentValuesText(persisted.get(0));
            loadedAssignment.setTotalSalaryText(persisted.get(1));
            loadedProfile.setTaxConfigText(persisted.get(2));
            loadedProfile.setThresholdText(persisted.get(3));
            List<Object> results = List.of(loadedAssignment, loadedProfile);
            check(read(results, PROPERTIES) == results, "result identity retained");
            equal(JSON.readTree(JSON.writeValueAsString(value)), JSON.readTree(JSON.writeValueAsString(loadedAssignment.getComponentValues())), "assignment business map round trip");
            equal(JSON.readTree(JSON.writeValueAsString(value)), JSON.readTree(JSON.writeValueAsString(loadedProfile.getTaxConfig())), "profile business map round trip");
            equal(new BigDecimal("12800.00"), loadedAssignment.getTotalSalary(), "salary decimal round trip");
            equal(new BigDecimal("5000.00"), loadedProfile.getThreshold(), "threshold decimal round trip");
            List<Original> loadedOriginals = snapshot(loadedAssignment, loadedProfile);
            for (int repeat = 0; repeat < 2; repeat++) {
                write(List.of(loadedAssignment, loadedProfile), () -> {
                    equal(persisted.get(0), loadedAssignment.getComponentValuesText(), "repeat write does not double encrypt JSON");
                    equal(persisted.get(1), loadedAssignment.getTotalSalaryText(), "repeat write does not double encrypt amount");
                    equal(persisted.get(2), loadedProfile.getTaxConfigText(), "repeat profile JSON stable");
                }, PROPERTIES);
                restored(loadedOriginals, "repeated real HR write");
            }
        }
    }

    private static void identityChecks() throws Throwable {
        JsonFixture first = new JsonFixture("12800.00", "{\"amount\":12800}");
        JsonFixture second = new JsonFixture("12800.00", "{\"amount\":12800}");
        Map<String, Object> root = new LinkedHashMap<>();
        List<Object> collection = new ArrayList<>();
        root.put("et", first);
        root.put("param1", first);
        root.put("collection", collection);
        root.put("self", root);
        collection.add(first);
        collection.add(collection);
        collection.add(new Object[]{second, first, null, "plain scalar", 9});
        List<Original> originals = snapshot(first, second);
        List<String> persisted = new ArrayList<>();
        write(root, () -> {
            equal(first.json, second.json, "each distinct equal entity encrypted exactly once");
            equal(first.ordinary, second.ordinary, "equal entity ordinary fields encrypted exactly once");
            jsonCipher(first.json, "{\"amount\":12800}", "aliased JSON has one layer");
            equal("12800.00", EncryptUtils.decrypt(first.ordinary, AlgorithmType.AES, PROPERTIES.getAesKey()), "aliased amount has one layer");
            persisted.add(first.json);
            persisted.add(first.ordinary);
        }, PROPERTIES);
        restored(originals, "cyclic aliased write");
        first.json = persisted.get(0);
        first.ordinary = persisted.get(1);
        second.json = persisted.get(0);
        second.ordinary = persisted.get(1);
        read(List.of(root, first, second), PROPERTIES);
        for (Original original : originals) equal(original.value(), original.field().get(original.target()), "cyclic aliased read decrypts once");
        HrEmployeeComp equalFirst = assignment(9);
        HrEmployeeComp equalSecond = assignment(9);
        check(equalFirst != equalSecond && equalFirst.equals(equalSecond), "actual Lombok entities equal but distinct");
        List<Original> equalOriginals = snapshot(equalFirst, equalSecond);
        write(List.of(equalFirst, equalSecond), () -> {
            jsonCipher(equalFirst.getComponentValuesText(), "{\"base\":12800}", "first equal entity encrypted");
            equal(equalFirst.getComponentValuesText(), equalSecond.getComponentValuesText(), "identity set retains second equal entity");
        }, PROPERTIES);
        restored(equalOriginals, "distinct equal entities restored");
    }

    private static void invalidWrites() throws Throwable {
        for (String invalid : List.of("***", "", " ", "{", "{} trailing", "{} []", "[1,]", "{'amount':1}", "/*comment*/{}", "NaN", "unquoted")) {
            JsonFixture fixture = new JsonFixture("secret-synthetic", invalid);
            List<Original> originals = snapshot(fixture);
            AtomicInteger executions = new AtomicInteger();
            Throwable failure = rejects(EncryptException.class, () -> write(fixture, executions::incrementAndGet, PROPERTIES), "invalid JSON rejected before SQL");
            equal(0, executions.get(), "invalid JSON never reaches executor");
            restored(originals, "invalid JSON write");
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                check(cause.getMessage() == null || !cause.getMessage().contains("secret-synthetic"), "failure messages contain no plaintext");
            }
        }
        for (boolean jsonField : List.of(false, true)) {
            JsonFixture valid = new JsonFixture("safe", "{}");
            JsonFixture invalid = new JsonFixture(jsonField ? "safe" : "***", jsonField ? "***" : "{}");
            List<Original> originals = snapshot(valid, invalid);
            AtomicInteger executions = new AtomicInteger();
            rejects(EncryptException.class, () -> write(List.of(valid, invalid), executions::incrementAndGet, PROPERTIES), "placeholder rejected for either storage type");
            equal(0, executions.get(), "placeholder aborts entire argument graph before SQL");
            restored(originals, "placeholder restores earlier entity and fields");
        }
    }

    private static void failureRestoration() throws Throwable {
        for (Throwable downstream : List.of(new SQLException("synthetic SQL failure"), new IllegalStateException("synthetic executor failure"), new AssertionError("synthetic error"))) {
            HrEmployeeComp assignment = assignment(2);
            HrTaxProfile profile = profile(2);
            List<Original> originals = snapshot(assignment, profile);
            AtomicInteger executions = new AtomicInteger();
            rejects(downstream.getClass(), () -> write(List.of(assignment, profile), () -> {
                executions.incrementAndGet();
                jsonCipher(assignment.getComponentValuesText(), "{\"base\":12800}", "encrypted before downstream failure");
                throw downstream;
            }, PROPERTIES), "downstream failure propagated");
            equal(1, executions.get(), "downstream failure executes once");
            restored(originals, "downstream failure restores both entities");
        }
        EncryptorProperties invalidKey = properties();
        invalidKey.setAesKey("invalid-key");
        AlgorithmFixture fixture = new AlgorithmFixture();
        List<Original> originals = snapshot(fixture);
        AtomicInteger executions = new AtomicInteger();
        rejects(EncryptException.class, () -> write(fixture, executions::incrementAndGet, invalidKey), "crypto failure is fail closed");
        equal(0, executions.get(), "crypto failure does not write plaintext");
        restored(originals, "crypto failure restores preceding algorithm field");
    }

    private static void serializationFailure() throws Throwable {
        Field field = MybatisEncryptInterceptor.class.getDeclaredField("JSON");
        field.setAccessible(true);
        ObjectMapper mapper = (ObjectMapper) field.get(null);
        SerializerFactory originalFactory = mapper.getSerializerFactory();
        AlgorithmFixture preceding = new AlgorithmFixture();
        JsonFixture fixture = new JsonFixture("safe", "{}");
        List<Original> originals = snapshot(preceding, fixture);
        AtomicInteger executions = new AtomicInteger();
        try {
            SimpleModule module = new SimpleModule("codec-serialization-failure");
            module.addSerializer(String.class, new JsonSerializer<>() {
                @Override public void serialize(String value, JsonGenerator generator, SerializerProvider provider) throws JsonMappingException {
                    throw JsonMappingException.from(generator, "synthetic JSON serialization failure");
                }
            });
            mapper.registerModule(module);
            ((DefaultSerializerProvider) mapper.getSerializerProvider()).flushCachedSerializers();
            rejects(EncryptException.class, () -> write(List.of(preceding, fixture), executions::incrementAndGet, PROPERTIES), "JSON envelope serialization failure rejected");
            equal(0, executions.get(), "serialization failure does not reach executor");
            restored(originals, "serialization failure restores previously encrypted fields");
        } finally {
            mapper.setSerializerFactory(originalFactory);
            ((DefaultSerializerProvider) mapper.getSerializerProvider()).flushCachedSerializers();
        }
        write(fixture, () -> jsonCipher(fixture.json, "{}", "serializer restored after fault injection"), PROPERTIES);
        restored(originals.stream().filter(original -> original.target() == preceding).toList(),
                "preceding fixture remains usable after serialization failure");
    }

    private static void strictReads() throws Throwable {
        String plain = "{\"amount\":12800}";
        String cipher = EncryptUtils.encrypt(plain, AlgorithmType.AES, PROPERTIES.getAesKey());
        String stored = JSON.writeValueAsString(cipher);
        for (String invalid : List.of("***", "", " ", "{}", "[]", "null", "true", "42", plain, cipher,
                "\"\"", "\" \"", stored + " {}", stored + " trailing", JSON.writeValueAsString(stored),
                JSON.writeValueAsString(cipher + "\n"), JSON.writeValueAsString(cipher.replace("=", "")),
                JSON.writeValueAsString("invalid!"), "'" + cipher + "'", "/*comment*/" + stored)) {
            JsonFixture fixture = new JsonFixture(null, invalid);
            read(List.of(fixture), PROPERTIES);
            equal("***", fixture.json, "strict JSON read failure masks original storage");
            AtomicInteger executions = new AtomicInteger();
            rejects(EncryptException.class, () -> write(fixture, executions::incrementAndGet, PROPERTIES), "masked read cannot be written back");
            equal(0, executions.get(), "masked read causes no executor call");
        }
        for (String invalidPlain : List.of("", " ", "not-json", "{} []", "***")) {
            String malformed = new AES(PROPERTIES.getAesKey().getBytes(StandardCharsets.UTF_8)).encryptBase64(invalidPlain);
            JsonFixture fixture = new JsonFixture(null, JSON.writeValueAsString(malformed));
            read(List.of(fixture), PROPERTIES);
            equal("***", fixture.json, "decrypted JSON must contain exactly one valid value");
        }
        EncryptorProperties wrongKey = properties();
        wrongKey.setAesKey("fedcba9876543210");
        JsonFixture wrong = new JsonFixture(null, stored);
        read(List.of(wrong), wrongKey);
        equal("***", wrong.json, "wrong JSON key remains masked");
        JsonFixture whitespace = new JsonFixture(null, " \n" + stored + "\t ");
        read(List.of(whitespace), PROPERTIES);
        equal(plain, whitespace.json, "legal whitespace around one JSON string accepted");
        JsonFixture legacyPlain = new JsonFixture("12800.00", plain);
        read(List.of(legacyPlain), PROPERTIES);
        equal("***", legacyPlain.ordinary, "legacy plaintext decimal has no fallback");
        equal("***", legacyPlain.json, "legacy plaintext JSON has no fallback");
    }

    private static void legacyCompatibility() throws Throwable {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("encryption", PROPERTIES);
        HrHCipherService cipher = new HrHCipherService(beans.getBeanProvider(EncryptorProperties.class));
        for (String value : List.of("0.00", "123.45", "-75.25", "999999.99")) {
            HrCompChange change = new HrCompChange();
            change.setBeforeTotal(new BigDecimal("0.00"));
            change.setAfterTotal(new BigDecimal(value));
            change.setChangeAmount(new BigDecimal(value));
            List<Original> originals = snapshot(change);
            List<String> persisted = new ArrayList<>();
            write(change, () -> {
                equal(cipher.legacyAmount(value), change.getChangeAmountText(), "H legacy ciphertext byte-for-byte unchanged");
                persisted.add(change.getChangeAmountText());
            }, PROPERTIES);
            restored(originals, "H amount write");
            HrCompChange loaded = new HrCompChange();
            loaded.setChangeAmountText(persisted.get(0));
            read(List.of(loaded), PROPERTIES);
            equal(new BigDecimal(value), loaded.getChangeAmount(), "D reads H legacy decimal");
            equal(value, cipher.open(cipher.seal(value)), "H authenticated ciphertext path unchanged");
        }
        AlgorithmFixture algorithms = new AlgorithmFixture();
        List<Original> originals = snapshot(algorithms);
        List<String> persisted = new ArrayList<>();
        write(algorithms, () -> {
            equal(EncryptUtils.encrypt("base64-value", AlgorithmType.BASE64, ""), algorithms.base64, "BASE64 legacy mode unchanged");
            equal(EncryptUtils.encrypt("aes-value", AlgorithmType.AES, PROPERTIES.getAesKey()), algorithms.aes, "AES legacy mode unchanged");
            equal(EncryptUtils.encrypt("sm4-value", AlgorithmType.SM4, PROPERTIES.getSm4Key()), algorithms.sm4, "SM4 legacy mode unchanged");
            persisted.addAll(List.of(algorithms.base64, algorithms.aes, algorithms.sm4));
        }, PROPERTIES);
        restored(originals, "all legacy algorithms restored");
        algorithms.base64 = persisted.get(0);
        algorithms.aes = persisted.get(1);
        algorithms.sm4 = persisted.get(2);
        read(List.of(algorithms), PROPERTIES);
        for (Original original : originals) equal(original.value(), original.field().get(original.target()), "all legacy algorithms decrypt");
        HrSalarySlip slip = new HrSalarySlip();
        slip.setGrossTotal(new BigDecimal("12800.00"));
        slip.setNetTotal(new BigDecimal("11500.00"));
        slip.setComponents(List.of(Map.of("name", "base", "amount", 12800), Map.of("type", "TAX_SNAPSHOT", "correction", true)));
        List<Map<String, Object>> components = slip.getComponents();
        write(slip, () -> {
            equal(new BigDecimal("12800.00"), slip.getGrossTotal(), "D gross amount untouched");
            check(slip.getComponents() == components, "D components and correction snapshot untouched");
        }, PROPERTIES);
        read(List.of(slip), PROPERTIES);
        equal(new BigDecimal("11500.00"), slip.getNetTotal(), "D net amount untouched");
        check(slip.getComponents() == components, "D JSON list identity retained");
    }

    private static void disabledAndAbsent() throws Throwable {
        EncryptorProperties disabled = properties();
        disabled.setEnabled(false);
        JsonFixture fixture = new JsonFixture("12800.00", "{}");
        List<Original> originals = snapshot(fixture);
        write(fixture, () -> restored(originals, "disabled write bypass"), disabled);
        read(List.of(fixture), disabled);
        restored(originals, "disabled read bypass");
        JsonFixture absent = new JsonFixture("", null);
        List<Original> absentOriginals = snapshot(absent);
        write(absent, () -> restored(absentOriginals, "empty legacy and SQL null remain absent"), PROPERTIES);
        read(List.of(absent), PROPERTIES);
        restored(absentOriginals, "absent read unchanged");
        equal(7, write(null, () -> {}, PROPERTIES), "null parameters delegated");
        check(read(null, PROPERTIES) == null, "null results delegated");
    }

    private static void concurrentDefinitions() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int worker = 0; worker < 16; worker++) {
                int sequence = worker;
                futures.add(executor.submit(() -> {
                    try {
                        check(start.await(10, TimeUnit.SECONDS), "concurrent start released");
                        EncryptorProperties local = properties();
                        for (int pass = 0; pass < 8; pass++) {
                            local.setAesKey(pass % 2 == 0 ? "0123456789abcdef" : "fedcba9876543210");
                            String amount = sequence + "." + String.format(java.util.Locale.ROOT, "%02d", pass);
                            String json = "{\"worker\":" + sequence + ",\"pass\":" + pass + "}";
                            JsonFixture source = new JsonFixture(amount, json);
                            PlainFixture plain = new PlainFixture(sequence, "ordinary field");
                            Map<String, Object> parameter = Map.of("rows", List.of(source, plain), "alias", source);
                            List<String> stored = new ArrayList<>();
                            write(parameter, () -> {
                                equal(amount, EncryptUtils.decrypt(source.ordinary, AlgorithmType.AES, local.getAesKey()), "inherited value uses current call key");
                                equal(json, EncryptUtils.decrypt(JSON.readTree(source.json).textValue(), AlgorithmType.AES, local.getAesKey()), "JSON value uses current call key");
                                equal("ordinary field", plain.label(), "unannotated record retained");
                                stored.add(source.ordinary); stored.add(source.json);
                            }, local);
                            equal(amount, source.ordinary, "concurrent inherited write restored");
                            equal(json, source.json, "concurrent JSON write restored");
                            JsonFixture loaded = new JsonFixture(stored.get(0), stored.get(1));
                            read(List.of(Map.of("loaded", loaded, "plain", plain)), local);
                            equal(amount, loaded.ordinary, "concurrent inherited read isolated");
                            equal(json, loaded.json, "concurrent JSON read isolated");
                        }
                    } catch (Throwable failure) {
                        throw new IllegalStateException("Concurrent encrypted field verification failed", failure);
                    }
                }));
            }
            start.countDown();
            for (Future<?> future : futures) future.get(30, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
            check(executor.awaitTermination(10, TimeUnit.SECONDS), "concurrent workers stopped");
        }
    }

    private record PlainFixture(int number, String label) {
    }

    static EncryptorProperties properties() {
        EncryptorProperties properties = new EncryptorProperties();
        properties.setEnabled(true);
        properties.setAesKey("0123456789abcdef");
        properties.setSm4Key("0123456789abcdef");
        properties.validate();
        return properties;
    }

    static HrEmployeeComp assignment(long id) {
        HrEmployeeComp assignment = new HrEmployeeComp();
        assignment.setId(id);
        assignment.setTenantId(990001L);
        assignment.setEmployeeId(id);
        assignment.setComponentValues(Map.of("base", 12800));
        assignment.setTotalSalary(new BigDecimal("12800.00"));
        assignment.setEffectiveDate(LocalDate.of(2026, 9, 14));
        assignment.setStatus("ACTIVE");
        assignment.setDeleted(0);
        assignment.setVersion(0);
        return assignment;
    }

    static HrTaxProfile profile(long id) {
        HrTaxProfile profile = new HrTaxProfile();
        profile.setId(id);
        profile.setTenantId(990001L);
        profile.setEmployeeId(id);
        profile.setThreshold(new BigDecimal("5000.00"));
        profile.setTaxConfig(Map.of("resident", true, "deduction", 1200));
        profile.setStatus("ACTIVE");
        profile.setVersion(0);
        return profile;
    }

    private static Object write(Object parameter, CheckedAction executor, EncryptorProperties properties) throws Throwable {
        Executor target = (Executor) Proxy.newProxyInstance(Executor.class.getClassLoader(), new Class<?>[]{Executor.class},
                (proxy, method, arguments) -> { executor.run(); return 7; });
        return new MybatisEncryptInterceptor(properties).intercept(new Invocation(target, UPDATE, new Object[]{null, parameter}));
    }

    private static Object read(Object result, EncryptorProperties properties) throws Throwable {
        ResultSetHandler target = (ResultSetHandler) Proxy.newProxyInstance(ResultSetHandler.class.getClassLoader(),
                new Class<?>[]{ResultSetHandler.class}, (proxy, method, arguments) -> result);
        return new MybatisDecryptInterceptor(properties).intercept(new Invocation(target, READ, new Object[]{null}));
    }

    static void jsonCipher(String stored, String plain, String label) throws Exception {
        JsonNode parsed = JSON.readTree(stored);
        check(parsed.isTextual(), label + " uses a JSON string");
        String cipher = parsed.textValue();
        equal(cipher, Base64.getEncoder().encodeToString(Base64.getDecoder().decode(cipher)), label + " canonical Base64");
        check(!stored.contains(plain), label + " does not store plaintext");
        equal(plain, EncryptUtils.decrypt(cipher, AlgorithmType.AES, PROPERTIES.getAesKey()), label + " decrypts once");
    }

    static List<Original> snapshot(Object... entities) throws IllegalAccessException {
        List<Original> originals = new ArrayList<>();
        for (Object entity : entities) {
            for (Class<?> type = entity.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {
                for (Field field : type.getDeclaredFields()) {
                    if (field.isAnnotationPresent(EncryptField.class) && field.getType() == String.class) {
                        field.setAccessible(true);
                        originals.add(new Original(entity, field, (String) field.get(entity)));
                    }
                }
            }
        }
        return originals;
    }

    static void restored(List<Original> originals, String label) throws IllegalAccessException {
        for (Original original : originals) check(original.value() == original.field().get(original.target()), label + ": " + original.field().getName());
    }

    static Throwable rejects(Class<? extends Throwable> expected, CheckedAction action, String label) throws Throwable {
        try { action.run(); }
        catch (Throwable failure) {
            Throwable matched = failure;
            while (matched != null && !expected.isInstance(matched)) matched = matched.getCause();
            check(matched != null, label + " exception type");
            return failure;
        }
        throw new AssertionError(label + " did not reject");
    }

    static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }
    static void check(boolean condition, String label) {
        ASSERTIONS.incrementAndGet();
        if (!condition) throw new AssertionError(label);
    }

    static void group(String name, CheckedAction action) throws Throwable {
        int before = ASSERTIONS.get();
        action.run();
        System.out.println("PASS " + name + "; assertions=" + (ASSERTIONS.get() - before));
    }

    @FunctionalInterface
    interface CheckedAction { void run() throws Throwable; }
    record Original(Object target, Field field, String value) {}

    private static class BaseFixture {
        @EncryptField
        protected String ordinary;
    }

    private static final class JsonFixture extends BaseFixture {
        @EncryptField(jsonStorage = true)
        private String json;
        JsonFixture(String ordinary, String json) { this.ordinary = ordinary; this.json = json; }
        @Override public boolean equals(Object other) { return other instanceof JsonFixture; }
        @Override public int hashCode() { return 1; }
    }

    private static final class AlgorithmFixture {
        @EncryptField(algorithm = AlgorithmType.BASE64)
        private String base64 = "base64-value";
        @EncryptField
        private String aes = "aes-value";
        @EncryptField(algorithm = AlgorithmType.SM4)
        private String sm4 = "sm4-value";
    }
}
