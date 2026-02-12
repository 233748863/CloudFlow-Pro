package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_role")
public class SysRole {
    @TableId
    private Long roleId;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    private String roleName;
    private String roleKey;
    private Integer roleSort;
    private String status;
    
    /**
     * 数据权限类型（0全部 1自定义 2本级及下级 3本级 4本人）
     */
    private Integer dsType;
    
    /**
     * 自定义数据权限（部门ID列表，逗号分隔）
     */
    private String dsScope;

    @TableField(exist = false)
    private Long[] menuIds;
    
    /**
     * 创建人
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 修改人
     */
    @TableField(fill = FieldFill.UPDATE)
    private String updateBy;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 修改时间
     */
    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 删除标记（0正常 1删除）
     */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private String delFlag;
}
