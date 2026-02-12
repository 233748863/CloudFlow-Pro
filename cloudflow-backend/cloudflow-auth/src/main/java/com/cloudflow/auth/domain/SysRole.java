package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_role")
public class SysRole {
    @TableId
    private Long roleId;
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
}
