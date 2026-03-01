package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.TemplateCategory;
import com.cloudflow.workflow.domain.dto.CategoryTreeNode;

import java.util.List;

/**
 * 模板分类服务接口
 * 提供分类的树形结构管理功能
 *
 * @author CloudFlow
 */
public interface ITemplateCategoryService {

    /**
     * 查询分类树形列表
     * @return 树形结构的分类列表
     */
    List<CategoryTreeNode> listCategoryTree();

    /**
     * 查询所有分类（平铺列表）
     * @return 分类列表
     */
    List<TemplateCategory> listAll();

    /**
     * 根据ID查询分类
     * @param categoryId 分类ID
     * @return 分类信息
     */
    TemplateCategory getById(String categoryId);

    /**
     * 新增分类
     * @param category 分类信息
     * @return 创建的分类
     */
    TemplateCategory add(TemplateCategory category);

    /**
     * 修改分类
     * @param category 分类信息
     * @return 更新后的分类
     */
    TemplateCategory update(TemplateCategory category);

    /**
     * 删除分类
     * @param categoryId 分类ID
     */
    void delete(String categoryId);

    /**
     * 检查分类下是否有模板
     * @param categoryId 分类ID
     * @return 模板数量
     */
    int countTemplatesByCategory(String categoryId);

    /**
     * 检查分类下是否有子分类
     * @param categoryId 分类ID
     * @return 子分类数量
     */
    int countChildCategories(String categoryId);
}
