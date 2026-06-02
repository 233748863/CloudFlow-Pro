package com.cloudflow.workflow.domain.system;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

@Data
@TableName("sys_role")
public class SysRole {
    @TableId
    private Long roleId;
    private Long tenantId;
    private String roleName;
    private String roleKey;
    private String status;
    private Integer deleted;
    @Version
    private Integer version;
}
