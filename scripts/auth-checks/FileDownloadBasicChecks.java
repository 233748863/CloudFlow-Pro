package com.cloudflow.auth.download;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.preview.FilePreviewResolver;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

/** Uses production services with controlled Redis, authorization and storage; no HTTP or cloud claim. */
public final class FileDownloadBasicChecks {
    private static int checks;
    private static boolean permission = true;
    private static final Map<String, Long> SESSIONS = Map.of("session-one", 7L, "session-two", 7L, "session-other", 8L);

    public static void main(String[] arguments) throws Exception {
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("file-download-basic") {
            @Override public void checkPermission(String value) {
                if (!permission) throw new ServiceException("denied", 403);
            }
            @Override public Object getLoginIdByToken(String value) { return SESSIONS.get(value); }
        });
        try {
            identity(7L, 3L, "session-one");
            tickets(); service(); oa(); hr(); crm(); sensitivePaths();
            System.out.println("FILE_DOWNLOAD_BASIC: checks=" + checks + "; failed=0; redis_controlled=true; authorization_controlled=true; storage_controlled=true; http=false; cloud=false");
        } finally { permission = true; UserContext.clear(); StpUtil.setStpLogic(previous); }
    }

    private static void tickets() {
        MemoryRedis redis = new MemoryRedis();
        Clock clock = Clock.fixed(Instant.parse("2026-10-17T00:00:00Z"), ZoneOffset.UTC);
        FileDownloadTickets tickets = new FileDownloadTickets(redis, new ObjectMapper(), clock);
        FileDownloadTickets.Access access = tickets.issue(context("PUBLIC"), "stamp", 300);
        String token = token(access);
        check(token.matches("[A-Za-z0-9_-]{43}"), "random token format");
        equal(Duration.ofSeconds(300), redis.ttl, "redis ttl");
        equal(clock.millis() + 300000, access.expiresAt(), "default expiry");
        check(redis.data.keySet().stream().noneMatch(key -> key.contains(token)), "redis key stores digest");
        equal(41L, tickets.verify(token).request().fileId(), "valid ticket");
        rejects(410, () -> tickets.verify("invalid"), "malformed token");
        identity(8L, 3L, "session-other");
        rejects(410, () -> tickets.verify(token), "other user");
        identity(7L, 4L, "session-one");
        rejects(410, () -> tickets.verify(token), "other tenant");
        identity(7L, 3L, "session-two");
        rejects(410, () -> tickets.verify(token), "other session");
        identity(7L, 3L, "session-one");
        FileDownloadTickets expired = new FileDownloadTickets(redis, new ObjectMapper(), Clock.offset(clock, Duration.ofSeconds(300)));
        rejects(410, () -> expired.verify(token), "exact expiry");
        equal(clock.millis() + 3600000, tickets.issue(context("PUBLIC"), "stamp", 3600).expiresAt(), "maximum expiry");
        rejects(503, () -> tickets.issue(context("PUBLIC"), "stamp", 3601), "over maximum");
        permission = false;
        equal(41L, tickets.verify(token).request().fileId(), "ticket requires session, not unrelated preview permission");
        rejects(403, FilePreviewAccess::requireContext, "preview business still requires preview permission");
        permission = true;
        identity(7L, 3L, "invalid-session");
        rejects(401, () -> tickets.verify(token), "invalid login session");
        identity(7L, 3L, "session-one");
        redis.failed = true;
        rejects(503, () -> tickets.verify(token), "redis outage");
    }

    private static void service() {
        MemoryRedis redis = new MemoryRedis();
        FileDownloadTickets tickets = new FileDownloadTickets(redis, new ObjectMapper());
        SysFile file = new SysFile();
        file.setFileId(41L); file.setTenantId(3L); file.setDeleted(0); file.setFileName("附件.zip");
        file.setFilePath("tenant3/example.zip"); file.setStorageType("LOCAL"); file.setConfigId(17L); file.setAccessType("PRIVATE");
        ControlledChecker checker = new ControlledChecker(file);
        ControlledStorage backend = new ControlledStorage();
        FileStorageRegistry registry = new FileStorageRegistry(List.of(), null, null) {
            @Override public FileStorageService getForFile(SysFile selected) {
                equal(17L, selected.getConfigId(), "original configuration selected");
                return backend;
            }
        };
        FileDownloadService service = new FileDownloadService(List.of(checker), registry, tickets, null, null, null);
        FileDownloadTickets.Access access = service.issue(41L, context("PUBLIC"));
        equal(Duration.ofSeconds(300), redis.ttl, "service default ttl");
        CapturedResponse response = new CapturedResponse();
        service.download(token(access), response.proxy());
        equal("download bytes", response.bytes.toString(java.nio.charset.StandardCharsets.UTF_8), "local streaming bytes");
        check(response.headers.get("Content-Disposition").startsWith("attachment;"), "attachment disposition");
        check(response.headers.get("Cache-Control").contains("no-store"), "no-store header");
        checker.stamp = "changed";
        rejects(410, () -> service.download(token(access), new CapturedResponse().proxy()), "changed file");
        checker.stamp = "stamp";
        file.setDeleted(1);
        rejects(403, () -> service.download(token(access), new CapturedResponse().proxy()), "deleted file");
        file.setDeleted(0); file.setTenantId(4L);
        rejects(403, () -> service.issue(41L, context("PUBLIC")), "file tenant guard");
        file.setTenantId(3L);
        checker.allowed = false;
        rejects(403, () -> service.issue(41L, context("PUBLIC")), "business denied");
        checker.allowed = true;
        rejects(403, () -> service.issue(41L, context("UNKNOWN")), "unregistered business");
        rejects(403, () -> service.issue(42L, context("PUBLIC")), "path id mismatch");
        file.setAccessType("PUBLIC"); file.setUrl("https://cdn.example.test/open.zip");
        equal(file.getUrl(), service.issue(41L, context("PUBLIC")).url(), "public direct link");
        file.setAccessType("PRIVATE");
        backend.type = FileStorageType.MINIO;
        backend.config = new SysFileConfig(); backend.config.setSignedUrlExpireSeconds(900);
        FileDownloadTickets.Access signed = service.issue(41L, context("PUBLIC"));
        equal("https://storage.example.test/object?signature=controlled", signed.url(), "native object signing");
        equal(900, backend.seconds, "configured signing seconds");
        equal(file.getFilePath(), backend.path, "original object key");
        backend.config.setSignedUrlExpireSeconds(3601);
        rejects(503, () -> service.issue(41L, context("PUBLIC")), "invalid configuration");
        backend.config.setSignedUrlExpireSeconds(300); backend.failSigning = true;
        rejects(503, () -> service.issue(41L, context("PUBLIC")), "signing failure");
        boolean duplicate = false;
        try { new FileDownloadService(List.of(checker, checker), registry, tickets, null, null, null); }
        catch (IllegalStateException failure) { duplicate = true; }
        check(duplicate, "duplicate registration rejected");
    }

    private static void oa() {
        SysFile file = new SysFile(); file.setFileId(41L); file.setTenantId(3L); file.setDeleted(0);
        file.setFileName("attachment.pdf"); file.setStorageType("LOCAL"); file.setAccessType("PRIVATE"); file.setConfigId(17L);
        int[] remoteReads = {0}; int[] storageReads = {0}; int[] previewCalls = {0};
        boolean[] allowed = {true}; String[] reference = {""};
        com.cloudflow.auth.preview.OaFilePreviewClient oa = (com.cloudflow.auth.preview.OaFilePreviewClient) Proxy.newProxyInstance(
                FileDownloadBasicChecks.class.getClassLoader(), new Class<?>[]{com.cloudflow.auth.preview.OaFilePreviewClient.class}, (proxy, method, args) -> {
                    if (method.getName().equals("authorize")) { previewCalls[0]++; throw new AssertionError("download cannot invoke preview authorization"); }
                    if (method.getName().equals("authorizeDownload")) {
                        if (!allowed[0]) return com.cloudflow.common.core.domain.R.fail(403, "denied");
                        FilePreviewRequest input = (FilePreviewRequest) args[0];
                        return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.common.core.file.FilePreviewBinding(
                                com.cloudflow.common.core.file.FilePreviewReferences.choose(input, List.of(reference[0])), "business"));
                    }
                    if (method.getName().equals("downloadContent")) {
                        remoteReads[0]++;
                        return feign.Response.builder().status(200).reason("OK").headers(Map.of())
                                .request(feign.Request.create(feign.Request.HttpMethod.POST, "http://oa.internal/download-content", Map.of(), null, java.nio.charset.StandardCharsets.UTF_8, null))
                                .body("oa original bytes", java.nio.charset.StandardCharsets.UTF_8).build();
                    }
                    throw new AssertionError(method.getName());
                });
        com.cloudflow.auth.mapper.SysFileMapper mapper = (com.cloudflow.auth.mapper.SysFileMapper) Proxy.newProxyInstance(
                FileDownloadBasicChecks.class.getClassLoader(), new Class<?>[]{com.cloudflow.auth.mapper.SysFileMapper.class}, (proxy, method, args) -> file);
        ControlledStorage backend = new ControlledStorage();
        FileStorageRegistry registry = new FileStorageRegistry(List.of(), null, null) {
            @Override public FileStorageService getForFile(SysFile selected) { storageReads[0]++; return backend; }
        };
        FilePreviewResolver resolver = new FilePreviewResolver(null, mapper, registry, oa, null, null, new ObjectMapper());
        FileDownloadService service = new FileDownloadService(List.of(new BusinessFileAccessChecker(resolver)), registry,
                new FileDownloadTickets(new MemoryRedis(), new ObjectMapper()), oa, null, null);
        for (String type : List.of("OA_RFQ_INVITATION", "OA_RFQ_QUOTATION", "OA_CONTRACT_SIGNED", "OA_CONTRACT_EVIDENCE")) {
            reference[0] = "oa-file:" + type.substring(3) + ":41"; file.setFileType(type);
            FilePreviewRequest request = new FilePreviewRequest(type, "19", null, reference[0], null,
                    type.equals("OA_CONTRACT_EVIDENCE") ? 5L : null, null, null, null, null, null);
            FileDownloadTickets.Access access = service.issueByReference(request);
            equal(0, storageReads[0], "OA private signing skips auth storage " + type);
            CapturedResponse response = new CapturedResponse(); service.download(token(access), response.proxy());
            equal("oa original bytes", response.bytes.toString(java.nio.charset.StandardCharsets.UTF_8), "OA original private storage " + type);
            allowed[0] = false; rejects(403, () -> service.download(token(access), new CapturedResponse().proxy()), "OA rechecks business permission " + type); allowed[0] = true;
            file.setTenantId(4L); rejects(403, () -> service.issueByReference(request), "OA tenant guard " + type); file.setTenantId(3L);
        }
        equal(4, remoteReads[0], "OA private content read once per download");
        equal(0, previewCalls[0], "download does not require preview authorization");
        file.setFileType("OA_RFQ_INVITATION"); reference[0] = "oa-file:RFQ_INVITATION:41";
        FilePreviewRequest invitation = new FilePreviewRequest("OA_RFQ_INVITATION", "19", 41L, null, null, null, null, null, null, null, null);
        file.setFileType("OA_RFQ_QUOTATION"); rejects(403, () -> resolver.resolveDownload(invitation), "RFQ purpose mismatch");
        file.setFileType("OA_RFQ_INVITATION"); file.setStorageType("MINIO");
        rejects(403, () -> resolver.resolveDownload(invitation), "RFQ cannot use unrelated storage"); file.setStorageType("LOCAL");
        file.setFileName("room.png"); file.setFileType("png"); file.setBizType("OA_MEETING_ROOM"); file.setBizId("19");
        reference[0] = "/api/auth/system/file/41/content";
        FilePreviewRequest room = new FilePreviewRequest("OA_MEETING_ROOM", "19", 41L, null, null, null, null, null, null, null, null);
        permission = false; FileDownloadTickets.Access roomAccess = service.issue(41L, room); permission = true;
        CapturedResponse roomResponse = new CapturedResponse(); service.download(token(roomAccess), roomResponse.proxy());
        equal("download bytes", roomResponse.bytes.toString(java.nio.charset.StandardCharsets.UTF_8), "room uses original auth storage");
        equal("image/png", roomResponse.headers.get("Content-Type"), "room image MIME retained");
        equal(4, remoteReads[0], "room does not create remote content loop");
        file.setBizId("20"); rejects(403, () -> resolver.resolveDownload(room), "room business binding"); file.setBizId("19");
        file.setAccessType("PUBLIC"); rejects(403, () -> resolver.resolveDownload(room), "room requires private image"); file.setAccessType("PRIVATE");
        file.setFileType("pdf"); rejects(403, () -> resolver.resolveDownload(room), "room image purpose required"); file.setFileType("png");
        file.setDeleted(1); rejects(403, () -> resolver.resolveDownload(room), "deleted room photo refused"); file.setDeleted(0);
        for (String type : com.cloudflow.common.core.file.OaFileDownloadTypes.ALL) {
            FilePreviewRequest request = new FilePreviewRequest(type, "19", 41L, null, null, null, null, null, null, null, null);
            rejects(403, () -> resolver.resolve(request), "download-only OA type does not gain preview " + type);
        }
    }

    private static void hr() {
        SysFile file = new SysFile(); file.setFileId(41L); file.setTenantId(3L); file.setDeleted(0);
        file.setFileName("photo.png"); file.setFileType("HR_ATTENDANCE_PHOTO"); file.setStorageType("LOCAL");
        file.setAccessType("PRIVATE"); file.setUrl(""); file.setRemark("hr-pdf");
        int[] reads = {0}; boolean[] allowed = {true};
        com.cloudflow.auth.preview.HrFileDownloadClient hr = (com.cloudflow.auth.preview.HrFileDownloadClient) Proxy.newProxyInstance(
                FileDownloadBasicChecks.class.getClassLoader(), new Class<?>[]{com.cloudflow.auth.preview.HrFileDownloadClient.class}, (proxy, method, args) -> {
                    if (method.getName().equals("authorize")) return allowed[0]
                            ? com.cloudflow.common.core.domain.R.ok(new com.cloudflow.common.core.file.FilePreviewBinding("/api/auth/system/file/41/content", "business"))
                            : com.cloudflow.common.core.domain.R.fail(403, "denied");
                    if (method.getName().equals("content")) {
                        reads[0]++;
                        return feign.Response.builder().status(200).reason("OK").headers(Map.of())
                                .request(feign.Request.create(feign.Request.HttpMethod.POST, "http://hr.internal/content", Map.of(), null, java.nio.charset.StandardCharsets.UTF_8, null))
                                .body("hr business bytes", java.nio.charset.StandardCharsets.UTF_8).build();
                    }
                    throw new AssertionError(method.getName());
                });
        com.cloudflow.auth.mapper.SysFileMapper mapper = (com.cloudflow.auth.mapper.SysFileMapper) Proxy.newProxyInstance(
                FileDownloadBasicChecks.class.getClassLoader(), new Class<?>[]{com.cloudflow.auth.mapper.SysFileMapper.class}, (proxy, method, args) -> file);
        HrFileAccessChecker checker = new HrFileAccessChecker(hr, mapper, new ObjectMapper());
        FileStorageRegistry registry = new FileStorageRegistry(List.of(), null, null) {
            @Override public FileStorageService getForFile(SysFile ignored) { throw new AssertionError("HR must use its original storage"); }
        };
        FileDownloadService service = new FileDownloadService(List.of(checker), registry, new FileDownloadTickets(new MemoryRedis(), new ObjectMapper()), null, hr, null);
        FilePreviewRequest request = new FilePreviewRequest("HR_ATTENDANCE_PHOTO", "41", 41L, null, null, null, null, null, null, null, null);
        FileDownloadTickets.Access access = service.issue(41L, request);
        equal(0, reads[0], "HR issue metadata only");
        CapturedResponse response = new CapturedResponse(); service.download(token(access), response.proxy());
        equal("hr business bytes", response.bytes.toString(java.nio.charset.StandardCharsets.UTF_8), "HR content remote instead of auth storage");
        equal(1, reads[0], "HR single content read");
        allowed[0] = false; rejects(403, () -> service.download(token(access), new CapturedResponse().proxy()), "HR permission rechecked"); allowed[0] = true;
        file.setTenantId(4L); rejects(403, () -> checker.authorize(request), "HR metadata tenant"); file.setTenantId(3L);
        file.setFileType("HR_LEAVE_PROOF"); rejects(403, () -> checker.authorize(request), "HR purpose mismatch");
        file.setFileType("application/pdf"); file.setFileName("certificate.pdf"); file.setAccessType("PUBLIC");
        file.setUrl("/hr/ess/files/2026/10/" + "a".repeat(32) + ".pdf");
        FilePreviewRequest certificate = new FilePreviewRequest("HR_EMPLOYEE_CERTIFICATE", "1", 41L, null, null, null, null, null, null, null, null);
        check(service.issue(41L, certificate).expiresAt() > 0, "legacy bound HR certificate receives short ticket");
        file.setRemark("other"); rejects(403, () -> checker.authorize(certificate), "legacy HR origin required"); file.setRemark("hr-pdf");
        file.setUrl("https://public.example/certificate.pdf"); rejects(403, () -> checker.authorize(certificate), "legacy arbitrary public URL refused");
        file.setAccessType("PRIVATE"); file.setUrl(""); check(checker.authorize(certificate) != null, "new private PDF supported");
        file.setAccessType(null); rejects(403, () -> checker.authorize(certificate), "unknown access type refused");
        FilePreviewResolver preview = new FilePreviewResolver(null, null, null, null, null, null, new ObjectMapper());
        rejects(403, () -> preview.resolve(certificate), "download types do not gain preview access");
    }

    private static void crm() {
        SysFile file = new SysFile(); file.setFileId(41L); file.setTenantId(3L); file.setDeleted(0);
        file.setFileName("attachment.pdf"); file.setFileType("CRM_EMAIL_ATTACHMENT"); file.setBizType("CRM_EMAIL_ATTACHMENT");
        file.setBizId("CUSTOMER:19"); file.setStorageType("LOCAL"); file.setAccessType("PRIVATE"); file.setUrl("");
        int[] reads = {0}; int[] metadata = {0}; int[] storageReads = {0}; boolean[] allowed = {true};
        com.cloudflow.auth.preview.CrmFileDownloadClient crm = (com.cloudflow.auth.preview.CrmFileDownloadClient) Proxy.newProxyInstance(
                FileDownloadBasicChecks.class.getClassLoader(), new Class<?>[]{com.cloudflow.auth.preview.CrmFileDownloadClient.class}, (proxy, method, args) -> {
                    if (method.getName().equals("authorize")) return allowed[0]
                            ? com.cloudflow.common.core.domain.R.ok(new com.cloudflow.common.core.file.FilePreviewBinding("/api/auth/system/file/41/content", "business"))
                            : com.cloudflow.common.core.domain.R.fail(403, "denied");
                    if (method.getName().equals("content")) {
                        reads[0]++;
                        return feign.Response.builder().status(200).reason("OK").headers(Map.of())
                                .request(feign.Request.create(feign.Request.HttpMethod.POST, "http://crm.internal/content", Map.of(), null, java.nio.charset.StandardCharsets.UTF_8, null))
                                .body("crm business bytes", java.nio.charset.StandardCharsets.UTF_8).build();
                    }
                    throw new AssertionError(method.getName());
                });
        com.cloudflow.auth.mapper.SysFileMapper mapper = (com.cloudflow.auth.mapper.SysFileMapper) Proxy.newProxyInstance(
                FileDownloadBasicChecks.class.getClassLoader(), new Class<?>[]{com.cloudflow.auth.mapper.SysFileMapper.class}, (proxy, method, args) -> { metadata[0]++; return file; });
        CrmFileAccessChecker checker = new CrmFileAccessChecker(crm, mapper, new ObjectMapper());
        FileStorageRegistry registry = new FileStorageRegistry(List.of(), null, null) {
            @Override public FileStorageService getForFile(SysFile ignored) {
                storageReads[0]++; return new ControlledStorage();
            }
        };
        FileDownloadService service = new FileDownloadService(List.of(checker), registry, new FileDownloadTickets(new MemoryRedis(), new ObjectMapper()), null, null, crm);
        FilePreviewRequest email = new FilePreviewRequest("CRM_EMAIL_ATTACHMENT", "19", 41L, null, null, null, null, null, null, null, null);
        FileDownloadTickets.Access access = service.issue(41L, email);
        equal(0, reads[0], "CRM issue reads metadata only"); equal(0, storageReads[0], "CRM email skips auth storage");
        CapturedResponse response = new CapturedResponse(); service.download(token(access), response.proxy());
        equal("crm business bytes", response.bytes.toString(java.nio.charset.StandardCharsets.UTF_8), "CRM email original storage stream");
        equal(1, reads[0], "CRM content read once");
        allowed[0] = false; int before = metadata[0];
        rejects(403, () -> service.download(token(access), new CapturedResponse().proxy()), "CRM consumption permission rechecked");
        equal(before, metadata[0], "CRM permission denied before metadata"); allowed[0] = true;
        file.setTenantId(4L); rejects(403, () -> checker.authorize(email), "CRM cross tenant refused"); file.setTenantId(3L);
        file.setAccessType("PUBLIC"); rejects(403, () -> checker.authorize(email), "CRM private purpose required"); file.setAccessType("PRIVATE");
        file.setUrl("https://public.example/file.pdf"); rejects(403, () -> checker.authorize(email), "CRM public address refused"); file.setUrl("");
        file.setPortalOwnerId(9L); rejects(403, () -> checker.authorize(email), "CRM email portal owner refused");
        file.setBizType("CRM_PORTAL_TICKET"); file.setBizId("19"); file.setFileType("pdf");
        FilePreviewRequest portal = new FilePreviewRequest("CRM_PORTAL_TICKET", "19", 41L, null, null, null, null, null, null, null, null);
        FileDownloadTickets.Access portalAccess = service.issue(41L, portal);
        check(portalAccess.expiresAt() > 0, "CRM portal short ticket");
        CapturedResponse portalResponse = new CapturedResponse(); service.download(token(portalAccess), portalResponse.proxy());
        equal("download bytes", portalResponse.bytes.toString(java.nio.charset.StandardCharsets.UTF_8), "portal uses auth original storage");
        equal(1, reads[0], "portal does not loop through CRM content");
        file.setBizId("20"); rejects(403, () -> checker.authorize(portal), "portal ticket binding required"); file.setBizId("19");
        file.setPortalOwnerId(null); rejects(403, () -> checker.authorize(portal), "portal owner required"); file.setPortalOwnerId(9L);
        file.setBizType("CRM_PORTAL_FINANCE"); rejects(403, () -> checker.authorize(portal), "other portal purpose refused");
        ControlledChecker unrelated = new ControlledChecker(file);
        FileDownloadService guarded = new FileDownloadService(List.of(unrelated), registry, new FileDownloadTickets(new MemoryRedis(), new ObjectMapper()), null, null, null);
        rejects(403, () -> guarded.issue(41L, context("PUBLIC")), "portal exception does not widen PUBLIC");
        FilePreviewResolver preview = new FilePreviewResolver(null, null, null, null, null, null, new ObjectMapper());
        rejects(403, () -> preview.resolve(email), "CRM email does not gain preview");
        rejects(403, () -> preview.resolve(portal), "CRM portal does not gain preview");
    }

    private static void sensitivePaths() {
        for (String path : List.of("/system/file/download", "/auth/system/file/download", "/system/file/41/url", "/system/file/url", "/auth/system/file/url")) {
            Map<String, Object> attributes = new HashMap<>();
            HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(FileDownloadBasicChecks.class.getClassLoader(),
                    new Class<?>[]{HttpServletRequest.class}, (proxy, method, arguments) -> switch (method.getName()) {
                        case "getRequestURI" -> path;
                        case "getContextPath" -> "";
                        case "getQueryString" -> "token=do-not-log";
                        case "getAttribute" -> attributes.get(arguments[0]);
                        case "setAttribute" -> { attributes.put((String) arguments[0], arguments[1]); yield null; }
                        default -> null;
                    });
            check(SensitiveLogPolicy.isSensitive(request), "sensitive before handler binding");
            check(!SensitiveLogPolicy.requestPath(request).contains("token"), "no credentials in logged path");
        }
    }

    private static FilePreviewRequest context(String type) { return new FilePreviewRequest(type, null, 41L, null, null, null, null, null, null, null, null); }
    private static String token(FileDownloadTickets.Access access) { return access.url().substring(access.url().lastIndexOf('=') + 1); }
    private static void identity(Long userId, Long tenantId, String token) {
        UserContext.setUserId(userId); UserContext.setTenantId(tenantId); UserContext.setUserName("basic"); UserContext.setAuthToken(token);
    }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }
    private static void check(boolean valid, String label) { checks++; if (!valid) throw new AssertionError(label); }
    private static void rejects(int code, Runnable operation, String label) {
        try { operation.run(); } catch (ServiceException failure) { equal(code, failure.getCode(), label); return; }
        throw new AssertionError(label + " accepted");
    }

    private static final class ControlledChecker implements FileAccessChecker {
        private final SysFile file;
        private String stamp = "stamp";
        private boolean allowed = true;
        private ControlledChecker(SysFile file) { this.file = file; }
        @Override public Set<String> businessTypes() { return Set.of("PUBLIC"); }
        @Override public FilePreviewResolver.Resolved authorize(FilePreviewRequest request) {
            if (!allowed) throw new ServiceException("business denied", 403);
            return new FilePreviewResolver.Resolved(file, null, stamp);
        }
    }

    private static final class ControlledStorage implements FileStorageService {
        private FileStorageType type = FileStorageType.LOCAL;
        private SysFileConfig config;
        private int seconds;
        private String path;
        private boolean failSigning;
        @Override public FileStorageType getStorageType() { return type; }
        @Override public SysFileConfig getConfiguration() { return config; }
        @Override public StoredFileInfo store(FileUploadUtils.ValidatedFile file) { throw new UnsupportedOperationException(); }
        @Override public void delete(String value) { throw new UnsupportedOperationException(); }
        @Override public String resolveUrl(String value) { throw new AssertionError("public fallback forbidden"); }
        @Override public String resolveSignedUrl(String value, int ttl) {
            if (failSigning) throw new IllegalStateException("controlled failure");
            path = value; seconds = ttl; return "https://storage.example.test/object?signature=controlled";
        }
        @Override public InputStream open(String value) { return new ByteArrayInputStream("download bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    }

    private static final class MemoryRedis extends StringRedisTemplate {
        private final Map<String, String> data = new HashMap<>();
        private Duration ttl;
        private boolean failed;
        @Override @SuppressWarnings("unchecked") public ValueOperations<String, String> opsForValue() {
            return (ValueOperations<String, String>) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ValueOperations.class},
                    (proxy, method, arguments) -> {
                        if (failed) throw new DataAccessResourceFailureException("controlled failure");
                        if (method.getName().equals("get")) return data.get(arguments[0]);
                        if (method.getName().equals("setIfAbsent")) {
                            ttl = (Duration) arguments[2]; return data.putIfAbsent((String) arguments[0], (String) arguments[1]) == null;
                        }
                        throw new UnsupportedOperationException(method.getName());
                    });
        }
    }

    private static final class CapturedResponse {
        private final Map<String, String> headers = new HashMap<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private HttpServletResponse proxy() {
            ServletOutputStream output = new ServletOutputStream() {
                @Override public void write(int value) { bytes.write(value); }
                @Override public boolean isReady() { return true; }
                @Override public void setWriteListener(WriteListener listener) { }
            };
            return (HttpServletResponse) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{HttpServletResponse.class},
                    (proxy, method, arguments) -> switch (method.getName()) {
                        case "setHeader" -> { headers.put((String) arguments[0], (String) arguments[1]); yield null; }
                        case "setContentType" -> { headers.put("Content-Type", (String) arguments[0]); yield null; }
                        case "getOutputStream" -> output;
                        default -> null;
                    });
        }
    }
}
