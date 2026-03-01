package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 创建模板请求 DTO
 */
@Data
public class CreateTemplateRequest {
    /** 模板名称 */
    private String name;

    /** 模板描述 */
    private String description;

    /** 分类ID */
    private String categoryId;

    /** 标签列表 */
    private List<String> tags;

    /** 流程定义（JSON对象） */
    private Object definition;

    /** 预览图URL */
    private String previewImage;
}
