package com.cloudflow.workflow.domain.system;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_dept")
public class SysDept {
    @TableId
    private Long deptId;
    private Long tenantId;
    private Long parentId;
    private String deptName;
    private String leader; // Leader name, but usually we need ID. The mock data has 'admin' etc. 
    private String status;
    private String delFlag;
    // For real system, leader should be user ID. But based on SQL, it's varchar 'admin'.
    // We might need to look up user by username if leader stores username.
}
