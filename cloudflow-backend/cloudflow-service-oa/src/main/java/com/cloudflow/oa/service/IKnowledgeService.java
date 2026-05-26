package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.vo.DynamicMapVO;

import java.util.List;

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

    DynamicMapVO getReadStats(Long documentId);
}
