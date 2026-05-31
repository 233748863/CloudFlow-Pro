package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.TemplateCategory;
import com.cloudflow.workflow.domain.WorkflowTemplate;
import com.cloudflow.workflow.domain.dto.CategoryTreeNode;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.TemplateCategoryMapper;
import com.cloudflow.workflow.mapper.WorkflowTemplateMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.ITemplateCategoryService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 模板分类服务实现类
 * 实现分类的树形结构管理
 *
 * @author CloudFlow
 */
@Slf4j
@Service
public class TemplateCategoryServiceImpl implements ITemplateCategoryService {

    @Autowired
    private TemplateCategoryMapper categoryMapper;

    @Autowired
    private WorkflowTemplateMapper templateMapper;

    /**
     * 查询分类树形列表
     * 构建父子关系的树形结构
     */
    @Override
    public List<CategoryTreeNode> listCategoryTree() {
        log.info("查询分类树形列表");

        // 查询所有分类
        List<TemplateCategory> allCategories = listAll();

        // 统计每个分类下的模板数量
        Map<String, Long> templateCountMap = countTemplatesGroupByCategory();

        // 转换为树节点
        List<CategoryTreeNode> allNodes = allCategories.stream()
                .map(category -> {
                    CategoryTreeNode node = convertToTreeNode(category);
                    // 设置模板数量
                    node.setTemplateCount(templateCountMap.getOrDefault(category.getId(), 0L).intValue());
                    return node;
                })
                .collect(Collectors.toList());

        // 构建树形结构
        return buildTree(allNodes);
    }

    /**
     * 查询所有分类（平铺列表）
     */
    @Override
    public List<TemplateCategory> listAll() {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        LambdaQueryWrapper<TemplateCategory> wrapper = new LambdaQueryWrapper<>();
        if (currentTenantId != null) {
            wrapper.and(w -> w.eq(TemplateCategory::getTenantId, currentTenantId)
                .or()
                .isNull(TemplateCategory::getTenantId));
        }
        wrapper.orderByAsc(TemplateCategory::getOrderNum);
        return categoryMapper.selectList(wrapper);
    }

    /**
     * 根据ID查询分类
     */
    @Override
    public TemplateCategory getById(String categoryId) {
        log.info("查询分类详情 - ID:{}", categoryId);
        
        TemplateCategory category = categoryMapper.selectById(categoryId);
        if (category == null) {
            throw new WorkflowException("分类不存在: " + categoryId);
        }
        assertCategoryReadable(category, "查看模板分类");
        
        return category;
    }

    /**
     * 新增分类
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public TemplateCategory add(TemplateCategory category) {
        log.info("新增分类 - 名称:{}", category.getName());

        // 验证必填字段
        validateCategory(category);

        // 如果有父分类，验证父分类是否存在
        if (StringUtils.hasText(category.getParentId())) {
            TemplateCategory parent = categoryMapper.selectById(category.getParentId());
            if (parent == null) {
                throw new WorkflowException("父分类不存在: " + category.getParentId());
            }
        }

        // 设置默认值
        category.setId(UUID.randomUUID().toString().replace("-", ""));
        category.setCreatedAt(LocalDateTime.now());
        category.setUpdatedAt(LocalDateTime.now());
        category.setTenantId(WorkflowSecurityUtils.getCurrentTenantId());

        if (category.getOrderNum() == null) {
            category.setOrderNum(0);
        }

        // 保存到数据库
        categoryMapper.insert(category);

        log.info("分类创建成功 - ID:{}", category.getId());
        return category;
    }

    /**
     * 修改分类
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新模板分类")
    public TemplateCategory update(TemplateCategory category) {
        log.info("更新分类 - ID:{}", category.getId());

        // 检查分类是否存在
        TemplateCategory existing = categoryMapper.selectById(category.getId());
        if (existing == null) {
            throw new WorkflowException("分类不存在: " + category.getId());
        }
        assertCategoryWritable(existing, "更新模板分类");

        // 验证必填字段
        validateCategory(category);

        // 如果修改了父分类，验证父分类是否存在
        if (StringUtils.hasText(category.getParentId())) {
            // 不能将自己设为父分类
            if (category.getId().equals(category.getParentId())) {
                throw new WorkflowException("不能将自己设为父分类");
            }

            TemplateCategory parent = categoryMapper.selectById(category.getParentId());
            if (parent == null) {
                throw new WorkflowException("父分类不存在: " + category.getParentId());
            }
            assertCategoryWritable(parent, "更新模板分类");

            // 检查是否会形成循环引用
            if (wouldCreateCircularReference(category.getId(), category.getParentId())) {
                throw new WorkflowException("不能设置该父分类，会形成循环引用");
            }
        }

        // 更新字段
        category.setUpdatedAt(LocalDateTime.now());
        category.setTenantId(existing.getTenantId());
        categoryMapper.updateById(category);

        log.info("分类更新成功 - ID:{}", category.getId());
        return category;
    }

    /**
     * 删除分类
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除模板分类")
    public void delete(String categoryId) {
        log.info("删除分类 - ID:{}", categoryId);

        // 检查分类是否存在
        TemplateCategory category = categoryMapper.selectById(categoryId);
        if (category == null) {
            throw new WorkflowException("分类不存在: " + categoryId);
        }
        assertCategoryWritable(category, "删除模板分类");

        // 检查是否有子分类
        int childCount = countChildCategories(categoryId);
        if (childCount > 0) {
            throw new WorkflowException("该分类下有 " + childCount + " 个子分类，无法删除");
        }

        // 检查是否有模板
        int templateCount = countTemplatesByCategory(categoryId);
        if (templateCount > 0) {
            throw new WorkflowException("该分类下有 " + templateCount + " 个模板，无法删除");
        }

        // 执行删除
        categoryMapper.deleteById(categoryId);

        log.info("分类删除成功 - ID:{}", categoryId);
    }

    /**
     * 检查分类下是否有模板
     */
    @Override
    public int countTemplatesByCategory(String categoryId) {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        LambdaQueryWrapper<WorkflowTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkflowTemplate::getCategoryId, categoryId);
        if (currentTenantId != null) {
            wrapper.and(w -> w.eq(WorkflowTemplate::getTenantId, currentTenantId)
                .or(q -> q.isNull(WorkflowTemplate::getTenantId).eq(WorkflowTemplate::getIsSystem, 1)));
        }
        return templateMapper.selectCount(wrapper).intValue();
    }

    /**
     * 检查分类下是否有子分类
     */
    @Override
    public int countChildCategories(String categoryId) {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        LambdaQueryWrapper<TemplateCategory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TemplateCategory::getParentId, categoryId);
        if (currentTenantId != null) {
            wrapper.eq(TemplateCategory::getTenantId, currentTenantId);
        }
        return categoryMapper.selectCount(wrapper).intValue();
    }

    /**
     * 验证分类信息
     */
    private void validateCategory(TemplateCategory category) {
        if (!StringUtils.hasText(category.getName())) {
            throw new WorkflowException("分类名称不能为空");
        }
    }

    /**
     * 检查是否会形成循环引用
     * 例如：A -> B -> C，如果将 C 的父分类设为 A，就会形成循环
     */
    private boolean wouldCreateCircularReference(String categoryId, String newParentId) {
        String currentParentId = newParentId;
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        
        // 向上遍历父分类链，检查是否会遇到自己
        while (StringUtils.hasText(currentParentId)) {
            if (categoryId.equals(currentParentId)) {
                return true;
            }
            
            TemplateCategory parent = categoryMapper.selectById(currentParentId);
            if (parent == null) {
                break;
            }
            if (currentTenantId != null && parent.getTenantId() != null
                && !Objects.equals(currentTenantId, parent.getTenantId())) {
                throw new WorkflowException("无权访问其他租户父分类");
            }
            
            currentParentId = parent.getParentId();
        }
        
        return false;
    }

    /**
     * 统计每个分类下的模板数量
     */
    private Map<String, Long> countTemplatesGroupByCategory() {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        LambdaQueryWrapper<WorkflowTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkflowTemplate::getStatus, "active");
        if (currentTenantId != null) {
            wrapper.and(w -> w.eq(WorkflowTemplate::getTenantId, currentTenantId)
                .or(q -> q.isNull(WorkflowTemplate::getTenantId).eq(WorkflowTemplate::getIsSystem, 1)));
        }
        
        List<WorkflowTemplate> templates = templateMapper.selectList(wrapper);
        
        return templates.stream()
                .filter(t -> StringUtils.hasText(t.getCategoryId()))
                .collect(Collectors.groupingBy(
                        WorkflowTemplate::getCategoryId,
                        Collectors.counting()
                ));
    }

    private void assertCategoryReadable(TemplateCategory category, String operation) {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        if (currentTenantId != null
            && category.getTenantId() != null
            && !Objects.equals(currentTenantId, category.getTenantId())) {
            throw WorkflowException.permissionDenied(operation);
        }
    }

    private void assertCategoryWritable(TemplateCategory category, String operation) {
        Long currentTenantId = WorkflowSecurityUtils.getCurrentTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, category.getTenantId())) {
            throw WorkflowException.permissionDenied(operation);
        }
    }

    /**
     * 将分类实体转换为树节点
     */
    private CategoryTreeNode convertToTreeNode(TemplateCategory category) {
        CategoryTreeNode node = new CategoryTreeNode();
        BeanUtils.copyProperties(category, node);
        node.setChildren(new ArrayList<>());
        return node;
    }

    /**
     * 构建树形结构
     * 将平铺的节点列表转换为树形结构
     */
    private List<CategoryTreeNode> buildTree(List<CategoryTreeNode> allNodes) {
        // 创建ID到节点的映射
        Map<String, CategoryTreeNode> nodeMap = allNodes.stream()
                .collect(Collectors.toMap(CategoryTreeNode::getId, node -> node));

        // 根节点列表（没有父节点的节点）
        List<CategoryTreeNode> rootNodes = new ArrayList<>();

        // 遍历所有节点，构建父子关系
        for (CategoryTreeNode node : allNodes) {
            String parentId = node.getParentId();
            
            if (!StringUtils.hasText(parentId)) {
                // 没有父节点，是根节点
                rootNodes.add(node);
            } else {
                // 有父节点，添加到父节点的children中
                CategoryTreeNode parent = nodeMap.get(parentId);
                if (parent != null) {
                    parent.getChildren().add(node);
                } else {
                    // 父节点不存在，也作为根节点
                    rootNodes.add(node);
                }
            }
        }

        return rootNodes;
    }
}
