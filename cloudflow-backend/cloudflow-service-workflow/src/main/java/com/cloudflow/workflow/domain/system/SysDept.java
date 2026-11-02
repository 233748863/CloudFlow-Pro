package com.cloudflow.workflow.domain.system;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

@Data
@TableName("sys_dept")
public class SysDept {
    @TableId
    private Long deptId;
    private Long tenantId;
    private Long parentId;
    private String deptName;
    private Long leaderUserId;
    private String status;
    private Integer deleted;
    @Version
    private Integer version;
}
