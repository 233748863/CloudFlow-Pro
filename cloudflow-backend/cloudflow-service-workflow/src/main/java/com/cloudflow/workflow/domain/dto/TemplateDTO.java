package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程模板 DTO
 * 用于前端展示和数据传输
 */
@Data
public class TemplateDTO {
    /** 模板ID */
    private String id;

    /** 模板名称 */
    private String name;

    /** 模板描述 */
    private String description;

    /** 分类ID */
    private String categoryId;

    /** 分类名称 */
    private String categoryName;

    /** 标签列表 */
    private List<String> tags;

    /** 流程定义（JSON对象） */
    private Object definition;

    /** 预览图URL */
    private String previewImage;

    /** 创建者ID */
    private String createdBy;

    /** 创建者名称 */
    private String createdByName;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;

    /** 使用次数 */
    private Integer usageCount;

    /** 是否系统模板 */
    private Boolean isSystem;

    /** 状态 */
    private String status;
}
