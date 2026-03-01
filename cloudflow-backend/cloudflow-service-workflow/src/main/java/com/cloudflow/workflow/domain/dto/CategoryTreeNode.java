package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 分类树节点 DTO
 * 用于展示树形结构的分类
 */
@Data
public class CategoryTreeNode {
    /** 分类ID */
    private String id;

    /** 分类名称 */
    private String name;

    /** 分类描述 */
    private String description;

    /** 父分类ID */
    private String parentId;

    /** 排序号 */
    private Integer orderNum;

    /** 子分类列表 */
    private List<CategoryTreeNode> children;

    /** 模板数量 */
    private Integer templateCount;
}
