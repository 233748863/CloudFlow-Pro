package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.util.Date;

@Data
@TableName("sys_user")
public class SysUser {
    @TableId
    private Long userId;
    private Long deptId;
    private String userName;
    private String nickName;
    private String email;
    private String phonenumber;
    private String sex;
    private String password;
    private String status;
    private String delFlag;
    private String loginIp;
    private Date loginDate;
    private Long tenantId;
    private String createBy;
    private Date createTime;
    private String remark;
    
    /** 非数据库字段 */
    @TableField(exist = false)
    private String role;

    @TableField(exist = false)
    private Long[] roleIds;

    @TableField(exist = false)
    private String avatar;
}
