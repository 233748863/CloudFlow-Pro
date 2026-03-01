package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WorkflowTemplate;
import com.cloudflow.workflow.domain.dto.CreateFromTemplateRequest;
import com.cloudflow.workflow.domain.dto.CreateTemplateRequest;
import com.cloudflow.workflow.domain.dto.UpdateTemplateRequest;
import com.cloudflow.workflow.domain.dto.TemplateDTO;

import java.util.List;

/**
 * 流程模板服务接口
 * 提供模板的创建、查询、更新、删除等功能
 *
 * @author CloudFlow
 */
public interface ITemplateService {

    /**
     * 分页查询模板列表（支持筛选）
     * @param categoryId 分类ID（可选）
     * @param tags 标签列表（可选）
     * @param keyword 关键词（可选，搜索名称和描述）
     * @param pageNum 页码
     * @param pageSize 每页大小
     * @return 分页结果
     */
    Page<TemplateDTO> listTemplates(String categoryId, List<String> tags, String keyword, int pageNum, int pageSize);

    /**
     * 根据ID获取模板详情
     * @param id 模板ID
     * @return 模板详情
     */
    TemplateDTO getTemplateById(String id);

    /**
     * 创建模板
     * @param request 创建请求
     * @return 创建的模板
     */
    TemplateDTO createTemplate(CreateTemplateRequest request);

    /**
     * 更新模板
     * @param id 模板ID
     * @param request 更新请求
     * @return 更新后的模板
     */
    TemplateDTO updateTemplate(String id, UpdateTemplateRequest request);

    /**
     * 删除模板
     * @param id 模板ID
     */
    void deleteTemplate(String id);

    /**
     * 验证模板结构（必须包含开始和结束节点）
     * @param definition 流程定义JSON
     * @return true=有效
     */
    boolean validateTemplateStructure(String definition);

    /**
     * 检查模板是否被流程引用
     * @param templateId 模板ID
     * @return 引用该模板的流程数量
     */
    int checkTemplateUsage(String templateId);

    /**
     * 增加模板使用次数
     * @param templateId 模板ID
     */
    void incrementUsageCount(String templateId);

    /**
     * 从模板创建流程
     * @param templateId 模板ID
     * @param request 创建请求
     * @return 创建的流程定义
     */
    WfProcessDefinition createWorkflowFromTemplate(String templateId, CreateFromTemplateRequest request);
}
