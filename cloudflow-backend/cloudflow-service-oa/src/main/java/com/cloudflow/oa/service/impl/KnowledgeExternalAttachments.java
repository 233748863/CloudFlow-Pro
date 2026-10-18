package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.mapper.KnowledgeExternalMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class KnowledgeExternalAttachments {
    private final KnowledgeExternalMapper knowledge;

    public List<PortalKnowledgeVO.Attachment> candidates(Long tenantId, Long documentId, String references) {
        List<Long> ids = KnowledgeAttachmentRules.references(references);
        return ids.isEmpty() ? List.of() : knowledge.attachments(tenantId, documentId, ids);
    }

    public List<PortalKnowledgeVO.Attachment> selected(Long tenantId, Long documentId, String references, List<Long> selected) {
        List<Long> ids = KnowledgeAttachmentRules.validate(selected);
        if (ids.isEmpty()) return List.of();
        List<PortalKnowledgeVO.Attachment> result = candidates(tenantId, documentId, references).stream()
                .filter(file -> ids.contains(file.getFileId())).toList();
        if (result.size() != ids.size()) throw new ServiceException("所选附件不存在、未属于指定版本或不允许对外发布，请核对最新状态", 409);
        return result;
    }
}
