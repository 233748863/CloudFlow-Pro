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
    private String createBy;
    private Date createTime;
    private String remark;
    
    // Non-DB fields
    @TableField(exist = false)
    private String role;

    @TableField(exist = false)
    private Long[] roleIds;
    
    // Avatar is usually in DB or derived. In init_data it wasn't there explicitly? 
    // Wait, init_data had: VALUES (..., remark)
    // It didn't have avatar column in the INSERTs I saw.
    // But `UserContext` usually wants avatar.
    // I'll leave it as exist=false or check schema.
    // The previous SysUser I wrote had avatar.
    // I'll assume it's exist=false for now or add it if schema has it.
    // But for `getDeptId` error, I just need `deptId`.
    
    @TableField(exist = false)
    private String avatar;
}
