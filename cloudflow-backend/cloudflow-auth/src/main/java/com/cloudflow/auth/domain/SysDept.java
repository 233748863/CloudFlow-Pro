package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableField;
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
    private Long parentId;
    private String ancestors;
    private String deptName;
    private Integer orderNum;
    private String leader;
    private String phone;
    private String email;
    private String status;
    
    @TableField(exist = false)
    private List<SysDept> children = new ArrayList<>();


    @Version
    private Integer version;
}
