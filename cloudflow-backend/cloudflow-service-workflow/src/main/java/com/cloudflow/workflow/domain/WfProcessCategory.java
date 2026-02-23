package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程分类实体
 * 参考 RuoYi-Cloud-Plus FlwCategory 设计，支持树形结构
 *
 * @author CloudFlow
 */
@Data
@TableName("wf_process_category")
public class WfProcessCategory {

    /** 分类ID */
    @TableId(type = IdType.AUTO)
    private Long categoryId;

    /** 父分类ID（0表示顶级分类） */
    private Long parentId;

    /** 分类名称 */
    private String categoryName;

    /** 分类编码（唯一标识） */
    private String categoryCode;

    /** 分类图标 */
    private String icon;

    /** 排序号 */
    private Integer sortOrder;

    /** 状态（0=正常 1=停用） */
    private String status;

    /** 备注 */
    private String remark;

    /** 租户ID */
    private Long tenantId;

    /** 创建者 */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /** 更新者 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    // ========== 非数据库字段 ==========

    /** 子分类列表（树形结构用） */
    @TableField(exist = false)
    private List<WfProcessCategory> children;

    /** 父分类名称（查询展示用） */
    @TableField(exist = false)
    private String parentName;
}
