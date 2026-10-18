package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.KnowledgeDocVersion;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.dto.KnowledgeExternalRequests;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeExternalStateVO;
import com.cloudflow.oa.mapper.KnowledgeExternalMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class KnowledgeExternalService {
    private final KnowledgeExternalMapper knowledge;
    private final KnowledgeExternalAttachments attachments;

    @Transactional(readOnly = true)
    public KnowledgeExternalStateVO preview(Long documentId, Long versionId) {
        KnowledgeDocument document = requireDocument(documentId, false);
        KnowledgeExternalStateVO result = state(document);
        result.setVersions(knowledge.versions(document.getTenantId(), documentId));
        if (versionId != null) {
            KnowledgeDocVersion version = requireVersion(document, versionId);
            result.setPreview(view(version));
            result.setAttachmentCandidates(attachments.candidates(document.getTenantId(), documentId, version.getAttachmentUrl()));
            if (version.getAttachmentUrl() != null && !version.getAttachmentUrl().isBlank()
                    && version.getAttachmentUrl().split(",").length > result.getAttachmentCandidates().size()) {
                result.setAttachmentUnavailableReason("该版本有无法核验归属、已删除或属于其他业务的附件，仅列出可以公开的文件");
            }
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "对外发布知识版本", spel = "@knowledgeExternalService.auditState(#documentId)", diff = true, highRisk = true)
    public KnowledgeExternalStateVO publish(Long documentId, KnowledgeExternalRequests.Publish request) {
        KnowledgeDocument document = requireDocument(documentId, true);
        requireVersionMatch(document, request == null ? null : request.getVersion());
        if (!"PUBLISHED".equals(document.getStatus())) throw new ServiceException("仅已审批发布的知识文档可对外发布", 409);
        KnowledgeDocVersion version = requireVersion(document, request.getVersionId());
        KnowledgeExternalContent.clean(version.getContent());
        List<Long> selected = KnowledgeAttachmentRules.validate(request.getAttachmentFileIds());
        attachments.selected(document.getTenantId(), documentId, version.getAttachmentUrl(), selected);
        return write(document, version.getId(), true, KnowledgeAttachmentRules.encode(selected));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "撤回对外知识版本", spel = "@knowledgeExternalService.auditState(#documentId)", diff = true, highRisk = true)
    public KnowledgeExternalStateVO withdraw(Long documentId, KnowledgeExternalRequests.Version request) {
        KnowledgeDocument document = requireDocument(documentId, true);
        requireVersionMatch(document, request == null ? null : request.getVersion());
        return write(document, null, false, null);
    }

    public KnowledgeExternalStateVO auditState(Long documentId) { return state(requireDocument(documentId, false)); }

    private KnowledgeExternalStateVO write(KnowledgeDocument document, Long versionId, boolean visible, String attachmentFileIds) {
        int nextVersion = Math.addExact(document.getVersion(), 1);
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(LocalDateTime.now());
        if (knowledge.writePublication(document, versionId, visible, attachmentFileIds) != 1) throw conflict();
        document.setVersion(nextVersion);
        document.setExternalVersionId(versionId);
        document.setExternalVisibleFlag(visible ? 1 : 0);
        document.setExternalAttachmentFileIds(attachmentFileIds);
        return state(document);
    }

    private KnowledgeDocument requireDocument(Long documentId, boolean lock) {
        Set<String> permissions = UserContext.getPermissions();
        Long tenantId = UserContext.getTenantId();
        if (UserContext.getUserId() == null || tenantId == null || tenantId <= 0 || permissions == null
                || !(permissions.contains("*:*:*") || permissions.contains("oa:knowledge:external-publish"))) {
            throw new ServiceException("无权对外发布知识文档", 403);
        }
        KnowledgeDocument document = documentId == null || documentId <= 0 ? null : knowledge.document(tenantId,
                documentId, lock, DataScopeUtils.listScope("dept_id", "submitter_id"));
        if (document == null || !Objects.equals(tenantId, document.getTenantId())) {
            throw new ServiceException("知识文档不存在或无权访问", 404);
        }
        return document;
    }

    private KnowledgeDocVersion requireVersion(KnowledgeDocument document, Long versionId) {
        KnowledgeDocVersion version = versionId == null || versionId <= 0 ? null
                : knowledge.version(document.getTenantId(), document.getDocumentId(), versionId);
        if (version == null) throw new ServiceException("指定知识版本不存在或不属于该文档", 404);
        return version;
    }

    private static PortalKnowledgeVO view(KnowledgeDocVersion version) {
        PortalKnowledgeVO result = new PortalKnowledgeVO();
        result.setDocumentId(version.getDocumentId());
        result.setVersionId(version.getId());
        result.setVersionNo(version.getVersionNo());
        result.setTitle(version.getTitle());
        result.setContent(KnowledgeExternalContent.clean(version.getContent()));
        return result;
    }

    private static KnowledgeExternalStateVO state(KnowledgeDocument document) {
        KnowledgeExternalStateVO result = new KnowledgeExternalStateVO();
        result.setDocumentId(document.getDocumentId());
        result.setVersion(document.getVersion());
        result.setStatus(document.getStatus());
        result.setExternalVisible(Integer.valueOf(1).equals(document.getExternalVisibleFlag()));
        result.setExternalVersionId(document.getExternalVersionId());
        result.setExternalAttachmentFileIds(KnowledgeAttachmentRules.selection(document.getExternalAttachmentFileIds()));
        return result;
    }

    private static void requireVersionMatch(KnowledgeDocument document, Integer version) {
        if (version == null || version < 0 || !Objects.equals(version, document.getVersion())) throw conflict();
    }

    private static ServiceException conflict() { return new ServiceException("文档已变化，请核对最新发布状态后重试", 409); }
}
