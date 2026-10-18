import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.aspect.InnerAspect;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.AbstractBeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.core.env.Environment;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.URL;
import java.net.URLClassLoader;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/** Real loopback HTTP against unchanged, compiled INNER preview products. */
public final class GeneratedInnerHttpChecks {
    private static Class<?> controllerType;
    private static Class<?> serviceType;
    private static final AtomicInteger serviceCalls = new AtomicInteger();
    private static int checks;
    private static int requests;
    private static boolean processesStopped = true;

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    @EnableAspectJAutoProxy(proxyTargetClass = true)
    public static class HttpConfiguration {
        @Bean
        public InnerAspect innerAspect(Environment environment) {
            return new InnerAspect(environment);
        }

        @Bean
        public GlobalExceptionHandler globalExceptionHandler() {
            return new GlobalExceptionHandler();
        }

        @Bean
        public static BeanDefinitionRegistryPostProcessor generatedProductBeans() {
            return new BeanDefinitionRegistryPostProcessor() {
                @Override
                public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
                    RootBeanDefinition serviceDefinition = new RootBeanDefinition(serviceType);
                    serviceDefinition.setInstanceSupplier(() -> Proxy.newProxyInstance(
                            serviceType.getClassLoader(), new Class<?>[]{serviceType}, (proxy, method, arguments) -> {
                                if (method.getDeclaringClass() == Object.class) {
                                    return switch (method.getName()) {
                                        case "toString" -> "ExplicitUnusedGeneratedServiceFixture";
                                        case "hashCode" -> System.identityHashCode(proxy);
                                        case "equals" -> proxy == arguments[0];
                                        default -> throw new AssertionError(method.getName());
                                    };
                                }
                                serviceCalls.incrementAndGet();
                                throw new AssertionError("Generated execute unexpectedly called business dependency: " + method.getName());
                            }));
                    registry.registerBeanDefinition("unusedGeneratedServiceFixture", serviceDefinition);
                    RootBeanDefinition controllerDefinition = new RootBeanDefinition(controllerType);
                    controllerDefinition.setAutowireMode(AbstractBeanDefinition.AUTOWIRE_CONSTRUCTOR);
                    registry.registerBeanDefinition("generatedInnerController", controllerDefinition);
                }

                @Override
                public void postProcessBeanFactory(ConfigurableListableBeanFactory factory) throws BeansException { }
            };
        }
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) throw new IllegalArgumentException("Expected product manifest and owned evidence directory");
        Path manifest = Path.of(arguments[0]).toRealPath();
        Path directory = Path.of(arguments[1]).toRealPath();
        ObjectMapper mapper = new ObjectMapper();
        JsonNode products = mapper.readTree(manifest.toFile());
        check(products.isArray() && products.size() > 0, "At least one actually compiled INNER product is required");
        List<Map<String, Object>> observations = new ArrayList<>();
        boolean passed = false;
        String failure = null;
        try {
            for (JsonNode product : products) {
                observations.add(checkProduct(product, directory, mapper));
            }
            check(serviceCalls.get() == 0, "Unused service fixture never replaces business behavior");
            passed = true;
        } catch (Exception | AssertionError exception) {
            failure = exception.toString();
            throw exception;
        } finally {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("passed", passed);
            result.put("failure", failure);
            result.put("assertions", checks);
            result.put("requests", requests);
            result.put("products", observations);
            result.put("actualLoopbackHttp", true);
            result.put("actualGeneratedControllers", true);
            result.put("actualInnerAspect", true);
            result.put("unusedServiceFixtureCalls", serviceCalls.get());
            result.put("allowedServicesDeclared", false);
            result.put("serviceWhitelistVerified", false);
            result.put("processesStopped", processesStopped);
            result.put("referenceRuntimeWritten", false);
            mapper.writerWithDefaultPrettyPrinter().writeValue(directory.resolve("result.json").toFile(), result);
        }
        System.out.printf("A1_GENERATED_INNER_HTTP: passed=true; products=%d; requests=%d; assertions=%d; service_fixture_calls=0; processes_stopped=%s%n",
                observations.size(), requests, checks, processesStopped);
    }

    private static Map<String, Object> checkProduct(JsonNode product, Path directory, ObjectMapper mapper) throws Exception {
        String label = product.path("label").asText();
        check(label.matches("[a-z0-9_-]+"), "Owned product label");
        Path classes = Path.of(product.path("classes").asText()).toRealPath();
        check(classes.startsWith(directory.getParent().resolve("products").toRealPath()), "Compiled product belongs to this artifact round");
        Path owned = Files.createDirectory(directory.resolve(label));
        ClassLoader previousLoader = Thread.currentThread().getContextClassLoader();
        List<Map<String, Object>> cases = new ArrayList<>();
        try (URLClassLoader loader = new URLClassLoader(new URL[]{classes.toUri().toURL()}, GeneratedInnerHttpChecks.class.getClassLoader())) {
            controllerType = Class.forName(product.path("controller").asText(), true, loader);
            check(controllerType.getClassLoader() == loader, "Controller loaded from actual product classes");
            check(Path.of(controllerType.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath().equals(classes), "Controller class origin matches compiled product");
            Constructor<?>[] constructors = controllerType.getDeclaredConstructors();
            check(constructors.length == 1 && constructors[0].getParameterCount() == 1, "Original generated controller constructor");
            serviceType = constructors[0].getParameterTypes()[0];
            check(serviceType.isInterface() && serviceType.getClassLoader() == loader, "Original generated service dependency");
            Method execute = List.of(controllerType.getDeclaredMethods()).stream().filter(method -> method.getName().equals("execute")).findFirst().orElseThrow();
            Inner inner = execute.getAnnotation(Inner.class);
            check(inner != null && inner.value() && inner.allowedServices().length == 0, "Original INNER annotation has no service whitelist");
            RequestMapping mapping = controllerType.getAnnotation(RequestMapping.class);
            check(mapping != null && mapping.value().length == 1 && mapping.value()[0].startsWith("/inner/"), "Original generated internal route");
            Thread.currentThread().setContextClassLoader(loader);
            AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
            web.setClassLoader(loader);
            web.register(HttpConfiguration.class);
            Tomcat server = new Tomcat();
            server.setBaseDir(owned.resolve("tomcat").toString());
            server.setPort(0);
            server.getConnector().setProperty("address", "127.0.0.1");
            Context context = server.addContext("", owned.toString());
            context.setParentClassLoader(loader);
            Wrapper servlet = Tomcat.addServlet(context, "generated-inner", new DispatcherServlet(web));
            servlet.setLoadOnStartup(1);
            context.addServletMappingDecoded("/", "generated-inner");
            processesStopped = false;
            try {
                server.start();
                check(AopUtils.isAopProxy(web.getBean("generatedInnerController")), "Real Spring aspect proxies generated controller");
                String base = "http://127.0.0.1:" + server.getConnector().getLocalPort() + mapping.value()[0] + "/execute";
                HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
                List<HeaderCase> headers = List.of(
                        new HeaderCase("missing", Map.of(), 403),
                        new HeaderCase("false", Map.of("X-Inner-Call", "false"), 403),
                        new HeaderCase("uppercase", Map.of("X-Inner-Call", "TRUE"), 403),
                        new HeaderCase("source-only", Map.of("X-From-Service", "cloudflow-service-oa"), 403),
                        new HeaderCase("valid-with-source", Map.of("X-Inner-Call", "true", "X-From-Service", "cloudflow-service-oa"), 200),
                        new HeaderCase("valid-without-source", Map.of("X-Inner-Call", "true"), 200));
                for (HeaderCase candidate : headers) {
                    HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base)).timeout(Duration.ofSeconds(15))
                            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString("{}", StandardCharsets.UTF_8));
                    candidate.headers().forEach(builder::header);
                    HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    requests++;
                    JsonNode body = mapper.readTree(response.body());
                    Map<String, Object> observation = new LinkedHashMap<>();
                    observation.put("case", candidate.name());
                    observation.put("headers", candidate.headers());
                    observation.put("status", response.statusCode());
                    observation.put("bodyCode", body.path("code").asInt());
                    observation.put("message", body.path("msg").asText());
                    cases.add(observation);
                    check(response.statusCode() == candidate.expectedStatus(), label + "/" + candidate.name() + " HTTP status: " + response.statusCode());
                    check(body.path("code").asInt() == candidate.expectedStatus(), label + "/" + candidate.name() + " body code");
                    if (candidate.expectedStatus() == 403) {
                        check(body.path("msg").asText().equals("该接口仅允许内部服务调用"), "Real InnerAspect rejection message");
                    }
                }
            } finally {
                try { server.stop(); }
                finally {
                    try { server.destroy(); }
                    finally { web.close(); }
                }
                processesStopped = true;
            }
        } finally {
            Thread.currentThread().setContextClassLoader(previousLoader);
            controllerType = null;
            serviceType = null;
            Files.writeString(owned.resolve("http-cases.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(cases),
                    StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
        }
        return Map.of("label", label, "classes", classes.toString(), "cases", cases, "requests", cases.size());
    }

    private static void check(boolean passed, String description) {
        if (!passed) throw new AssertionError(description);
        checks++;
    }

    private record HeaderCase(String name, Map<String, String> headers, int expectedStatus) { }
}
