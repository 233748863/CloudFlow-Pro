package com.cloudflow.common.excel.importing;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.exception.StorageCapacityError;
import com.cloudflow.common.excel.importing.mapper.ImportTaskMapper;
import com.cloudflow.common.excel.importing.model.ImportTask;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.client.RestClient;

/** Real loopback transport and CSV parsing; identity, task mapper and transactions are fixtures. */
public final class ImportCapacityChecks {
    private static int checks;
    private record Response(int status, String body, boolean capacity) { }

    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments[0]).toAbsolutePath().normalize();
        Files.createDirectories(directory);
        Path source = Files.createTempFile(directory, "import-capacity-", ".csv");
        Files.writeString(source, "编码,姓名,邮箱,日期,金额,部门,岗位,手机号,身份证\r\nCAPACITY,验收,,,,,,,\r\n", StandardCharsets.UTF_8);
        AtomicReference<Response> selected = new AtomicReference<>();
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/inner/auth/import-file/7", (com.sun.net.httpserver.HttpExchange exchange) -> {
            try {
                exchange.getRequestBody().transferTo(OutputStream.nullOutputStream());
                requests.incrementAndGet();
                Response response = selected.get();
                byte[] body = response.body().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
                exchange.sendResponseHeaders(response.status(), body.length);
                exchange.getResponseBody().write(body);
            } finally { exchange.close(); }
        });
        server.start();
        try {
            UserContext.setTenantId(100000L); UserContext.setUserId(7L);
            UserContext.setAuthToken("isolated-capacity-fixture");
            UserContext.setPermissions(Set.of("system:import:execute", "system:check:import"));
            String valid = "{\"code\":409,\"msg\":\"" + StorageCapacityError.MESSAGE + "\",\"data\":null}";
            List<Response> cases = List.of(
                    new Response(409, valid, true),
                    new Response(409, valid.replace(",\"data\":null", ""), true),
                    new Response(409, valid.replace("409", "\"409\""), false),
                    new Response(409, valid.replace("409", "409.0"), false),
                    new Response(409, valid.replace("null", "{}"), false),
                    new Response(409, valid.replace(StorageCapacityError.MESSAGE, "private-storage-diagnostic"), false),
                    new Response(409, valid.replace("{\"code\":", "{\"code\":500,\"code\":"), false),
                    new Response(409, valid + "{}", false),
                    new Response(409, "{broken-private-diagnostic", false),
                    new Response(409, " ".repeat(4097) + valid, false),
                    new Response(400, valid, false),
                    new Response(500, valid, false));
            RemoteImportFileStore remote = new RemoteImportFileStore(RestClient.builder(),
                    "http://127.0.0.1:" + server.getAddress().getPort(), "cloudflow-service-hr");
            for (Response response : cases) {
                selected.set(response);
                assertUploadFailure(source, remote, response.capacity());
                try {
                    remote.save(7, source, "capacity.csv", true, 9L);
                    throw new AssertionError("failed error-file save accepted");
                } catch (ServiceException rejected) {
                    check(Objects.equals(rejected.getCode(), 409) == response.capacity(), "remote error-file classification");
                    check((response.capacity() ? StorageCapacityError.MESSAGE : "导入文件保存失败").equals(rejected.getMessage()), "remote diagnostics stay private");
                }
            }
            check(requests.get() == cases.size() * 2, "every remote response reached the real loopback transport");
            for (RuntimeException failure : List.of(StorageCapacityError.exception(),
                    new ServiceException("private-local-diagnostic", 409),
                    new ServiceException(StorageCapacityError.MESSAGE, 500),
                    new IllegalStateException("private-local-diagnostic"))) {
                ImportFileStore local = new ImportFileStore() {
                    @Override public String save(long id, Path file, String name, boolean errors, Long job) { throw failure; }
                    @Override public void copy(long id, boolean errors, OutputStream output) { throw new AssertionError("unexpected read"); }
                    @Override public void clearError(long id, Long job) { throw new AssertionError("unexpected clear"); }
                };
                assertUploadFailure(source, local, failure instanceof ServiceException service
                        && Objects.equals(service.getCode(), 409) && StorageCapacityError.MESSAGE.equals(service.getMessage()));
            }
            System.out.println("IMPORT_CAPACITY_FAILURES: remote_cases=" + cases.size() + "; local_cases=4; checks=" + checks
                    + "; transport=loopback; database=fixture; business_imports=0");
        } finally {
            server.stop(0);
            UserContext.clear();
            Files.deleteIfExists(source);
        }
    }

    private static void assertUploadFailure(Path source, ImportFileStore files, boolean capacity) throws Exception {
        AtomicReference<ImportTask> saved = new AtomicReference<>();
        AtomicReference<Path> temporary = new AtomicReference<>();
        AtomicInteger commits = new AtomicInteger();
        ImportTaskMapper tasks = (ImportTaskMapper) Proxy.newProxyInstance(ImportTaskMapper.class.getClassLoader(),
                new Class<?>[]{ImportTaskMapper.class}, (Object proxy, java.lang.reflect.Method method, Object[] values) -> {
                    if ("insert".equals(method.getName())) {
                        ImportTask task = (ImportTask) values[0]; task.setTaskId(7L); saved.set(task); return 1;
                    }
                    if ("transition".equals(method.getName())) {
                        check(Objects.equals(values[0], 100000L) && Objects.equals(values[1], 7L)
                                && Objects.equals(values[2], 7L) && "UPLOADED".equals(values[3]) && "FAILED".equals(values[4]), "failed upload transition owns the exact task");
                        check("原文件保存失败，请重新上传".equals(values[5]), "persisted failure excludes diagnostics");
                        saved.get().setStatus("FAILED"); return 1;
                    }
                    throw new AssertionError("unexpected task operation: " + method.getName());
                });
        PlatformTransactionManager transactions = new PlatformTransactionManager() {
            @Override public TransactionStatus getTransaction(TransactionDefinition definition) {
                check(definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW, "upload state uses independent transaction");
                return new SimpleTransactionStatus();
            }
            @Override public void commit(TransactionStatus status) { commits.incrementAndGet(); }
            @Override public void rollback(TransactionStatus status) { throw new AssertionError("unexpected state rollback"); }
        };
        ImportIdentity identity = new ImportIdentity(null) {
            @Override public Operator require(String permission) { return new Operator(100000, 7, "capacity-fixture"); }
        };
        ImportFileStore capture = new ImportFileStore() {
            @Override public String save(long id, Path file, String name, boolean errors, Long job) {
                temporary.set(file); return files.save(id, file, name, errors, job);
            }
            @Override public void copy(long id, boolean errors, OutputStream output) { throw new AssertionError("unexpected read"); }
            @Override public void clearError(long id, Long job) { throw new AssertionError("unexpected clear"); }
        };
        ImportChecks.Definition definition = new ImportChecks.Definition(10);
        ImportEngine engine = new ImportEngine(tasks, new ImportRegistry(List.of(definition), List.of(definition)), identity,
                capture, new ImportSpreadsheets(), null, transactions, null, null, null, null, new ObjectMapper());
        try {
            engine.upload("CHECK", new PathMultipartFile(source, "capacity.csv"));
            throw new AssertionError("failed original-file save accepted");
        } catch (ServiceException rejected) {
            check(Objects.equals(rejected.getCode(), 409) == capacity, "only exact capacity failure is a conflict");
            check((capacity ? StorageCapacityError.MESSAGE : "导入文件保存失败，请检查存储配额或联系管理员").equals(rejected.getMessage()), "upload response contains only its fixed explanation");
        }
        check(commits.get() == 2 && "FAILED".equals(saved.get().getStatus()) && "PENDING".equals(saved.get().getFileUrl()), "failed task persists without an original-file reference");
        check(saved.get().getTotalRows() == 1 && saved.get().getSuccessRows() == 0 && saved.get().getJobLogId() == null, "failure does not start import work");
        check(temporary.get() != null && !Files.exists(temporary.get()) && Files.exists(source), "prepared temporary file is removed and original input preserved");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
}
