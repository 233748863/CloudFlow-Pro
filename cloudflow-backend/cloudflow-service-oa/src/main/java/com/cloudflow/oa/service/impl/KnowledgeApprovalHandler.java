package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.mapper.KnowledgeDocumentMapper;
import com.cloudflow.oa.service.IKnowledgeVersionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeApprovalHandler implements ApprovalResultHandler {

    private final KnowledgeDocumentMapper knowledgeDocumentMapper;
    private final IKnowledgeVersionService knowledgeVersionService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.KNOWLEDGE_DOCUMENT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        LambdaUpdateWrapper<KnowledgeDocument> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(KnowledgeDocument::getDocumentId, dto.getBusinessId())
                .eq(KnowledgeDocument::getInstanceId, dto.getProcessInstanceId())
                .set(KnowledgeDocument::getStatus, "PUBLISHED")
                .set(KnowledgeDocument::getPublishTime, LocalDateTime.now())
                .set(KnowledgeDocument::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(KnowledgeDocument::getUpdateTime, LocalDateTime.now());
        if (!updateStatus(dto, wrapper, "PUBLISHED")) {
            return;
        }

        // OA-P0-1 发布即生成版本快照
        try {
            KnowledgeDocument document = knowledgeDocumentMapper.selectById(dto.getBusinessId());
            if (document != null) {
                knowledgeVersionService.snapshot(document, "审批通过发布");
            }
        } catch (Exception e) {
            log.warn("知识库版本快照生成失败(发布回写已成功): businessId={}, err={}",
                    dto.getBusinessId(), e.getMessage());
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        LambdaUpdateWrapper<KnowledgeDocument> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(KnowledgeDocument::getDocumentId, dto.getBusinessId())
                .eq(KnowledgeDocument::getInstanceId, dto.getProcessInstanceId())
                .set(KnowledgeDocument::getStatus, "REJECTED")
                .set(KnowledgeDocument::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(KnowledgeDocument::getUpdateTime, LocalDateTime.now());
        updateStatus(dto, wrapper, "REJECTED");
    }

    private boolean updateStatus(ApprovalResultDTO dto,
                                 LambdaUpdateWrapper<KnowledgeDocument> wrapper,
                                 String status) {
        int updated = knowledgeDocumentMapper.update(null, wrapper);
        if (updated <= 0) {
            KnowledgeDocument document = knowledgeDocumentMapper.selectById(dto.getBusinessId());
            if (document == null) {
                throw new IllegalStateException("未找到知识库文档，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "知识库文档", dto.getBusinessId(), document.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("知识库文档审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("知识库发布审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
        return true;
    }
}
