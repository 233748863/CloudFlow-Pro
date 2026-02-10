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

    @TableField(exist = false)
    private Long[] menuIds;
}
