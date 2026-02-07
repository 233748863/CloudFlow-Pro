package com.cloudflow.workflow.domain.system;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_user")
public class SysUser {
    @TableId
    private Long userId;
    private String userName;
    private String nickName;
    private String email;
    private Long deptId;
}
