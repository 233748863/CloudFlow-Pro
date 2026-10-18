package com.cloudflow.oa.service.impl;

import com.cloudflow.auth.controller.PortalFileController;
import com.cloudflow.auth.portal.PortalFileTickets;
import com.cloudflow.common.core.domain.PortalKnowledgeFile;
import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.dto.KnowledgeExternalRequests;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public final class PortalKnowledgeChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        references();
        selections();
        content();
        serialization();
        workflowVariables();
        System.out.println("PORTAL_KNOWLEDGE_RULE_CHECKS: assertions=" + checks
                + "; failed=0; actual_production_classes=true; json=true; html=true; mysql=false; redis=false; http=false");
    }

    private static void workflowVariables() {
        KnowledgeDocument document = new KnowledgeDocument();
        document.setDocumentId(42L);
        document.setTitle("审批文档标题");
        document.setCategory("产品知识");
        document.setSummary("提交说明");
        for (Map.Entry<String, String> scope : Map.of("ALL", "全员", "DEPT", "部门", "ROLE", "指定角色").entrySet()) {
            document.setScopeType(scope.getKey());
            Map<String, Object> variables = KnowledgeServiceImpl.workflowVariables(document);
            check(document.getTitle().equals(variables.get("documentTitle")), "approved form receives document title");
            check(document.getCategory().equals(variables.get("categoryName")), "approved form receives category");
            check(scope.getValue().equals(variables.get("publishScope")), "approved form receives canonical scope option");
            check(document.getSummary().equals(variables.get("summary")), "approved form retains supplied summary");
            check("KNOWLEDGE_DOCUMENT".equals(variables.get("businessType")) && Long.valueOf(42).equals(variables.get("businessId")), "callback business identity retained");
        }
    }

    private static void references() {
        check(KnowledgeAttachmentRules.references(null).isEmpty(), "null source is empty");
        check(KnowledgeAttachmentRules.references(" ").isEmpty(), "blank source is empty");
        check(KnowledgeAttachmentRules.references("/api/auth/system/file/12/content,/api/auth/system/file/13/content").equals(List.of(12L, 13L)), "canonical references resolved");
        for (String invalid : List.of("https://example.test/api/auth/system/file/12/content", "//example.test/file/12", "file:///private",
                "/api/auth/system/file/0/content", "/api/auth/system/file/01/content", "/api/auth/system/file/-1/content",
                "/api/auth/system/file/9223372036854775808/content", "/api/auth/system/file/12/content?tenantId=1",
                "/api/auth/system/file/12/content#fragment", "/api/auth/system/file/12/content/", "/api/auth/system/file/../content",
                "/api/auth/system/file/%31/content", "javascript:alert(1)", "data:text/plain,secret")) {
            check(KnowledgeAttachmentRules.references(invalid).isEmpty(), "untrusted reference ignored");
        }
        check(KnowledgeAttachmentRules.references("/api/auth/system/file/12/content,".repeat(6)).isEmpty(), "too many source files rejected");
        check(KnowledgeAttachmentRules.references("x".repeat(1001)).isEmpty(), "oversized source rejected");
        check(KnowledgeAttachmentRules.references(" /api/auth/system/file/12/content, /api/auth/system/file/12/content ").equals(List.of(12L)), "canonical source deduplicated");
    }

    private static void selections() {
        check(KnowledgeAttachmentRules.selection(null).isEmpty(), "unpublished null has no files");
        check(KnowledgeAttachmentRules.selection("[]").isEmpty(), "explicit body-only selection accepted");
        check(KnowledgeAttachmentRules.selection("[3, 1, 2]").equals(List.of(1L, 2L, 3L)), "selection canonicalized");
        check(KnowledgeAttachmentRules.encode(List.of(5L, 1L)).equals("[1, 5]"), "persisted canonical JSON");
        check(KnowledgeAttachmentRules.selection("[9223372036854775807]").equals(List.of(Long.MAX_VALUE)), "signed bigint upper bound preserved");
        for (String invalid : List.of("", "null", "{}", "1", "\"1\"", "[\"1\"]", "[null]", "[0]", "[-1]", "[1,1]", "[1.5]", "[1e1]",
                "[9223372036854775808]", "[1,2,3,4,5,6]", "[{}]", "[[1]]", "[true]", "[", " ".repeat(257))) {
            rejects(() -> KnowledgeAttachmentRules.selection(invalid));
        }
        rejects(() -> KnowledgeAttachmentRules.validate(null));
        rejects(() -> KnowledgeAttachmentRules.validate(new ArrayList<>(Arrays.asList(1L, null))));
        rejects(() -> KnowledgeAttachmentRules.validate(List.of(1L, 1L)));
    }

    private static void content() {
        for (String input : List.of("", " ", "x".repeat(1_048_577))) rejects(() -> KnowledgeExternalContent.clean(input));
        rejects(() -> KnowledgeExternalContent.clean(null));
        String content = KnowledgeExternalContent.clean("<p>公开正文</p><script>PRIVATE_SCRIPT</script><style>PRIVATE_STYLE</style><a href='https://example.test/secret'>标题</a><img src='https://example.test/secret' onerror='alert(1)'><iframe src='https://example.test'>PRIVATE_FRAME</iframe><!--PRIVATE_COMMENT-->");
        check(content.contains("公开正文") && content.contains("标题"), "public text retained");
        for (String blocked : List.of("PRIVATE_SCRIPT", "PRIVATE_STYLE", "PRIVATE_FRAME", "PRIVATE_COMMENT", "https://", "href=", "src=", "onerror=", "<script", "<iframe")) {
            check(!content.contains(blocked), "private HTML feature removed: " + blocked);
        }
    }

    private static void serialization() throws Exception {
        SimpleModule module = new SimpleModule("production-sensitive-module");
        module.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = new ObjectMapper().registerModule(module);
        KnowledgeDocument document = json.readValue("{\"title\":\"test\",\"externalVisibleFlag\":1,\"externalVersionId\":12,\"externalAttachmentFileIds\":\"[1]\"}", KnowledgeDocument.class);
        check(document.getExternalVisibleFlag() == null && document.getExternalVersionId() == null && document.getExternalAttachmentFileIds() == null, "general body cannot set publication controls");
        for (String extra : List.of("tenantId", "customerId", "url", "externalVisibleFlag")) {
            unknown(json, "{\"version\":1,\"versionId\":1,\"attachmentFileIds\":[],\"" + extra + "\":1}", KnowledgeExternalRequests.Publish.class);
            unknown(json, "{\"documentId\":1,\"versionId\":1,\"fileId\":1,\"" + extra + "\":1}", PortalFileController.KnowledgeAccess.class);
        }
        unknown(json, "{\"downloadTicket\":\"kf_test\",\"url\":\"private\"}", PortalFileController.Download.class);
        String rawTicket = "kf_" + "a".repeat(43);
        PortalFileTickets.Access access = new PortalFileTickets.Access(rawTicket, 60);
        JsonNode accessJson = json.readTree(json.writeValueAsString(access));
        check(accessJson.size() == 2 && rawTicket.equals(accessJson.path("downloadTicket").textValue()), "dedicated download response retains usable credential");
        PortalIdentity identity = new PortalIdentity(1L, 100000L, 2L, 3L, 0, 1);
        PortalFileTickets.Ticket ticket = new PortalFileTickets.Ticket("PORTAL_KNOWLEDGE_DOWNLOAD", "a".repeat(64), identity, 10L, 11L, 12L, 13);
        check(ticket.equals(json.readValue(json.writeValueAsString(ticket), PortalFileTickets.Ticket.class)), "trusted ticket state round trips with production serialization");
        PortalKnowledgeVO.Attachment file = new PortalKnowledgeVO.Attachment(); file.setFileId(12L); file.setFileName("公开.txt"); file.setFileSize(20L);
        PortalKnowledgeFile authorization = new PortalKnowledgeFile(10L, 11L, 13, file);
        check(authorization.equals(json.readValue(json.writeValueAsString(authorization), PortalKnowledgeFile.class)), "trusted remote file decision round trips");
    }

    private static void unknown(ObjectMapper json, String input, Class<?> type) throws Exception {
        try { json.readValue(input, type); } catch (com.fasterxml.jackson.databind.JsonMappingException rejected) { checks++; return; }
        throw new AssertionError("unknown input field accepted");
    }

    private static void rejects(Runnable action) {
        try { action.run(); } catch (ServiceException rejected) { check(Integer.valueOf(400).equals(rejected.getCode()), "invalid input uses explicit client error"); return; }
        throw new AssertionError("invalid knowledge input accepted");
    }

    private static void check(boolean accepted, String label) { if (!accepted) throw new AssertionError(label); checks++; }
}
