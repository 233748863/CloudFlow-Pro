package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.KnowledgeDocumentMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeApprovalHandler implements ApprovalResultHandler {

    private final KnowledgeDocumentMapper knowledgeDocumentMapper;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_KNOWLEDGE_DOCUMENT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        LambdaUpdateWrapper<KnowledgeDocument> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(KnowledgeDocument::getDocumentId, dto.getBusinessId())
                .set(KnowledgeDocument::getInstanceId, dto.getProcessInstanceId())
                .set(KnowledgeDocument::getStatus, "PUBLISHED")
                .set(KnowledgeDocument::getPublishTime, LocalDateTime.now())
                .set(KnowledgeDocument::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(KnowledgeDocument::getUpdateTime, LocalDateTime.now());
        updateStatus(dto, wrapper, "PUBLISHED");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        LambdaUpdateWrapper<KnowledgeDocument> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(KnowledgeDocument::getDocumentId, dto.getBusinessId())
                .set(KnowledgeDocument::getInstanceId, dto.getProcessInstanceId())
                .set(KnowledgeDocument::getStatus, "REJECTED")
                .set(KnowledgeDocument::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(KnowledgeDocument::getUpdateTime, LocalDateTime.now());
        updateStatus(dto, wrapper, "REJECTED");
    }

    private void updateStatus(ApprovalResultDTO dto,
                              LambdaUpdateWrapper<KnowledgeDocument> wrapper,
                              String status) {
        int updated = knowledgeDocumentMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到知识库文档，businessId=" + dto.getBusinessId());
        }
        log.info("知识库发布审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
