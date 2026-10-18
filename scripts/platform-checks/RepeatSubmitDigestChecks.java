package com.cloudflow.common.idempotent.checks;

import com.cloudflow.common.idempotent.support.RepeatSubmitKeyResolver;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.springframework.web.multipart.MultipartFile;

public final class RepeatSubmitDigestChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3 || !List.of("Record", "Verify").contains(arguments[0])) {
            throw new IllegalArgumentException("Expected mode, baseline and result paths");
        }
        Path evidence = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        Path baseline = owned(evidence, arguments[1]);
        Path resultPath = owned(evidence, arguments[2]);
        ObjectMapper json = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        json.setTimeZone(TimeZone.getTimeZone("UTC"));
        Map<String, Object[]> cases = cases();
        Map<String, String> digests = new LinkedHashMap<>();
        for (boolean escape : List.of(false, true)) {
            ObjectMapper configured = json.copy().configure(JsonGenerator.Feature.ESCAPE_NON_ASCII, escape);
            RepeatSubmitKeyResolver resolver = new RepeatSubmitKeyResolver(configured);
            resolver.prepareRequestTypes(List.of(Payload.class, Selection.class));
            Method method = RepeatSubmitKeyResolver.class.getDeclaredMethod("buildParamsDigest", Object[].class);
            method.setAccessible(true);
            String prefix = escape ? "escaped/" : "unicode/";
            for (Map.Entry<String, Object[]> entry : cases.entrySet()) {
                digests.put(prefix + entry.getKey(), digest(method, resolver, entry.getValue()));
            }
            require(digests.get(prefix + "map-forward").equals(digests.get(prefix + "map-reverse")), "map order is stable");
            require(digests.get(prefix + "ignored").equals("none"), "nonbusiness arguments are ignored");
            require(digests.get(prefix + "null-arguments").equals("none"), "missing arguments have the original sentinel");
            require(!digests.get(prefix + "one-null").equals("none"), "a null argument remains distinct from no arguments");
            List<CompletableFuture<Boolean>> parallel = new ArrayList<>();
            for (int index = 0; index < 16; index++) {
                parallel.add(CompletableFuture.supplyAsync(() -> {
                    for (Map.Entry<String, Object[]> entry : cases.entrySet()) {
                        if (!digests.get(prefix + entry.getKey()).equals(digest(method, resolver, entry.getValue()))) return false;
                    }
                    return true;
                }));
            }
            for (CompletableFuture<Boolean> completed : parallel) require(completed.join(), "shared resolver is stable across concurrent calls");
        }
        for (String value : digests.values()) require(value.equals("none") || value.matches("[0-9a-f]{32}"), "digest shape is unchanged");
        if (arguments[0].equals("Record")) {
            require(!Files.exists(baseline), "preserve the original baseline");
            json.writerWithDefaultPrettyPrinter().writeValue(baseline.toFile(), digests);
        } else {
            Map<String, String> original = json.readValue(baseline.toFile(), new TypeReference<LinkedHashMap<String, String>>() {});
            require(original.equals(digests), "every digest is byte compatible with the recorded original product");
        }
        require(!Files.exists(resultPath), "preserve the original result");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("passed", true); result.put("mode", arguments[0]); result.put("vectors", digests.size());
        result.put("checks", checks); result.put("parallelCalls", cases.size() * 16 * 2);
        result.put("databaseWrites", 0); result.put("redisWrites", 0); result.put("externalMessages", 0);
        json.writerWithDefaultPrettyPrinter().writeValue(resultPath.toFile(), result);
        System.out.println("REPEAT_DIGEST_CHECKS: mode=" + arguments[0] + "; vectors=" + digests.size()
                + "; checks=" + checks + "; parallel_calls=" + cases.size() * 16 * 2 + "; business_requests=0; redis_writes=0");
    }

    private static Path owned(Path evidence, String value) throws Exception {
        Path path = Path.of(value).toAbsolutePath().normalize();
        if (!path.startsWith(evidence) || !path.getParent().toRealPath().startsWith(evidence) || Files.isSymbolicLink(path)) {
            throw new IllegalArgumentException("Owned evidence path required");
        }
        return path;
    }

    private static String digest(Method method, RepeatSubmitKeyResolver resolver, Object[] arguments) {
        try {
            return String.class.cast(method.invoke(resolver, new Object[]{arguments}));
        } catch (InvocationTargetException failure) {
            throw new IllegalStateException("Digest invocation failed", failure.getCause());
        } catch (ReflectiveOperationException failure) {
            throw new IllegalStateException("Digest method unavailable", failure);
        }
    }

    private static Map<String, Object[]> cases() {
        Map<String, Object[]> cases = new LinkedHashMap<>();
        cases.put("null-arguments", null);
        cases.put("empty-arguments", new Object[0]);
        cases.put("one-null", new Object[]{null});
        cases.put("ascii", new Object[]{"attendance", 30, true, 'A'});
        cases.put("unicode", new Object[]{"考勤😀𠀀", "\"quoted\"\nnext\tline\\end"});
        cases.put("isolated-surrogates", new Object[]{"\uD800", "\uDC00", "a\uD800b"});
        cases.put("numbers", new Object[]{new BigDecimal("120.00"), -0.0d, Double.NaN, Long.MAX_VALUE});
        cases.put("dates", new Object[]{LocalDate.of(2025, 9, 1), LocalDateTime.of(2025, 9, 30, 18, 7, 29), new Date(0)});
        cases.put("identity-values", new Object[]{Thread.State.RUNNABLE, UUID.fromString("12345678-1234-1234-1234-123456789abc")});
        Map<String, Object> forward = new LinkedHashMap<>();
        forward.put("alpha", 1); forward.put("beta", List.of("x", "y"));
        Map<String, Object> reverse = new LinkedHashMap<>();
        reverse.put("beta", List.of("x", "y")); reverse.put("alpha", 1);
        cases.put("map-forward", new Object[]{forward});
        cases.put("map-reverse", new Object[]{reverse});
        Map<Object, Object> mixed = new LinkedHashMap<>();
        mixed.put(1, "number"); mixed.put("1", "text"); mixed.put(null, "ignored"); mixed.put("null", null);
        cases.put("mixed-map-keys", new Object[]{mixed});
        cases.put("primitive-arrays", new Object[]{new int[]{1, -2, 3}, new byte[]{0, 127, -128}, new char[]{'中', 'a'}});
        cases.put("nested", new Object[]{Arrays.asList(forward, new Object[]{null, List.of(1, 2)}, new long[]{3, 4})});
        cases.put("empty-structures", new Object[]{List.of(), Map.of(), new int[0]});
        cases.put("bean", new Object[]{new Payload("考勤", new BigDecimal("1.25"))});
        cases.put("record", new Object[]{new Selection(List.of(77L, 88L), LocalDate.of(2025, 9, 1), false)});
        cases.put("long-text", new Object[]{"考勤😀\n".repeat(4096)});
        Object request = ignored(ServletRequest.class), response = ignored(ServletResponse.class), file = ignored(MultipartFile.class);
        cases.put("ignored", new Object[]{request, response, file, new ByteArrayInputStream(new byte[]{1}), new ByteArrayOutputStream()});
        Map<String, Object> withIgnored = new LinkedHashMap<>();
        withIgnored.put("request", request); withIgnored.put("value", "kept"); withIgnored.put("null", null);
        cases.put("nested-ignored", new Object[]{Arrays.asList(file, "kept", null), withIgnored});
        return cases;
    }

    private static Object ignored(Class<?> type) {
        return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, arguments) -> {
            throw new AssertionError("Ignored framework argument must not be inspected");
        });
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    public record Selection(List<Long> employeeIds, LocalDate from, boolean force) { }

    public static final class Payload {
        private final String name;
        private final BigDecimal amount;
        public Payload(String name, BigDecimal amount) { this.name = name; this.amount = amount; }
        @JsonProperty("名称") public String getName() { return name; }
        public BigDecimal getAmount() { return amount; }
        @JsonIgnore public String getHidden() { return "not-part-of-the-request"; }
    }
}
