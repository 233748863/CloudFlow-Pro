package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfProcessCategory;

import java.util.List;

/**
 * 流程分类服务接口
 *
 * @author CloudFlow
 */
public interface IProcessCategoryService {

    /**
     * 查询分类树形列表
     * @return 树形结构的分类列表
     */
    List<WfProcessCategory> listCategoryTree();

    /**
     * 查询所有分类（平铺列表）
     * @return 分类列表
     */
    List<WfProcessCategory> listAll();

    /**
     * 根据ID查询分类
     * @param categoryId 分类ID
     * @return 分类信息
     */
    WfProcessCategory getById(Long categoryId);

    /**
     * 新增分类
     * @param category 分类信息
     */
    void add(WfProcessCategory category);

    /**
     * 修改分类
     * @param category 分类信息
     */
    void update(WfProcessCategory category);

    /**
     * 删除分类（含子分类校验）
     * @param categoryId 分类ID
     */
    void delete(Long categoryId);

    /**
     * 校验分类编码唯一性
     * @param category 分类信息
     * @return true=唯一
     */
    boolean checkCodeUnique(WfProcessCategory category);
}
