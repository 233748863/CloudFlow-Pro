package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 模板分类新增/修改请求参数
 */
@Data
public class TemplateCategoryRequest {
    /** 分类名称 */
    private String name;

    /** 分类描述 */
    private String description;

    /** 父分类ID，空值表示顶级分类 */
    private String parentId;

    /** 排序号 */
    private Integer orderNum;
}
