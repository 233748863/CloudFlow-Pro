package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessCategory;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessCategoryMapper;
import com.cloudflow.workflow.service.IProcessCategoryService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 流程分类服务实现
 * 参考 RuoYi-Cloud-Plus FlwCategory 设计，支持树形结构
 *
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProcessCategoryServiceImpl implements IProcessCategoryService {

    private final WfProcessCategoryMapper categoryMapper;

    @Override
    public List<WfProcessCategory> listCategoryTree() {
        Long currentTenantId = UserContext.getTenantId();
        // 查询所有正常状态的分类，按排序号升序
        LambdaQueryWrapper<WfProcessCategory> wrapper = new LambdaQueryWrapper<WfProcessCategory>()
            .eq(WfProcessCategory::getStatus, "0")
            .orderByAsc(WfProcessCategory::getSortOrder)
            .orderByAsc(WfProcessCategory::getCategoryId);
        if (currentTenantId != null) {
            wrapper.eq(WfProcessCategory::getTenantId, currentTenantId);
        }
        List<WfProcessCategory> allCategories = categoryMapper.selectList(wrapper);
        // 构建树形结构
        return buildTree(allCategories);
    }

    @Override
    public List<WfProcessCategory> listAll() {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfProcessCategory> wrapper = new LambdaQueryWrapper<WfProcessCategory>()
            .orderByAsc(WfProcessCategory::getSortOrder)
            .orderByAsc(WfProcessCategory::getCategoryId);
        if (currentTenantId != null) {
            wrapper.eq(WfProcessCategory::getTenantId, currentTenantId);
        }
        return categoryMapper.selectList(wrapper);
    }

    @Override
    public WfProcessCategory getById(Long categoryId) {
        WfProcessCategory category = categoryMapper.selectById(categoryId);
        if (category == null) {
            throw WorkflowException.validationError("分类不存在: " + categoryId);
        }
        assertCategoryTenantAccess(category, "查看分类");
        // 填充父分类名称
        if (category.getParentId() != null && category.getParentId() > 0) {
            WfProcessCategory parent = categoryMapper.selectById(category.getParentId());
            if (parent != null) {
                assertCategoryTenantAccess(parent, "查看分类");
                category.setParentName(parent.getCategoryName());
            }
        }
        return category;
    }

    @Override
    public void add(WfProcessCategory category) {
        Long currentTenantId = UserContext.getTenantId();
        // 参数校验
        if (!StringUtils.hasText(category.getCategoryName())) {
            throw WorkflowException.validationError("分类名称不能为空");
        }
        if (!StringUtils.hasText(category.getCategoryCode())) {
            throw WorkflowException.validationError("分类编码不能为空");
        }
        // 唯一性校验
        if (!checkCodeUnique(category)) {
            throw WorkflowException.validationError("分类编码'" + category.getCategoryCode() + "'已存在");
        }
        // 默认值
        if (category.getParentId() == null) {
            category.setParentId(0L);
        }
        if (category.getSortOrder() == null) {
            category.setSortOrder(0);
        }
        if (!StringUtils.hasText(category.getStatus())) {
            category.setStatus("0");
        }
        if (currentTenantId != null && category.getTenantId() != null
            && !Objects.equals(currentTenantId, category.getTenantId())) {
            throw WorkflowException.permissionDenied("新增其他租户分类");
        }
        if (category.getTenantId() == null) {
            category.setTenantId(currentTenantId);
        }
        categoryMapper.insert(category);
        log.info("[ProcessCategory] 新增分类: code={}, name={}", category.getCategoryCode(), category.getCategoryName());
    }

    @Override
    @Audit(name = "更新流程分类")
    public void update(WfProcessCategory category) {
        Long currentTenantId = UserContext.getTenantId();
        if (category.getCategoryId() == null) {
            throw WorkflowException.validationError("分类ID不能为空");
        }
        WfProcessCategory existing = categoryMapper.selectById(category.getCategoryId());
        if (existing == null) {
            throw WorkflowException.validationError("分类不存在: " + category.getCategoryId());
        }
        assertCategoryTenantAccess(existing, "更新分类");
        // 不能将自己设为自己的父分类
        if (category.getCategoryId().equals(category.getParentId())) {
            throw WorkflowException.validationError("父分类不能选择自身");
        }
        if (category.getParentId() != null && category.getParentId() > 0) {
            WfProcessCategory parent = categoryMapper.selectById(category.getParentId());
            if (parent == null) {
                throw WorkflowException.validationError("父分类不存在: " + category.getParentId());
            }
            assertCategoryTenantAccess(parent, "更新分类");
        }
        // 唯一性校验
        if (StringUtils.hasText(category.getCategoryCode()) && !checkCodeUnique(category)) {
            throw WorkflowException.validationError("分类编码'" + category.getCategoryCode() + "'已存在");
        }
        if (currentTenantId != null) {
            category.setTenantId(existing.getTenantId());
        }
        categoryMapper.updateById(category);
        log.info("[ProcessCategory] 更新分类: id={}, code={}", category.getCategoryId(), category.getCategoryCode());
    }

    @Override
    @Audit(name = "删除流程分类", diff = true, highRisk = true)
    public void delete(Long categoryId) {
        WfProcessCategory category = categoryMapper.selectById(categoryId);
        if (category == null) {
            throw WorkflowException.validationError("分类不存在: " + categoryId);
        }
        assertCategoryTenantAccess(category, "删除分类");
        Long currentTenantId = UserContext.getTenantId();
        // 检查是否有子分类
        LambdaQueryWrapper<WfProcessCategory> childQuery = new LambdaQueryWrapper<WfProcessCategory>()
            .eq(WfProcessCategory::getParentId, categoryId);
        if (currentTenantId != null) {
            childQuery.eq(WfProcessCategory::getTenantId, currentTenantId);
        }
        Long childCount = categoryMapper.selectCount(childQuery);
        if (childCount != null && childCount > 0) {
            throw WorkflowException.validationError("该分类下存在子分类，无法删除");
        }
        categoryMapper.deleteById(categoryId);
        log.info("[ProcessCategory] 删除分类: id={}", categoryId);
    }

    @Override
    public boolean checkCodeUnique(WfProcessCategory category) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfProcessCategory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessCategory::getCategoryCode, category.getCategoryCode());
        // 编辑时排除自身
        if (category.getCategoryId() != null) {
            wrapper.ne(WfProcessCategory::getCategoryId, category.getCategoryId());
        }
        if (currentTenantId != null) {
            wrapper.eq(WfProcessCategory::getTenantId, currentTenantId);
        }
        return categoryMapper.selectCount(wrapper) == 0;
    }

    private void assertCategoryTenantAccess(WfProcessCategory category, String operation) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, category.getTenantId())) {
            throw WorkflowException.permissionDenied(operation);
        }
    }

    /**
     * 将平铺列表构建为树形结构
     * parentId=0 的为顶级节点
     */
    private List<WfProcessCategory> buildTree(List<WfProcessCategory> allCategories) {
        // 按 parentId 分组
        Map<Long, List<WfProcessCategory>> parentMap = allCategories.stream()
            .collect(Collectors.groupingBy(WfProcessCategory::getParentId));

        // 为每个节点设置 children
        for (WfProcessCategory category : allCategories) {
            List<WfProcessCategory> children = parentMap.get(category.getCategoryId());
            category.setChildren(children != null ? children : new ArrayList<>());
        }

        // 返回顶级节点（parentId=0）
        List<WfProcessCategory> roots = parentMap.getOrDefault(0L, new ArrayList<>());
        return roots;
    }
}
