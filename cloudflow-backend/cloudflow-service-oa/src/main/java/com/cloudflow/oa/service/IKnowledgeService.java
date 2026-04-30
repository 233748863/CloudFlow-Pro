package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.KnowledgeDocument;

import java.util.List;
import java.util.Map;

public interface IKnowledgeService extends IService<KnowledgeDocument> {

    List<KnowledgeDocument> getMyReadableList(String keyword, String category, Boolean unreadOnly);

    Page<KnowledgeDocument> getMySubmissions(String keyword, String category, String status,
                                             Integer pageNum, Integer pageSize);

    Page<KnowledgeDocument> getManageList(String keyword, String category, String status,
                                          Integer pageNum, Integer pageSize);

    KnowledgeDocument getReadableDetail(Long documentId);

    boolean createDraft(KnowledgeDocument document);

    boolean updateDraft(KnowledgeDocument document);

    boolean submit(Long documentId);

    boolean recall(Long documentId);

    boolean removeDocument(Long documentId);

    boolean read(Long documentId);

    Map<String, Object> getReadStats(Long documentId);
}
