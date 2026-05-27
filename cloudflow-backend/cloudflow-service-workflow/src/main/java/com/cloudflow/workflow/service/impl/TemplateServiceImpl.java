package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.workflow.domain.TemplateCategory;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WorkflowTemplate;
import com.cloudflow.workflow.domain.dto.CreateFromTemplateRequest;
import com.cloudflow.workflow.domain.dto.CreateTemplateRequest;
import com.cloudflow.workflow.domain.dto.TemplateDTO;
import com.cloudflow.workflow.domain.dto.UpdateTemplateRequest;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.TemplateCategoryMapper;
import com.cloudflow.workflow.mapper.WorkflowTemplateMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.ITemplateService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * 流程模板服务实现类
 * 实现模板的完整生命周期管理
 *
 * @author CloudFlow
 */
@Slf4j
@Service
public class TemplateServiceImpl implements ITemplateService {

    @Autowired
    private WorkflowTemplateMapper templateMapper;

    @Autowired
    private TemplateCategoryMapper categoryMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private IWfDefinitionService wfDefinitionService;
    @Autowired
    private WorkflowGraphModelResolver workflowGraphModelResolver;

    /**
     * 分页查询模板列表（支持多条件筛选）
     */
    @Override
    public Page<TemplateDTO> listTemplates(String categoryId, List<String> tags, String keyword, String status, int pageNum, int pageSize) {
        log.info("查询模板列表 - 分类:{}, 标签:{}, 关键词:{}, 状态:{}, 页码:{}, 每页:{}", categoryId, tags, keyword, status, pageNum, pageSize);

        // 构建查询条件
        LambdaQueryWrapper<WorkflowTemplate> wrapper = new LambdaQueryWrapper<>();
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        boolean isAdmin = SecurityUtils.isAdmin();
        String normalizedStatus = normalizeListStatus(status, isAdmin);

        // 模板库默认只看启用模板；管理端可显式请求 all / active / inactive。
        if (!"all".equals(normalizedStatus)) {
            wrapper.eq(WorkflowTemplate::getStatus, normalizedStatus);
        }
        if (currentTenantId != null) {
            // 当前租户可见：本租户模板 + 平台系统模板（tenant_id 为空且 is_system=1）
            wrapper.and(w -> w.eq(WorkflowTemplate::getTenantId, currentTenantId)
                    .or(q -> q.isNull(WorkflowTemplate::getTenantId).eq(WorkflowTemplate::getIsSystem, 1)));
        }

        // 按分类筛选
        if (StringUtils.hasText(categoryId)) {
            wrapper.eq(WorkflowTemplate::getCategoryId, categoryId);
        }

        // 按标签筛选（JSON数组包含查询）
        if (tags != null && !tags.isEmpty()) {
            for (String tag : tags) {
                wrapper.like(WorkflowTemplate::getTags, tag);
            }
        }

        // 按关键词搜索（搜索名称和描述）
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(WorkflowTemplate::getName, keyword)
                    .or()
                    .like(WorkflowTemplate::getDescription, keyword));
        }

        // 按创建时间倒序排列
        wrapper.orderByDesc(WorkflowTemplate::getCreatedAt);

        // 执行分页查询
        Page<WorkflowTemplate> page = new Page<>(pageNum, pageSize);
        Page<WorkflowTemplate> result = templateMapper.selectPage(page, wrapper);
        Map<String, String> categoryNameMap = loadCategoryNameMap(result.getRecords());

        // 转换为DTO
        Page<TemplateDTO> dtoPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        List<TemplateDTO> dtoList = result.getRecords().stream()
                .map(template -> convertToDTO(template, categoryNameMap))
                .toList();
        dtoPage.setRecords(dtoList);

        log.info("查询到 {} 条模板记录", dtoList.size());
        return dtoPage;
    }

    /**
     * 根据ID获取模板详情
     */
    @Override
    public TemplateDTO getTemplateById(String id) {
        log.info("获取模板详情 - ID:{}", id);

        WorkflowTemplate template = templateMapper.selectById(id);
        if (template == null) {
            throw new WorkflowException("模板不存在: " + id);
        }
        assertTemplateReadable(template, "查看模板");

        return convertToDTO(template, loadCategoryNameMap(List.of(template)));
    }

    /**
     * 创建模板
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateDTO createTemplate(CreateTemplateRequest request) {
        log.info("创建模板 - 名称:{}", request.getName());

        // 验证必填字段
        validateCreateRequest(request);

        // 将定义对象转换为JSON字符串
        String definitionJson = convertObjectToJson(request.getDefinition());

        // 验证模板结构
        if (!validateTemplateStructure(definitionJson)) {
            throw new WorkflowException("模板结构无效");
        }

        // 创建模板实体
        WorkflowTemplate template = new WorkflowTemplate();
        template.setId(UUID.randomUUID().toString().replace("-", ""));
        template.setName(request.getName());
        template.setDescription(request.getDescription());
        template.setCategoryId(request.getCategoryId());
        template.setTags(convertTagsToJson(request.getTags()));
        template.setDefinition(definitionJson);
        template.setPreviewImage(request.getPreviewImage());

        // 设置创建者ID（转换为String）
        Long userId = WorkflowSecurityUtils.getCurrentUserId();
        template.setCreatedBy(userId != null ? userId.toString() : null);

        template.setCreatedAt(LocalDateTime.now());
        template.setUpdatedAt(LocalDateTime.now());
        template.setUsageCount(0);
        template.setIsSystem(0); // 用户创建的模板，非系统模板
        template.setStatus(resolveTemplateStatus(request.getStatus(), "active"));
        template.setTenantId(WorkflowSecurityUtils.getCurrentTenantId());

        // 保存到数据库
        templateMapper.insert(template);

        log.info("模板创建成功 - ID:{}", template.getId());
        return convertToDTO(template, loadCategoryNameMap(List.of(template)));
    }

    /**
     * 更新模板
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateDTO updateTemplate(String id, UpdateTemplateRequest request) {
        log.info("更新模板 - ID:{}", id);

        // 检查模板是否存在
        WorkflowTemplate template = templateMapper.selectById(id);
        if (template == null) {
            throw new WorkflowException("模板不存在: " + id);
        }
        assertTemplateWritable(template, "更新模板");

        // 如果更新了流程定义，需要验证结构
        if (request.getDefinition() != null) {
            String definitionJson = convertObjectToJson(request.getDefinition());
            if (!validateTemplateStructure(definitionJson)) {
                throw new WorkflowException("模板结构无效");
            }
            template.setDefinition(definitionJson);
        }

        // 更新字段
        if (StringUtils.hasText(request.getName())) {
            template.setName(request.getName());
        }
        if (StringUtils.hasText(request.getDescription())) {
            template.setDescription(request.getDescription());
        }
        if (StringUtils.hasText(request.getCategoryId())) {
            template.setCategoryId(request.getCategoryId());
        }
        if (request.getTags() != null) {
            template.setTags(convertTagsToJson(request.getTags()));
        }
        if (StringUtils.hasText(request.getPreviewImage())) {
            template.setPreviewImage(request.getPreviewImage());
        }
        if (StringUtils.hasText(request.getStatus())) {
            template.setStatus(resolveTemplateStatus(request.getStatus(), template.getStatus()));
        }

        template.setUpdatedAt(LocalDateTime.now());

        // 保存更新
        templateMapper.updateById(template);

        log.info("模板更新成功 - ID:{}", id);
        return convertToDTO(template, loadCategoryNameMap(List.of(template)));
    }

    /**
     * 删除模板
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteTemplate(String id) {
        log.info("删除模板 - ID:{}", id);

        // 检查模板是否存在
        WorkflowTemplate template = templateMapper.selectById(id);
        if (template == null) {
            throw new WorkflowException("模板不存在: " + id);
        }
        assertTemplateWritable(template, "删除模板");

        // 检查是否有流程正在使用该模板
        int usageCount = checkTemplateUsage(id);
        if (usageCount > 0) {
            throw new WorkflowException("该模板正在被 " + usageCount + " 个流程使用，无法删除");
        }

        // 执行删除
        templateMapper.deleteById(id);

        log.info("模板删除成功 - ID:{}", id);
    }

    /**
     * 验证模板结构
     * 必须包含至少一个开始节点和一个结束节点
     */
    @Override
    public boolean validateTemplateStructure(String definition) {
        try {
            return workflowGraphModelResolver.validateGraphModel(definition);
        } catch (Exception e) {
            log.error("验证模板结构失败", e);
            return false;
        }
    }

    /**
     * 检查模板是否被流程引用
     */
    @Override
    public int checkTemplateUsage(String templateId) {
        return templateMapper.countWorkflowsByTemplateId(templateId);
    }

    /**
     * 增加模板使用次数
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void incrementUsageCount(String templateId) {
        log.info("增加模板使用次数 - ID:{}", templateId);
        WorkflowTemplate template = templateMapper.selectById(templateId);
        if (template != null) {
            assertTemplateReadable(template, "更新模板使用次数");
        }
        templateMapper.incrementUsageCount(templateId);
    }

    @Override
    public List<String> listRecommendedTags(int limit) {
        int normalizedLimit = Math.max(1, Math.min(limit, 50));
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();

        LambdaQueryWrapper<WorkflowTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkflowTemplate::getStatus, "active");
        if (currentTenantId != null) {
            wrapper.and(w -> w.eq(WorkflowTemplate::getTenantId, currentTenantId)
                    .or(q -> q.isNull(WorkflowTemplate::getTenantId).eq(WorkflowTemplate::getIsSystem, 1)));
        }

        Map<String, Integer> tagCounter = new HashMap<>();
        List<WorkflowTemplate> templates = templateMapper.selectList(wrapper);
        for (WorkflowTemplate template : templates) {
            for (String tag : convertJsonToTags(template.getTags())) {
                if (!StringUtils.hasText(tag)) {
                    continue;
                }
                tagCounter.merge(tag.trim(), 1, Integer::sum);
            }
        }

        return tagCounter.entrySet().stream()
                .sorted(
                        Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue)
                                .reversed()
                                .thenComparing(Map.Entry::getKey)
                )
                .limit(normalizedLimit)
                .map(Map.Entry::getKey)
                .toList();
    }

    /**
     * 验证创建请求
     */
    private void validateCreateRequest(CreateTemplateRequest request) {
        if (!StringUtils.hasText(request.getName())) {
            throw new WorkflowException("模板名称不能为空");
        }
        if (!StringUtils.hasText(request.getDescription())) {
            throw new WorkflowException("模板描述不能为空");
        }
        if (!StringUtils.hasText(request.getCategoryId())) {
            throw new WorkflowException("模板分类不能为空");
        }
        if (request.getTags() == null || request.getTags().isEmpty()) {
            throw new WorkflowException("模板标签不能为空");
        }
        if (request.getDefinition() == null) {
            throw new WorkflowException("流程定义不能为空");
        }
    }

    /**
     * 将对象转换为JSON字符串
     */
    private String convertObjectToJson(Object obj) {
        try {
            if (obj instanceof String) {
                return (String) obj;
            }
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            log.error("转换对象为JSON失败", e);
            throw new WorkflowException("流程定义格式错误");
        }
    }

    /**
     * 将JSON字符串转换为对象
     */
    private Object convertJsonToObject(String json) {
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            log.error("解析JSON失败", e);
            return null;
        }
    }

    /**
     * 将标签列表转换为JSON字符串
     */
    private String convertTagsToJson(List<String> tags) {
        try {
            return objectMapper.writeValueAsString(tags);
        } catch (Exception e) {
            log.error("转换标签为JSON失败", e);
            return "[]";
        }
    }

    /**
     * 将JSON字符串转换为标签列表
     */
    private List<String> convertJsonToTags(String tagsJson) {
        try {
            return objectMapper.readValue(tagsJson, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            log.error("解析标签JSON失败", e);
            return List.of();
        }
    }

    /**
     * 将实体转换为DTO
     */
    private TemplateDTO convertToDTO(WorkflowTemplate template, Map<String, String> categoryNameMap) {
        TemplateDTO dto = new TemplateDTO();
        BeanUtils.copyProperties(template, dto);
        dto.setCategoryName(categoryNameMap.get(template.getCategoryId()));

        // 转换标签
        if (StringUtils.hasText(template.getTags())) {
            dto.setTags(convertJsonToTags(template.getTags()));
        }

        // 转换流程定义
        if (StringUtils.hasText(template.getDefinition())) {
            dto.setDefinition(convertJsonToObject(template.getDefinition()));
        }

        // 转换系统模板标志
        dto.setIsSystem(template.getIsSystem() == 1);

        return dto;
    }

    private Map<String, String> loadCategoryNameMap(List<WorkflowTemplate> templates) {
        List<String> categoryIds = templates.stream()
                .map(WorkflowTemplate::getCategoryId)
                .filter(StringUtils::hasText)
                .distinct()
                .toList();

        if (categoryIds.isEmpty()) {
            return Map.of();
        }

        // 批量回填分类名称，避免前端再次维护一套本地映射。
        return categoryMapper.selectBatchIds(categoryIds).stream()
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toMap(TemplateCategory::getId, TemplateCategory::getName, (left, right) -> left));
    }

    private String normalizeListStatus(String rawStatus, boolean isAdmin) {
        if (!isAdmin) {
            return "active";
        }
        if (!StringUtils.hasText(rawStatus)) {
            return "active";
        }
        String normalized = rawStatus.trim().toLowerCase(Locale.ROOT);
        if ("all".equals(normalized) || "active".equals(normalized) || "inactive".equals(normalized)) {
            return normalized;
        }
        throw new WorkflowException("模板状态筛选仅支持 active、inactive 或 all");
    }

    private String resolveTemplateStatus(String rawStatus, String defaultStatus) {
        if (!StringUtils.hasText(rawStatus)) {
            return defaultStatus;
        }
        String normalized = rawStatus.trim().toLowerCase(Locale.ROOT);
        if ("active".equals(normalized) || "inactive".equals(normalized)) {
            return normalized;
        }
        throw new WorkflowException("模板状态仅支持 active 或 inactive");
    }

    /**
     * 从模板创建流程
     * 复制模板的所有节点、连接和配置到新流程
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public WfProcessDefinition createWorkflowFromTemplate(String templateId, CreateFromTemplateRequest request) {
        log.info("从模板创建流程 - 模板ID:{}, 流程名称:{}", templateId, request.getWorkflowName());

        // 验证请求参数
        if (!StringUtils.hasText(request.getWorkflowName())) {
            throw new WorkflowException("流程名称不能为空");
        }

        // 获取模板
        WorkflowTemplate template = templateMapper.selectById(templateId);
        if (template == null) {
            throw new WorkflowException("模板不存在: " + templateId);
        }
        assertTemplateReadable(template, "从模板创建流程");

        // 检查模板状态
        if (!"active".equals(template.getStatus())) {
            throw new WorkflowException("模板状态不可用");
        }
        if (!validateTemplateStructure(template.getDefinition())) {
            throw new WorkflowException("模板定义结构无效");
        }

        // 创建流程定义对象
        WfProcessDefinition definition = new WfProcessDefinition();

        // 设置流程基本信息
        definition.setProcessName(request.getWorkflowName());
        definition.setDescription(request.getDescription());

        // 设置流程Key（如果未提供则使用流程名称的拼音或自动生成）
        if (StringUtils.hasText(request.getProcessKey())) {
            definition.setProcessKey(request.getProcessKey());
        } else {
            // 自动生成流程Key：使用UUID的前8位
            definition.setProcessKey("wf_" + UUID.randomUUID().toString().substring(0, 8));
        }

        // 复制模板的流程定义（所有节点、连接和配置）
        definition.setModelJson(template.getDefinition());

        // 设置初始版本
        definition.setVersion(1);
        definition.setIsLatest(1);

        // 设置状态为草稿
        definition.setStatus("DRAFT");

        // 设置租户ID
        definition.setTenantId(WorkflowSecurityUtils.getCurrentTenantId());

        // 设置创建时间和创建者（转换为String）
        definition.setCreateTime(LocalDateTime.now());
        Long userId = WorkflowSecurityUtils.getCurrentUserId();
        definition.setCreateBy(userId != null ? userId.toString() : null);

        // 记录来源模板ID（结构化字段，避免依赖描述拼接）
        definition.setTemplateId(templateId);

        // 调用流程定义服务保存流程
        try {
            wfDefinitionService.saveProcessDefinition(definition);

            // 增加模板使用次数
            incrementUsageCount(templateId);

            log.info("从模板创建流程成功 - 流程ID:{}, 模板ID:{}", definition.getDefinitionId(), templateId);
            return definition;

        } catch (Exception e) {
            log.error("从模板创建流程失败", e);
            throw new WorkflowException("创建流程失败: " + e.getMessage());
        }
    }

    private void assertTemplateReadable(WorkflowTemplate template, String operation) {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        if (currentTenantId == null) {
            return;
        }
        Long templateTenantId = template.getTenantId();
        if (templateTenantId == null) {
            // 仅平台系统模板允许跨租户读取
            if (!Integer.valueOf(1).equals(template.getIsSystem())) {
                throw WorkflowException.permissionDenied(operation);
            }
            return;
        }
        if (!Objects.equals(currentTenantId, templateTenantId)) {
            throw WorkflowException.permissionDenied(operation);
        }
    }

    private void assertTemplateWritable(WorkflowTemplate template, String operation) {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        if (currentTenantId == null) {
            return;
        }
        if (!Objects.equals(currentTenantId, template.getTenantId())) {
            throw WorkflowException.permissionDenied(operation);
        }
        if (Integer.valueOf(1).equals(template.getIsSystem())) {
            throw WorkflowException.permissionDenied(operation);
        }
    }
}
