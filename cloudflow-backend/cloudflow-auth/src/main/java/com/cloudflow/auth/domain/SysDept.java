package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@TableName("sys_dept")
public class SysDept {
    @TableId
    private Long deptId;
    private Long tenantId;
    private Long parentId;
    private String ancestors;
    private String deptName;
    private Integer orderNum;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long leaderUserId;
    @TableField(exist = false)
    private String leaderName;
    private String phone;
    private String email;
    private String status;
    
    @TableField(exist = false)
    private List<SysDept> children = new ArrayList<>();


    @Version
    private Integer version;
}
