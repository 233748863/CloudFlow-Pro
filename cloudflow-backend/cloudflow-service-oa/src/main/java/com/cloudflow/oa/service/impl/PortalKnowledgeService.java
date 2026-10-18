package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.common.core.domain.PortalKnowledgeFile;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.oa.mapper.PortalKnowledgeMapper;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgePublication;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PortalKnowledgeService {
    private final PortalTokens tokens;
    private final PortalKnowledgeMapper knowledge;
    private final KnowledgeExternalAttachments attachments;

    public PageResult<PortalKnowledgeVO> list(String token, String keyword, int pageNum, int pageSize) {
        PortalIdentity identity = requireIdentity(token);
        if (pageNum < 1 || pageNum > 1_000_000 || pageSize < 1 || pageSize > 100
                || keyword != null && keyword.length() > 100) {
            throw new ServiceException("页码须为1至1000000，每页1至100条，搜索词最多100字符", 400);
        }
        return PageResult.build(knowledge.published(new Page<>(pageNum, pageSize), identity,
                keyword == null ? null : keyword.trim()));
    }

    public PortalKnowledgeVO detail(String token, Long documentId) {
        PortalIdentity identity = requireIdentity(token);
        KnowledgePublication document = publication(identity, documentId);
        PortalKnowledgeVO result = new PortalKnowledgeVO();
        result.setDocumentId(document.getDocumentId());
        result.setVersionId(document.getVersionId());
        result.setVersionNo(document.getVersionNo());
        result.setTitle(document.getTitle());
        result.setContent(KnowledgeExternalContent.clean(document.getContent()));
        result.setAttachments(publishedAttachments(identity, document));
        return result;
    }

    public PortalKnowledgeFile file(String token, Long documentId, Long versionId, Long fileId) {
        PortalIdentity identity = requireIdentity(token);
        KnowledgePublication document = publication(identity, documentId);
        if (versionId == null || !versionId.equals(document.getVersionId()) || fileId == null || fileId <= 0) throw unavailable();
        PortalKnowledgeVO.Attachment file = publishedAttachments(identity, document).stream()
                .filter(candidate -> fileId.equals(candidate.getFileId())).findFirst().orElseThrow(PortalKnowledgeService::unavailable);
        return new PortalKnowledgeFile(documentId, versionId, document.getPublicationVersion(), file);
    }

    private KnowledgePublication publication(PortalIdentity identity, Long documentId) {
        if (documentId == null || documentId <= 0) throw unavailable();
        KnowledgePublication document = knowledge.detail(identity, documentId);
        if (document == null) throw unavailable();
        return document;
    }

    private List<PortalKnowledgeVO.Attachment> publishedAttachments(PortalIdentity identity, KnowledgePublication document) {
        List<Long> selected = KnowledgeAttachmentRules.selection(document.getExternalAttachmentFileIds());
        return attachments.candidates(identity.tenantId(), document.getDocumentId(), document.getAttachmentUrl()).stream()
                .filter(file -> selected.contains(file.getFileId())).toList();
    }

    private PortalIdentity requireIdentity(String token) {
        PortalIdentity identity = tokens.verify(token);
        if (identity == null || !Objects.equals(identity.tenantId(), UserContext.getTenantId())
                || !knowledge.activeIdentity(identity)) {
            throw new ServiceException("门户登录状态已失效，请重新登录", 401);
        }
        return identity;
    }

    private static ServiceException unavailable() { return new ServiceException("知识文档不存在或未对外发布", 404); }
}
