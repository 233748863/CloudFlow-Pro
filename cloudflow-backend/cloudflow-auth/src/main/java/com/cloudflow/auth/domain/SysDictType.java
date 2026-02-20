package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 字典类型实体
 *
 * @author CloudFlow
 */
@Data
@TableName("sys_dict_type")
public class SysDictType {

    /** 字典主键 */
    @TableId
    private Long dictId;

    /** 租户ID */
    private Long tenantId;

    /** 字典名称 */
    private String dictName;

    /** 字典类型（唯一标识） */
    private String dictType;

    /** 状态（0正常 1停用） */
    private String status;

    /** 备注 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime updateTime;
}
