package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("sys_user")
public class SysUser implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long userId;
    private Long deptId;
    private String userName;
    private String nickName;
    private String email;
    private String phonenumber;
    private String sex;
    @JsonIgnore
    private String password;
    private String status;
    private String delFlag;
    private String pwdResetRequired;
    private String loginIp;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime loginDate;
    private Long tenantId;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;
    private String remark;
    
    /** 非数据库字段 */
    @TableField(exist = false)
    private String role;

    @TableField(exist = false)
    private Long[] roleIds;

    @TableField(exist = false)
    private Long[] postIds;

    @TableField(exist = false)
    private Boolean forceDeptSync;

    @TableField(exist = false)
    private String avatar;

    @TableField(exist = false)
    private String deptName;

    @TableField(exist = false)
    private String tenantName;
}
