package com.cloudflow.crm.service.email.archive;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.spel.MethodBasedSpelEvaluator;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.crm.controller.CrmEmailController;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmEmailPrivateFile;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.domain.dto.CrmEmailRequest;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailPrivateFileMapper;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

public final class CrmEmailArchiveFoundationChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments[0]).toRealPath();
        check(directory.toString().replace('\\', '/').contains("/.cloudflow-runtime/crm-email-checks/"), "owned verification directory required");
        String systemDrive = System.getenv("SystemDrive");
        check(systemDrive == null || !directory.startsWith(Path.of(systemDrive + "\\")), "verification never writes to system drive");
        content();
        payload();
        uploadKeys();
        files(directory);
        System.out.println("H3_EMAIL_ARCHIVE_FOUNDATION_CHECKS: assertions=" + checks + "; failed=0; real_private_files=true; redirected_paths_rejected=true; database=false; external_requests=0; production_modified=false");
    }

    private static void content() throws Exception {
        CrmEmailArchiveContent content = new CrmEmailArchiveContent(new ObjectMapper());
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(100L); customer.setCustomerName("公司<&>");
        CrmContact contact = new CrmContact(); contact.setContactName("联系人<script>unsafe()</script>");
        CrmEmailArchiveAccess.Business business = new CrmEmailArchiveAccess.Business("CUSTOMER", 100L, customer, "业务<&>");
        CrmEmailArchiveContent.Body body = content.render("<p>{{contactName}} ${customerName} {{businessName}}</p>", business, contact);
        check(body.html().contains("&lt;script&gt;") && !body.html().contains("<script>"), "business variables are escaped, not executable markup");
        check(body.summary().contains("公司<&>") && body.summary().contains("业务<&>"), "business variables use current server facts");
        for (String unsafe : List.of("<script>bad()</script><p>保留正文</p>", "<p onclick='bad()'>保留正文</p>",
                "<img src='https://example.test/pixel' onerror='bad()'><p>保留正文</p>", "<a href='javascript:bad()'>保留正文</a>",
                "<a href='https://example.test/link'>保留正文</a>", "<iframe src='https://example.test/frame'></iframe><p>保留正文</p>",
                "<style>body{background:url(https://example.test/image)}</style><p>保留正文</p>")) {
            CrmEmailArchiveContent.Body clean = CrmEmailArchiveContent.clean(unsafe);
            check(!clean.html().matches("(?is).*(<script|<iframe|<style|onerror|onclick|href=|src=|https://).*"), "archive removes active content and outbound requests");
            check(clean.summary().contains("保留正文"), "safe visible text survives sanitation");
            equal(clean.html(), CrmEmailArchiveContent.clean(clean.html()).html(), "sanitizer remains idempotent");
        }
        equal(2000, CrmEmailArchiveContent.clean("<p>" + "甲".repeat(2100) + "</p>").summary().length(), "archive summary stays inside approved column width");
        rejects(() -> content.render("<script>onlyScript()</script>", business, contact), CrmBusinessException.class, "empty sanitized body rejected");
        rejects(() -> content.render("{{password}}", business, contact), CrmBusinessException.class, "unapproved variable rejected");
        rejects(() -> content.render("x".repeat(CrmEmailArchiveContent.MAXIMUM_CONTENT + 1), business, contact), CrmBusinessException.class, "oversized body rejected");
        equal("主题", CrmEmailArchiveContent.subject("主题"), "valid subject preserved");
        rejects(() -> CrmEmailArchiveContent.subject("subject\r\nBcc: attacker@example.test"), CrmBusinessException.class, "header injection rejected");
        rejects(() -> CrmEmailArchiveContent.subject("甲".repeat(201)), CrmBusinessException.class, "oversized subject rejected");
        for (String parameters : List.of("{}", "invalid-json", "[{\"name\":\"password\"}]")) {
            rejects(() -> content.template(template("<p>正文</p>", parameters)), CrmBusinessException.class, "unsupported template parameter declaration rejected");
        }
        rejects(() -> content.template(template("<p>{{campaignName}}</p>", "[]")), CrmBusinessException.class, "marketing-only variables not exposed in business template choices");
        content.template(template("<p>{{contactName}} {{companyName}} {{customerName}} {{businessName}} {{content}}</p>", "[]"));
        check(true, "five approved business template variables accepted");
    }

    private static MessageEmailTemplate template(String html, String parameters) {
        return new MessageEmailTemplate(1L, "CRM_CUSTOMER_EMAIL", 0, html, parameters, "sender@example.test", "sender", true, null);
    }

    private static void payload() throws Exception {
        CrmEmailRecord record = new CrmEmailRecord();
        record.setEmailId(100L); record.setTenantId(100000L); record.setOperationKey("h3_private_operation_key");
        record.setSubject("正文主题"); record.setSanitizedContent("<p>正文</p>"); record.setFromAddress("sender@example.test");
        record.setToAddresses(List.of("contact@example.test")); record.setAttachmentFileIds(List.of(101L));
        String token = CrmEmailSecurity.newToken();
        CrmEmailArchiveTracking.Pixel pixel = new CrmEmailArchiveTracking.Pixel(token, "https://mail.example.test");
        MessageSendRequest request = CrmEmailArchiveService.message(record, "CRM_CUSTOMER_EMAIL", pixel);
        equal(Set.of("mailFromAddress", "attachmentIds", "archiveOpenToken", "archiveOpenOrigin"), request.safeParams().keySet(), "business mail uses only approved message parameters");
        equal("CRM_EMAIL_ARCHIVE:100000:" + MessagePayloadCodec.hash(record.getOperationKey()), request.getDeduplicationKey(), "message identity is tenant scoped and hides operation key");
        equal("CRM_EMAIL_ARCHIVE:100000:100", request.getTraceId(), "stable non-secret trace prevents message center metadata from invalidating source");
        check(request.getContent().contains("kind=ARCHIVE") && !record.getSanitizedContent().contains(token), "outbound-only pixel never modifies archived body");
        check(!pixel.toString().contains(token), "tracking value toString hides raw token");
        ObjectMapper json = new ObjectMapper().registerModule(new SimpleModule("production-sensitive-module")
                .setSerializerModifier(new SensitiveBeanSerializerModifier()));
        MessageSecretCipher cipher = new MessageSecretCipher(UUID.randomUUID().toString());
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(UUID.randomUUID().toString()).eventType("MESSAGE_SEND")
                .sourceModule("cloudflow-service-crm").sourceId(record.getEmailId()).tenantId(record.getTenantId()).build();
        MessagePayloadCodec.encode(envelope, request, json, cipher);
        check(envelope.getPayload().startsWith("MESSAGE_ENCRYPTED_V1:"), "external message must use authenticated encrypted envelope");
        for (String secret : List.of(token, record.getSubject(), record.getSanitizedContent(), record.getFromAddress(), record.getToAddresses().get(0))) {
            check(!json.writeValueAsString(envelope).contains(secret), "persistable message envelope hides private content and token");
        }
        MessageSendRequest decoded = MessagePayloadCodec.decode(envelope, json, cipher);
        equal(token, decoded.safeParams().get("archiveOpenToken"), "encrypted message round trip retains exact tracking token");
        equal(request.getContent(), decoded.getContent(), "encrypted message round trip retains exact outbound HTML");
        equal(record.getToAddresses().get(0), decoded.safeReceivers().get(0).getReceiverAddress(), "encryption preserves actual mailbox with production masking enabled");
        CrmEmailArchiveSource source = new CrmEmailArchiveSource(null, null, null, null, null, null, null, json);
        Method matches = CrmEmailArchiveSource.class.getDeclaredMethod("matches", CrmEmailRecord.class, MessageSendRequest.class);
        matches.setAccessible(true);
        check(Boolean.TRUE.equals(matches.invoke(source, record, decoded)), "encrypted dispatched request matches exact archive snapshot");
        check(Boolean.TRUE.equals(matches.invoke(source, record, decoded.toBuilder().retryAttempt(1).build())), "transport retry counter does not invalidate unchanged business content");
        for (MessageSendRequest altered : List.of(decoded.toBuilder().traceId("different-trace").build(), decoded.toBuilder().title("changed").build(),
                decoded.toBuilder().content("changed").build(), decoded.toBuilder().forceSend(true).build(), decoded.toBuilder().resendFromId(99L).build(),
                decoded.toBuilder().receivers(List.of(MessageReceiver.ofAddress("EMAIL", "another@example.test"))).build(),
                decoded.toBuilder().bizId("101").build(), decoded.toBuilder().deduplicationKey("different-operation").build())) {
            check(Boolean.FALSE.equals(matches.invoke(source, record, altered)), "source still rejects altered identity, content, recipient, and forced resend");
        }
        rejects(() -> MessagePayloadCodec.decode(envelope, json, new MessageSecretCipher(UUID.randomUUID().toString())), IllegalArgumentException.class, "wrong message key rejected");
        rejects(() -> MessagePayloadCodec.encode(envelope, request, json, new MessageSecretCipher("")), IllegalArgumentException.class, "missing key cannot produce unencrypted external message");
        envelope.setTenantId(100001L);
        rejects(() -> MessagePayloadCodec.decode(envelope, json, cipher), IllegalArgumentException.class, "cross-tenant encrypted message rejected");
        envelope.setTenantId(record.getTenantId());
        envelope.setSourceModule("cloudflow-service-oa");
        rejects(() -> MessagePayloadCodec.decode(envelope, json, cipher), IllegalArgumentException.class, "cross-service encrypted message rejected");
        envelope.setSourceModule("cloudflow-service-crm");
        envelope.setPayloadDigest("0".repeat(64));
        rejects(() -> MessagePayloadCodec.decode(envelope, json, cipher), IllegalArgumentException.class, "altered message digest rejected");
        CrmEmailRequest incoming = new CrmEmailRequest(record.getOperationKey(), "CUSTOMER", 100L, 101L, "CRM_CUSTOMER_EMAIL", "private-subject", "private-body", List.of(), "private@example.test", List.of(), List.of(), "private-remark");
        for (String secret : List.of("private-subject", "private-body", "private@example.test", "private-remark", record.getOperationKey())) {
            check(!incoming.toString().contains(secret), "request toString does not expose private content");
        }
    }

    private static void uploadKeys() throws Exception {
        for (String name : List.of("upload", "uploadInbound")) {
            Method method = CrmEmailController.class.getMethod(name, String.class, Long.class, MultipartFile.class);
            RepeatSubmit guard = method.getAnnotation(RepeatSubmit.class);
            check(guard.includeTenant() && guard.includeUser() && guard.includeUri(), "upload deduplication retains tenant, user, and operation boundaries");
            String first = uploadKey(method, guard, "CUSTOMER", 100L, "first.pdf", 20L);
            equal(first, uploadKey(method, guard, "CUSTOMER", 100L, "first.pdf", 20L), "same attachment metadata produces stable repeat key");
            check(!first.equals(uploadKey(method, guard, "CUSTOMER", 100L, "second.pdf", 20L)), "different attachment names do not block batch upload");
            check(!first.equals(uploadKey(method, guard, "CUSTOMER", 100L, "first.pdf", 21L)), "changed attachment size does not reuse repeat key");
            check(!first.equals(uploadKey(method, guard, "CUSTOMER", 101L, "first.pdf", 20L)), "different customer upload remains independent");
            check(!first.equals(uploadKey(method, guard, "QUOTE", 100L, "first.pdf", 20L)), "different business type upload remains independent");
        }
    }

    private static String uploadKey(java.lang.reflect.Method method, RepeatSubmit guard, String type, Long businessId, String name, long size) {
        MultipartFile upload = (MultipartFile) Proxy.newProxyInstance(MultipartFile.class.getClassLoader(), new Class<?>[] { MultipartFile.class }, (proxy, member, values) -> {
            return switch (member.getName()) {
                case "getOriginalFilename" -> name;
                case "getSize" -> size;
                default -> throw new UnsupportedOperationException(member.getName());
            };
        });
        return MethodBasedSpelEvaluator.evaluateToString(guard.key(), method, new Object[] { type, businessId, upload }, null);
    }

    private static void files(Path directory) throws Exception {
        Path base = directory.resolve("archive-private");
        Path root = Files.createDirectories(base.resolve("CRM_EMAIL_ATTACHMENT"));
        byte[] bytes = "%PDF-1.4\nprivate-file\n%%EOF".getBytes(StandardCharsets.UTF_8);
        Path target = root.resolve("document.pdf"); Files.write(target, bytes);
        CrmEmailPrivateFile stored = new CrmEmailPrivateFile();
        stored.setFileId(101L); stored.setTenantId(100000L); stored.setFileName("document.pdf"); stored.setFilePath(target.toString());
        stored.setFileSize((long) bytes.length); stored.setFileHash(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        stored.setFileType("CRM_EMAIL_ATTACHMENT"); stored.setAccessType("PRIVATE"); stored.setStorageType("LOCAL");
        stored.setBizType("CRM_EMAIL_ATTACHMENT"); stored.setBizId("CUSTOMER:100"); stored.setCreateBy("42"); stored.setDeleted(0);
        CrmEmailPrivateFileMapper mapper = (CrmEmailPrivateFileMapper) Proxy.newProxyInstance(CrmEmailPrivateFileMapper.class.getClassLoader(), new Class<?>[] { CrmEmailPrivateFileMapper.class }, (proxy, method, values) -> {
            if (method.getName().equals("selectById")) return Objects.equals(stored.getFileId(), values[0]) ? stored : null;
            throw new UnsupportedOperationException(method.getName());
        });
        CrmEmailArchiveFiles files = new CrmEmailArchiveFiles(mapper, null); setBase(files, base);
        UserContext.setTenantId(100000L); UserContext.setUserId(42L);
        try {
            MessageAttachment attachment = files.attachments("CUSTOMER", 100L, 42L, List.of(101L)).get(0);
            check(Arrays.equals(bytes, attachment.content()) && "application/pdf".equals(attachment.contentType()), "private attachment loads exact validated bytes");
            ResponseEntity<byte[]> downloaded = files.download("CUSTOMER", 100L, 101L);
            check(Arrays.equals(bytes, downloaded.getBody()) && "no-store".equals(downloaded.getHeaders().getCacheControl()), "private download is non-cacheable and exact");
            rejects(() -> files.attachments("CUSTOMER", 100L, 43L, List.of(101L)), CrmBusinessException.class, "different uploader cannot attach private file");
            rejects(() -> files.attachments("OPPORTUNITY", 100L, 42L, List.of(101L)), CrmBusinessException.class, "different business type rejected");
            rejects(() -> files.attachments("CUSTOMER", 101L, 42L, List.of(101L)), CrmBusinessException.class, "different business identifier rejected");
            rejects(() -> files.attachments("CUSTOMER", 100L, 42L, List.of(102L)), CrmBusinessException.class, "unknown private file rejected");
            rejects(() -> files.attachments("CUSTOMER", 100L, 42L, List.of(101L, 101L)), CrmBusinessException.class, "duplicate private file rejected");
            UserContext.setTenantId(100001L);
            rejects(() -> files.attachments("CUSTOMER", 100L, 42L, List.of(101L)), CrmBusinessException.class, "cross-tenant private file rejected");
            UserContext.setTenantId(100000L);
            stored.setAccessType("PUBLIC");
            rejects(() -> files.download("CUSTOMER", 100L, 101L), CrmBusinessException.class, "public file cannot masquerade as private archive file");
            stored.setAccessType("PRIVATE"); stored.setFileName("../document.pdf");
            rejects(() -> files.download("CUSTOMER", 100L, 101L), CrmBusinessException.class, "path-containing attachment name rejected");
            stored.setFileName("document.pdf");
            Files.write(target, "%PDF-1.4\nTAMPERED-CONTENT".getBytes(StandardCharsets.UTF_8));
            rejects(() -> files.download("CUSTOMER", 100L, 101L), CrmBusinessException.class, "changed attachment bytes rejected");
            Files.write(target, bytes);
            Path outside = Files.createDirectories(directory.resolve("outside-private"));
            Path outsideFile = outside.resolve("document.pdf"); Files.write(outsideFile, bytes);
            stored.setFilePath(outsideFile.toString());
            rejects(() -> files.download("CUSTOMER", 100L, 101L), CrmBusinessException.class, "path outside dedicated root rejected even with matching hash");
            Path fileLink = root.resolve("linked.pdf"); Files.createSymbolicLink(fileLink, outsideFile);
            try {
                stored.setFilePath(fileLink.toString());
                rejects(() -> files.download("CUSTOMER", 100L, 101L), CrmBusinessException.class, "symbolic file link rejected");
            } finally { Files.delete(fileLink); stored.setFilePath(target.toString()); }
            Path redirected = directory.resolve("redirected-private"); Files.createSymbolicLink(redirected, outside);
            try {
                setBase(files, redirected.resolve("must-not-create"));
                rejects(() -> privateRoot(files), CrmBusinessException.class, "redirected parent directory rejected before creating children");
                check(!Files.exists(outside.resolve("must-not-create")), "redirected path rejection performs no unintended write");
            } finally { Files.delete(redirected); setBase(files, base); }
            String systemDrive = System.getenv("SystemDrive");
            if (systemDrive != null) {
                setBase(files, Path.of(systemDrive + "\\CloudFlowNoWriteProbe"));
                rejects(() -> privateRoot(files), IllegalStateException.class, "system drive rejected before filesystem creation");
                setBase(files, base);
            }
            check(Arrays.equals(bytes, files.download("CUSTOMER", 100L, 101L).getBody()), "valid dedicated private file remains usable after rejection cases");
        } finally { UserContext.clear(); }
    }

    private static void setBase(CrmEmailArchiveFiles files, Path base) throws Exception {
        Field field = CrmEmailArchiveFiles.class.getDeclaredField("baseDirectory"); field.setAccessible(true); field.set(files, base.toString());
    }

    private static void privateRoot(CrmEmailArchiveFiles files) throws Exception {
        Method method = CrmEmailArchiveFiles.class.getDeclaredMethod("root", boolean.class); method.setAccessible(true); method.invoke(files, true);
    }

    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }

    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }

    private static void rejects(CheckedAction action, Class<? extends Throwable> expected, String label) throws Exception {
        try { action.run(); }
        catch (Exception failure) {
            Throwable cause = failure instanceof InvocationTargetException invocation ? invocation.getCause() : failure;
            if (!expected.isInstance(cause)) throw new AssertionError(label, cause);
            check(true, label); return;
        }
        throw new AssertionError(label);
    }

    @FunctionalInterface
    private interface CheckedAction { void run() throws Exception; }
}
