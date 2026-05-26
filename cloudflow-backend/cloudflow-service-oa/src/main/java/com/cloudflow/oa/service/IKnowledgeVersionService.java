package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.KnowledgeDocVersion;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeVersionDiffVO;

import java.util.List;

/**
 * OA-P0-1 知识库版本管理。
 */
public interface IKnowledgeVersionService {

    /**
     * 为指定文档生成版本快照(在 PUBLISHED 时由 KnowledgeApprovalHandler 调用)。
     * 同一 documentId 的 version_no 自增。
     */
    Long snapshot(KnowledgeDocument document, String changeSummary);

    /** 列出某个文档的全部版本(倒序)。 */
    List<KnowledgeDocVersion> listVersions(Long documentId);

    /** 取某个文档的指定版本快照(用于详情/对比)。 */
    KnowledgeDocVersion getVersion(Long documentId, Integer versionNo);

    /**
     * 版本对比：返回 {fromVersion,toVersion,titleDiff,summaryDiff,contentDiff}。
     * contentDiff 为简单文本差异行(naive line diff)，前端可二次美化。
     */
    KnowledgeVersionDiffVO diff(Long documentId, Integer fromVersion, Integer toVersion);

    /**
     * 回滚到某个历史版本：将历史版本的内容覆盖到 oa_knowledge_document 主表，
     * 同时为本次回滚再生成一个新版本快照(changeSummary 标注"回滚自 vN")。
     */
    boolean rollback(Long documentId, Integer versionNo);
}
