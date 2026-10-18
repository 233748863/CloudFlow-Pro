package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.aop.AuditAspect;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.handle.DefaultAuditLogHandle;
import com.cloudflow.common.audit.handle.IAuditLogHandle;
import com.cloudflow.common.audit.handle.JaversCompareHandle;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeExternalStateVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flipkart.zjsonpatch.JsonPatch;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.scheduling.annotation.AsyncAnnotationBeanPostProcessor;

public class AuditSnapshotProxyChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        try {
            UserContext.setUserId(51L);
            UserContext.setUserName("audit-snapshot-check");
            UserContext.setTenantId(100001L);
            verify(false);
            verify(true);
            System.out.println("AUDIT_SNAPSHOT_PROXY_CHECKS: assertions=" + checks
                    + "; failed=0; real_spring_async_proxy=true; jdk_proxy=true; class_proxy=true; real_audit_aspect=true"
                    + "; real_javers=true; json_patch_replayed=true; mapper=in_process_double; mysql=false; redis=false; http=false");
        } finally {
            UserContext.clear();
        }
    }

    private static void verify(boolean classProxy) throws Exception {
        List<SysAuditLogEntity> saved = new ArrayList<>();
        SysAuditLogMapper mapper = (SysAuditLogMapper) Proxy.newProxyInstance(SysAuditLogMapper.class.getClassLoader(),
                new Class<?>[]{SysAuditLogMapper.class}, (proxy, method, arguments) -> {
                    if (method.getName().equals("insert") && arguments[0] instanceof SysAuditLogEntity entry) {
                        saved.add(entry);
                        return 1;
                    }
                    if (method.getName().equals("toString")) return "audit-mapper-check";
                    throw new AssertionError("Unexpected mapper method: " + method.getName());
                });
        AsyncAnnotationBeanPostProcessor processor = new AsyncAnnotationBeanPostProcessor();
        processor.setProxyTargetClass(classProxy);
        processor.setExecutor(Runnable::run);
        processor.setBeanFactory(new DefaultListableBeanFactory());
        IAuditLogHandle handler = (IAuditLogHandle) processor.postProcessAfterInitialization(
                new DefaultAuditLogHandle(mapper, JSON, new AuditBizModuleResolver()), "auditLogHandle");
        check(classProxy ? AopUtils.isCglibProxy(handler) : AopUtils.isJdkDynamicProxy(handler),
                "real async processor must create the requested proxy type");
        AspectJProxyFactory factory = new AspectJProxyFactory(new Publication());
        factory.setProxyTargetClass(true);
        factory.addAspect(new AuditAspect(new JaversCompareHandle(Optional.of(handler))));
        Publication publication = factory.getProxy();

        publication.publish(71L, List.of(81L));
        verifyRows(saved, "对外发布知识版本", 1, 2, false, true, List.of(), List.of(81L));
        saved.clear();
        publication.publish(71L, List.of(82L));
        verifyRows(saved, "对外发布知识版本", 2, 3, true, true, List.of(81L), List.of(82L));
        saved.clear();
        publication.withdraw();
        verifyRows(saved, "撤回对外知识版本", 3, 4, true, false, List.of(82L), List.of());
        check(JSON.readTree(saved.get(0).getAfterJson()).get("externalVersionId").isNull(),
                "withdrawal snapshot must clear the public version");
        saved.clear();
        publication.unchanged();
        check(saved.isEmpty(), "an unchanged snapshot must not create an audit row");
        boolean failed = false;
        try { publication.failure(); } catch (IllegalStateException expected) { failed = true; }
        check(failed && saved.isEmpty(), "failed business operation must not record a successful change");
        publication.lightweight();
        check(!saved.isEmpty(), "diff=false must retain field-level audit records");
        check(saved.stream().allMatch(entry -> entry.getBeforeJson() == null && entry.getAfterJson() == null
                && entry.getDiffJson() == null && entry.getHighRisk() == 0 && "NORMAL".equals(entry.getRiskLevel())),
                "diff=false must not enable snapshots or high-risk flags");
    }

    private static void verifyRows(List<SysAuditLogEntity> saved, String name, int oldVersion, int newVersion,
                                   boolean wasVisible, boolean isVisible, List<Long> oldFiles, List<Long> newFiles) throws Exception {
        check(!saved.isEmpty(), "the real audit aspect must produce field changes");
        for (SysAuditLogEntity entry : saved) {
            check(entry.getBeforeJson() != null && entry.getAfterJson() != null && entry.getDiffJson() != null,
                    "proxied audit handler must retain both snapshots and the JSON diff");
            JsonNode before = JSON.readTree(entry.getBeforeJson());
            JsonNode after = JSON.readTree(entry.getAfterJson());
            check(before.get("documentId").asLong() == 61 && after.get("documentId").asLong() == 61,
                    "snapshots must identify the same document");
            check(before.get("version").asInt() == oldVersion && after.get("version").asInt() == newVersion,
                    "snapshots must retain both publication revisions");
            check(before.get("externalVisible").asBoolean() == wasVisible && after.get("externalVisible").asBoolean() == isVisible,
                    "snapshots must retain the visibility transition");
            check(before.get("externalAttachmentFileIds").equals(JSON.readTree(JSON.writeValueAsString(oldFiles)))
                    && after.get("externalAttachmentFileIds").equals(JSON.readTree(JSON.writeValueAsString(newFiles))),
                    "snapshots must retain the exact before and after attachment selections");
            check(JsonPatch.apply(JSON.readTree(entry.getDiffJson()), before).equals(after),
                    "stored JSON patch must reproduce the after snapshot");
            check(name.equals(entry.getAuditName()) && "oa".equals(entry.getBizModule()),
                    "the proxy must preserve the audit name and business module");
            check("audit-snapshot-check".equals(entry.getCreateBy()) && Long.valueOf(100001L).equals(entry.getTenantId())
                    && entry.getCreateTime() != null, "operator and tenant must remain bound to the audit row");
            check(entry.getHighRisk() == 1 && "HIGH".equals(entry.getRiskLevel()),
                    "publication and withdrawal must remain high-risk audited operations");
        }
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    public static class Publication {
        private int version = 1;
        private boolean visible;
        private Long publicVersion;
        private List<Long> selectedFiles = List.of();

        public KnowledgeExternalStateVO snapshot() {
            KnowledgeExternalStateVO result = new KnowledgeExternalStateVO();
            result.setDocumentId(61L);
            result.setVersion(version);
            result.setStatus("PUBLISHED");
            result.setExternalVisible(visible);
            result.setExternalVersionId(publicVersion);
            result.setExternalAttachmentFileIds(List.copyOf(selectedFiles));
            return result;
        }

        @Audit(name = "对外发布知识版本", spel = "#target.snapshot()", diff = true, highRisk = true)
        public void publish(Long versionId, List<Long> fileIds) {
            version++;
            visible = true;
            publicVersion = versionId;
            selectedFiles = List.copyOf(fileIds);
        }

        @Audit(name = "撤回对外知识版本", spel = "#target.snapshot()", diff = true, highRisk = true)
        public void withdraw() {
            version++;
            visible = false;
            publicVersion = null;
            selectedFiles = List.of();
        }

        @Audit(name = "未变化", spel = "#target.snapshot()", diff = true)
        public void unchanged() { }

        @Audit(name = "失败操作", spel = "#target.snapshot()", diff = true)
        public void failure() { throw new IllegalStateException("expected business failure"); }

        @Audit(name = "仅字段审计", spel = "#target.snapshot()")
        public void lightweight() { version++; }
    }
}
