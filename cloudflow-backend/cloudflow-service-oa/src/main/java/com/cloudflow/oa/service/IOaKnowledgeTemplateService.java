package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaKnowledgeTemplate;

import java.util.List;

/**
 * OA-P1-3 知识库文档模板。
 *
 * <p>新建知识文档时可基于模板初始化 content；本服务负责模板 CRUD + usage_count 累计。
 */
public interface IOaKnowledgeTemplateService {

    Page<OaKnowledgeTemplate> page(String keyword, String category, String status,
                                   Integer pageNum, Integer pageSize);

    /** 启用中的模板下拉（供新建文档使用）。 */
    List<OaKnowledgeTemplate> listActive(String category);

    OaKnowledgeTemplate getById(Long id);

    boolean save(OaKnowledgeTemplate template);

    boolean update(OaKnowledgeTemplate template);

    boolean remove(Long id);

    /** 使用模板（累加 usage_count），返回模板的 content 给前端作为初始正文。 */
    String useTemplate(Long id);
}
