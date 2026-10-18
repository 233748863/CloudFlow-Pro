import com.cloudflow.auth.controller.SysCodegenController;
import com.cloudflow.auth.domain.dto.CodegenWriteDTO;
import com.cloudflow.auth.domain.vo.CodegenOptionsVO;
import com.cloudflow.auth.domain.vo.CodegenWriteResultVO;
import com.cloudflow.auth.service.ISysCodegenService;
import com.cloudflow.auth.service.impl.SysCodegenServiceImpl;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.AbstractMap;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

public final class CodegenBoundaryChecks {
    private static final String JAVA_FILE = "src/main/java/generated/WriteProbe.java";
    private static final String SOURCE = "package generated; public class WriteProbe {}\n";
    private static ISysCodegenService httpService;
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length < 1 || arguments.length > 2
                || (arguments.length == 2 && !"--files-only".equals(arguments[1]))) {
            throw new IllegalArgumentException("Expected owned verification directory and optional --files-only");
        }
        Path root = Path.of(arguments[0]).toRealPath();
        boolean filesOnly = arguments.length == 2;
        if (!filesOnly) checkHttpGate(root.resolve("http"));
        checkFileWrites(root.resolve("writes"));
        checkConcurrentReplacement(root.resolve("concurrent"));
        System.out.printf("CODEGEN_BOUNDARY_CHECKS: assertions=%d; disabled_http_endpoints=%d; enabled_control=%d; runtime_database_writes=0; running_service_restarts=0%n", checks, filesOnly ? 0 : 11, filesOnly ? 0 : 1);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    public static class HttpConfiguration {
        @Bean
        public SysCodegenController codegenController() { return new SysCodegenController(httpService); }

        @Bean
        public GlobalExceptionHandler globalExceptionHandler() { return new GlobalExceptionHandler(); }
    }

    private static void checkHttpGate(Path directory) throws Exception {
        Files.createDirectories(directory);
        AtomicInteger serviceCalls = new AtomicInteger();
        httpService = (ISysCodegenService) Proxy.newProxyInstance(ISysCodegenService.class.getClassLoader(), new Class<?>[]{ISysCodegenService.class}, (proxy, method, arguments) -> {
            if (method.getDeclaringClass() == Object.class) {
                return switch (method.getName()) {
                    case "toString" -> "CodegenBoundaryService";
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == arguments[0];
                    default -> throw new AssertionError(method.getName());
                };
            }
            serviceCalls.incrementAndGet();
            if (method.getName().equals("getOptions")) return CodegenOptionsVO.builder().build();
            throw new AssertionError("Disabled controller reached service: " + method.getName());
        });
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        web.getEnvironment().getPropertySources().addFirst(new MapPropertySource("codegen-boundary", Map.of("cloudflow.codegen.enabled", "false")));
        web.register(HttpConfiguration.class);
        Tomcat server = new Tomcat();
        server.setBaseDir(directory.resolve("tomcat").toString());
        server.setPort(0);
        server.getConnector().setProperty("address", "127.0.0.1");
        Context context = server.addContext("", directory.toString());
        context.setParentClassLoader(CodegenBoundaryChecks.class.getClassLoader());
        Wrapper servlet = Tomcat.addServlet(context, "codegen", new DispatcherServlet(web));
        servlet.setLoadOnStartup(1);
        context.addServletMappingDecoded("/", "codegen");
        try {
            server.start();
            String base = "http://127.0.0.1:" + server.getConnector().getLocalPort() + "/system/codegen";
            System.out.println("CODEGEN_HTTP_BASE=" + base);
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            ObjectMapper mapper = new ObjectMapper();
            List<RequestCase> requests = List.of(
                    new RequestCase("GET", "/db/list", null), new RequestCase("GET", "/list", null),
                    new RequestCase("GET", "/options", null), new RequestCase("GET", "/1", null),
                    new RequestCase("POST", "/import", "{\"tableNames\":[\"oa_probe\"],\"moduleName\":\"oa\"}"),
                    new RequestCase("PUT", "", "{\"table\":{},\"columns\":[]}"),
                    new RequestCase("POST", "/1/sync", null), new RequestCase("GET", "/1/preview", null),
                    new RequestCase("GET", "/1/download", null),
                    new RequestCase("POST", "/1/write", "{\"targetRoot\":\"generated\",\"confirmOverwrite\":true}"),
                    new RequestCase("DELETE", "/1,2", null));
            for (RequestCase request : requests) {
                HttpResponse<String> response = request(client, base, request);
                check(response.statusCode() == 403, "disabled HTTP status " + request.method() + request.path() + ": " + response.statusCode());
                check(mapper.readTree(response.body()).path("code").asInt() == 403, "disabled response body code");
                check(serviceCalls.get() == 0, "disabled request never reaches business service");
                System.out.printf("CODEGEN_DISABLED_HTTP: method=%s; path=%s; status=%d; service_calls=%d%n", request.method(), "/system/codegen" + request.path(), response.statusCode(), serviceCalls.get());
            }
            Field enabled = SysCodegenController.class.getDeclaredField("enabled");
            enabled.setAccessible(true);
            enabled.set(web.getBean(SysCodegenController.class), true);
            HttpResponse<String> response = request(client, base, new RequestCase("GET", "/options", null));
            check(response.statusCode() == 200, "enabled positive control HTTP status");
            check(mapper.readTree(response.body()).path("code").asInt() == 200, "enabled positive control body code");
            check(serviceCalls.get() == 1, "enabled positive control reaches business service once");
            System.out.println("CODEGEN_ENABLED_CONTROL: method=GET; path=/system/codegen/options; status=200; service_calls=1");
        } finally {
            try { server.stop(); }
            finally { server.destroy(); web.close(); }
        }
    }

    private static HttpResponse<String> request(HttpClient client, String base, RequestCase request) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base + request.path())).timeout(Duration.ofSeconds(10));
        if (request.body() != null) builder.header("Content-Type", "application/json");
        builder.method(request.method(), request.body() == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(request.body(), StandardCharsets.UTF_8));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private static void checkFileWrites(Path root) throws Exception {
        Files.createDirectories(root);
        Path project = Files.createDirectory(root.resolve("normal"));
        LinkedHashMap<String, String> files = new LinkedHashMap<String, String>();
        files.put(JAVA_FILE, SOURCE);
        files.put("src/main/resources/mapper/WriteProbe.xml", "<mapper namespace=\"generated.WriteProbe\"/>\n");
        files.put("sql/probe.sql", "SELECT 1;\n");
        SysCodegenServiceImpl service = service(project, files);
        Path existing = project.resolve("output").resolve(JAVA_FILE);
        Files.createDirectories(existing.getParent());
        Files.writeString(existing, "owned existing file", StandardOpenOption.CREATE_NEW);
        CodegenWriteDTO defaultRequest = new CodegenWriteDTO();
        defaultRequest.setTargetRoot("output");
        check(Boolean.FALSE.equals(defaultRequest.getConfirmOverwrite()), "overwrite defaults to false");
        CodegenWriteResultVO result = service.writeToDisk(1L, defaultRequest);
        check(result.getWritten().size() == 2, "new files written without overwriting");
        check(result.getSkipped().equals(List.of("output/" + JAVA_FILE)), "existing file listed for confirmation");
        check(result.getOverwritten().isEmpty(), "no overwrite without confirmation");
        check(Files.readString(existing).equals("owned existing file"), "existing content preserved");
        defaultRequest.setConfirmOverwrite(null);
        CodegenWriteResultVO nullConfirmation = service.writeToDisk(1L, defaultRequest);
        check(nullConfirmation.getSkipped().size() == 3 && nullConfirmation.getOverwritten().isEmpty(), "null confirmation cannot overwrite files");
        check(Files.readString(existing).equals("owned existing file"), "null confirmation preserves existing content");
        result = service.writeToDisk(1L, write("output", true));
        check(result.getWritten().isEmpty() && result.getSkipped().isEmpty(), "confirmed write reports existing files as overwritten");
        check(result.getOverwritten().size() == 3, "confirmed overwritten count");
        check(Files.readString(existing).equals(SOURCE), "confirmed overwrite has generated content");
        System.out.println("CODEGEN_FILE_OVERWRITE: default_skipped=1; default_overwritten=0; null_confirmation_skipped=3; confirmed_overwritten=3; existing_content_preserved_before_confirmation=true");

        for (String target : List.of("", " ", "../outside", "safe/../../outside", "..\\outside", project.resolve("absolute").toString(), "DB", "db", "config", ".git", "target", "bad\0path")) {
            rejects(() -> service.writeToDisk(1L, write(target, true)), "unsafe output path");
        }
        rejects(() -> service.writeToDisk(1L, null), "null write request");
        for (String entry : List.of("../escape.java", "src/../../escape.java", project.resolve("absolute.java").toString())) {
            SysCodegenServiceImpl unsafe = service(project, Map.of(entry, SOURCE));
            rejects(() -> unsafe.writeToDisk(1L, write("unsafe-entry", true)), "unsafe generated path");
        }
        check(!Files.exists(root.resolve("outside")), "traversal creates no outside directory");
        System.out.println("CODEGEN_PATH_REJECTIONS: invalid_targets=13; invalid_generated_paths=3; outside_directory_created=false");

        Path outsideCase = Files.createDirectory(root.resolve("outside-link"));
        Path outsideProject = Files.createDirectory(outsideCase.resolve("project"));
        Path outside = Files.createDirectory(outsideCase.resolve("outside"));
        junction(root, outsideProject.resolve("src"), outside);
        SysCodegenServiceImpl outsideService = service(outsideProject, Map.of(JAVA_FILE, SOURCE));
        rejects(() -> outsideService.writeToDisk(1L, write(".", true)), "directory link cannot leave project");
        check(!Files.exists(outside.resolve("main")), "outside directory remains unchanged");
        System.out.println("CODEGEN_EXTERNAL_LINK: rejected=true; outside_files_written=0");

        Path protectedProject = Files.createDirectory(root.resolve("protected-link"));
        Path protectedDirectory = Files.createDirectory(protectedProject.resolve("DB"));
        junction(root, protectedProject.resolve("src"), protectedDirectory);
        Path protectedFile = protectedDirectory.resolve("main/java/generated/WriteProbe.java");
        Files.createDirectories(protectedFile.getParent());
        Files.writeString(protectedFile, "owned protected file", StandardOpenOption.CREATE_NEW);
        SysCodegenServiceImpl protectedService = service(protectedProject, Map.of(JAVA_FILE, SOURCE));
        boolean rejected = false;
        try { protectedService.writeToDisk(1L, write(".", true)); }
        catch (ServiceException expected) { rejected = true; }
        boolean unchanged = Files.readString(protectedFile).equals("owned protected file");
        System.out.printf("CODEGEN_PROTECTED_LINK: rejected=%s; protected_content_unchanged=%s%n", rejected, unchanged);
        check(rejected, "directory link cannot bypass protected directory");
        check(unchanged, "protected directory content remains unchanged");

        Path safeProject = Files.createDirectory(root.resolve("safe-link"));
        Path safeDirectory = Files.createDirectory(safeProject.resolve("actual-output"));
        junction(root, safeProject.resolve("output-link"), safeDirectory);
        SysCodegenServiceImpl safeService = service(safeProject, Map.of(JAVA_FILE, SOURCE));
        CodegenWriteResultVO safeResult = safeService.writeToDisk(1L, write("output-link", false));
        check(safeResult.getWritten().equals(List.of("output-link/" + JAVA_FILE)), "safe in-project alias retains requested result path");
        check(Files.readString(safeDirectory.resolve(JAVA_FILE)).equals(SOURCE), "safe in-project alias writes its allowed target");
        System.out.println("CODEGEN_INTERNAL_LINK: allowed=true; written_files=1");
        checkFinalFileLinks(root.resolve("final-file-links"));
    }

    private static void checkFinalFileLinks(Path root) throws Exception {
        Files.createDirectory(root);
        Path project = Files.createDirectory(root.resolve("project"));
        Path outside = Files.createDirectory(root.resolve("outside"));
        Path sentinel = Files.writeString(outside.resolve("sentinel.txt"), "owned link sentinel", StandardOpenOption.CREATE_NEW);
        Path output = Files.createDirectory(project.resolve("output"));
        Path hardLink = Files.createLink(output.resolve("hard.txt"), sentinel);
        SysCodegenServiceImpl hardService = service(project, Map.of("hard.txt", SOURCE));
        CodegenWriteResultVO skipped = hardService.writeToDisk(1L, write("output", false));
        check(skipped.getSkipped().equals(List.of("output/hard.txt")), "hard link requires overwrite confirmation");
        CodegenWriteResultVO overwritten = hardService.writeToDisk(1L, write("output", true));
        check(overwritten.getOverwritten().equals(List.of("output/hard.txt")), "confirmed hard link entry replaced");
        check(Files.readString(sentinel).equals("owned link sentinel"), "hard link target remains unchanged");
        check(Files.readString(hardLink).equals(SOURCE), "hard link output has generated content");
        check(!Files.isSameFile(hardLink, sentinel), "overwrite detaches hard link before changing content");
        Path symbolicLink = Files.createSymbolicLink(output.resolve("symbolic.txt"), sentinel);
        SysCodegenServiceImpl symbolicService = service(project, Map.of("symbolic.txt", SOURCE));
        rejects(() -> symbolicService.writeToDisk(1L, write("output", false)), "external file link rejected without confirmation");
        rejects(() -> symbolicService.writeToDisk(1L, write("output", true)), "symbolic final file cannot be followed");
        check(Files.isSymbolicLink(symbolicLink), "rejected file link remains a link");
        check(Files.readString(sentinel).equals("owned link sentinel"), "symbolic link target remains unchanged");
        Path internalTarget = Files.writeString(project.resolve("internal.txt"), "owned internal sentinel", StandardOpenOption.CREATE_NEW);
        Files.createSymbolicLink(output.resolve("internal-link.txt"), internalTarget);
        SysCodegenServiceImpl internalService = service(project, Map.of("internal-link.txt", SOURCE));
        rejects(() -> internalService.writeToDisk(1L, write("output", false)), "file link outside requested output rejected without confirmation");
        rejects(() -> internalService.writeToDisk(1L, write("output", true)), "internal file link cannot overwrite its target");
        check(Files.readString(internalTarget).equals("owned internal sentinel"), "internal file link target remains unchanged");
        try (java.util.stream.Stream<Path> files = Files.list(output)) {
            check(files.noneMatch(path -> path.getFileName().toString().startsWith(".codegen-")), "no temporary overwrite files remain");
        }
        System.out.println("CODEGEN_FINAL_FILE_LINKS: hard_link_detached=true; symbolic_link_rejected=true; outside_content_unchanged=true; temporary_files=0");
    }

    private static SysCodegenServiceImpl service(Path project, Map<String, String> files) throws Exception {
        SysCodegenServiceImpl service = new SysCodegenServiceImpl(null, null) {
            @Override
            public Map<String, String> preview(Long tableId) {
                check(Long.valueOf(1).equals(tableId), "preview fixture identifier");
                return files;
            }
        };
        Field field = SysCodegenServiceImpl.class.getDeclaredField("configuredProjectRoot");
        field.setAccessible(true);
        field.set(service, project.toRealPath().toString());
        return service;
    }

    private static void checkConcurrentReplacement(Path root) throws Exception {
        Files.createDirectory(root);
        Path project = Files.createDirectory(root.resolve("project"));
        Path outside = Files.createDirectory(root.resolve("outside"));
        Path target = Files.createDirectory(project.resolve("output"));
        Path sentinel = Files.writeString(outside.resolve("sentinel.txt"), "owned outside sentinel", StandardOpenOption.CREATE_NEW);
        CountDownLatch attempt = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicInteger renameDenied = new AtomicInteger();
        Thread replacement = new Thread(() -> {
            try {
                check(attempt.await(10, TimeUnit.SECONDS), "writer reaches pinned-directory stage");
                try {
                    Files.move(target, project.resolve("displaced"));
                    junction(root, target, outside);
                } catch (java.nio.file.FileSystemException expected) {
                    renameDenied.incrementAndGet();
                }
            } catch (Throwable exception) {
                failure.set(exception);
            } finally {
                completed.countDown();
            }
        }, "owned-codegen-directory-replacement");
        Map<String, String> files = new AbstractMap<>() {
            @Override
            public Set<Map.Entry<String, String>> entrySet() {
                attempt.countDown();
                try {
                    check(completed.await(15, TimeUnit.SECONDS), "concurrent replacement finishes within limit");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(exception);
                }
                if (failure.get() != null) throw new AssertionError(failure.get());
                return Map.of(JAVA_FILE, SOURCE).entrySet();
            }
        };
        replacement.start();
        CodegenWriteResultVO written = null;
        boolean rejectedReplacement = false;
        try {
            try { written = service(project, files).writeToDisk(1L, write("output", false)); }
            catch (ServiceException exception) {
                if (System.getProperty("os.name").startsWith("Windows")) throw exception;
                rejectedReplacement = true;
            }
        } finally {
            attempt.countDown();
            replacement.join(15000);
            check(!replacement.isAlive(), "concurrent replacement thread stopped");
        }
        if (System.getProperty("os.name").startsWith("Windows")) {
            check(renameDenied.get() == 1, "pinned directory cannot be renamed during write");
            check(written.getWritten().equals(List.of("output/" + JAVA_FILE)), "concurrent replacement preserves normal output");
            check(Files.readString(target.resolve(JAVA_FILE)).equals(SOURCE), "normal output has actual generated bytes");
        } else {
            check(renameDenied.get() == 0 && rejectedReplacement, "Linux rejects replaced path before writing");
            check(!Files.exists(project.resolve("displaced").resolve(JAVA_FILE)), "Linux replacement creates no file in displaced directory");
        }
        check(Files.readString(sentinel).equals("owned outside sentinel"), "concurrent replacement preserves sentinel");
        try (java.util.stream.Stream<Path> outsideFiles = Files.list(outside)) {
            check(outsideFiles.count() == 1, "concurrent replacement writes no outside files");
        }

        Path replaced = Files.createDirectory(project.resolve("replaced-before-lock"));
        SysCodegenServiceImpl beforeLock = new SysCodegenServiceImpl(null, null) {
            @Override
            public Map<String, String> preview(Long tableId) {
                try {
                    Files.move(replaced, project.resolve("original-before-lock"));
                    junction(root, replaced, outside);
                } catch (Exception exception) {
                    throw new AssertionError(exception);
                }
                return Map.of(JAVA_FILE, SOURCE);
            }
        };
        Field field = SysCodegenServiceImpl.class.getDeclaredField("configuredProjectRoot");
        field.setAccessible(true);
        field.set(beforeLock, project.toRealPath().toString());
        rejects(() -> beforeLock.writeToDisk(1L, write("replaced-before-lock", true)), "replacement after original path validation is rejected");
        check(Files.readString(sentinel).equals("owned outside sentinel"), "pre-lock replacement preserves sentinel");
        try (java.util.stream.Stream<Path> outsideFiles = Files.list(outside)) {
            check(outsideFiles.count() == 1, "pre-lock replacement writes no outside files");
        }
        System.out.printf("CODEGEN_CONCURRENT_REPLACEMENT: executed=true; pinned_rename_denied=%d; replaced_path_rejected=%s; before_lock_rejected=true; outside_files_written=0; replacement_thread_stopped=true%n", renameDenied.get(), rejectedReplacement);
    }

    private static CodegenWriteDTO write(String target, boolean confirm) {
        CodegenWriteDTO request = new CodegenWriteDTO();
        request.setTargetRoot(target);
        request.setConfirmOverwrite(confirm);
        return request;
    }

    private static void junction(Path ownedRoot, Path link, Path target) throws Exception {
        Path canonicalRoot = ownedRoot.toRealPath();
        Path canonicalTarget = target.toRealPath();
        check(link.toAbsolutePath().normalize().startsWith(canonicalRoot), "test link is inside owned verification root");
        check(link.getParent().toRealPath().startsWith(canonicalRoot), "test link parent is inside owned verification root");
        check(canonicalTarget.startsWith(canonicalRoot), "test link target is inside owned verification root");
        if (System.getProperty("os.name").startsWith("Windows")) {
            ProcessBuilder builder = new ProcessBuilder("pwsh", "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:CLOUDFLOW_TEST_LINK -Target $env:CLOUDFLOW_TEST_TARGET | Out-Null");
            builder.environment().put("CLOUDFLOW_TEST_LINK", link.toString());
            builder.environment().put("CLOUDFLOW_TEST_TARGET", canonicalTarget.toString());
            builder.redirectErrorStream(true);
            Process process = builder.start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            check(process.waitFor() == 0, "owned directory junction creation: " + output);
        } else {
            Files.createSymbolicLink(link, canonicalTarget);
        }
        check(Files.isSameFile(link, canonicalTarget), "test directory link points to its owned target");
    }

    private static void rejects(Runnable action, String label) {
        try { action.run(); }
        catch (ServiceException expected) { checks++; return; }
        throw new AssertionError(label + ": expected rejection");
    }

    private static void check(boolean passed, String label) {
        if (!passed) throw new AssertionError(label);
        checks++;
    }

    private record RequestCase(String method, String path, String body) {}
}
