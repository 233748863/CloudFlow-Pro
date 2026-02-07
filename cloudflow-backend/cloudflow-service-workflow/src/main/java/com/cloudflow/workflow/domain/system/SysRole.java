package com.cloudflow.workflow.domain.system;

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
}
