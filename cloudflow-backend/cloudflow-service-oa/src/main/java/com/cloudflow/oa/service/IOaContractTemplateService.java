package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaContractTemplate;

import java.util.List;
import java.util.Map;

/**
 * OA-P0-2 合同模板管理。
 */
public interface IOaContractTemplateService {

    /** 分页列表 (status: ACTIVE/INACTIVE 可选)。 */
    Page<OaContractTemplate> page(String keyword, String category, String contractType, String status,
                                  Integer pageNum, Integer pageSize);

    /** 启用中的模板下拉(供新建合同使用)。 */
    List<OaContractTemplate> listActive(String contractType);

    OaContractTemplate getById(Long templateId);

    boolean save(OaContractTemplate template);

    boolean update(OaContractTemplate template);

    boolean remove(Long templateId);

    /**
     * 按模板正文进行 {{var}} 占位变量替换，返回最终合同正文。
     * variables 为变量值映射, 缺失的变量保留原占位。
     */
    String renderContent(Long templateId, Map<String, Object> variables);
}
