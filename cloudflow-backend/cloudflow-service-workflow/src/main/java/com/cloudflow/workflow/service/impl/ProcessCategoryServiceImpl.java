package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfProcessCategory;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessCategoryMapper;
import com.cloudflow.workflow.service.IProcessCategoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
        // 查询所有正常状态的分类，按排序号升序
        List<WfProcessCategory> allCategories = categoryMapper.selectList(
            new LambdaQueryWrapper<WfProcessCategory>()
                .eq(WfProcessCategory::getStatus, "0")
                .orderByAsc(WfProcessCategory::getSortOrder)
                .orderByAsc(WfProcessCategory::getCategoryId)
        );
        // 构建树形结构
        return buildTree(allCategories);
    }

    @Override
    public List<WfProcessCategory> listAll() {
        return categoryMapper.selectList(
            new LambdaQueryWrapper<WfProcessCategory>()
                .orderByAsc(WfProcessCategory::getSortOrder)
                .orderByAsc(WfProcessCategory::getCategoryId)
        );
    }

    @Override
    public WfProcessCategory getById(Long categoryId) {
        WfProcessCategory category = categoryMapper.selectById(categoryId);
        if (category == null) {
            throw WorkflowException.validationError("分类不存在: " + categoryId);
        }
        // 填充父分类名称
        if (category.getParentId() != null && category.getParentId() > 0) {
            WfProcessCategory parent = categoryMapper.selectById(category.getParentId());
            if (parent != null) {
                category.setParentName(parent.getCategoryName());
            }
        }
        return category;
    }

    @Override
    public void add(WfProcessCategory category) {
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
        categoryMapper.insert(category);
        log.info("[ProcessCategory] 新增分类: code={}, name={}", category.getCategoryCode(), category.getCategoryName());
    }

    @Override
    public void update(WfProcessCategory category) {
        if (category.getCategoryId() == null) {
            throw WorkflowException.validationError("分类ID不能为空");
        }
        // 不能将自己设为自己的父分类
        if (category.getCategoryId().equals(category.getParentId())) {
            throw WorkflowException.validationError("父分类不能选择自身");
        }
        // 唯一性校验
        if (StringUtils.hasText(category.getCategoryCode()) && !checkCodeUnique(category)) {
            throw WorkflowException.validationError("分类编码'" + category.getCategoryCode() + "'已存在");
        }
        categoryMapper.updateById(category);
        log.info("[ProcessCategory] 更新分类: id={}, code={}", category.getCategoryId(), category.getCategoryCode());
    }

    @Override
    public void delete(Long categoryId) {
        // 检查是否有子分类
        Long childCount = categoryMapper.selectCount(
            new LambdaQueryWrapper<WfProcessCategory>()
                .eq(WfProcessCategory::getParentId, categoryId)
        );
        if (childCount != null && childCount > 0) {
            throw WorkflowException.validationError("该分类下存在子分类，无法删除");
        }
        categoryMapper.deleteById(categoryId);
        log.info("[ProcessCategory] 删除分类: id={}", categoryId);
    }

    @Override
    public boolean checkCodeUnique(WfProcessCategory category) {
        LambdaQueryWrapper<WfProcessCategory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessCategory::getCategoryCode, category.getCategoryCode());
        // 编辑时排除自身
        if (category.getCategoryId() != null) {
            wrapper.ne(WfProcessCategory::getCategoryId, category.getCategoryId());
        }
        return categoryMapper.selectCount(wrapper) == 0;
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
