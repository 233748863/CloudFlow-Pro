package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * 租户信息表
 */
@Data
@TableName("sys_tenant")
public class SysTenant {
    
    /** 租户ID */
    @TableId(type = IdType.AUTO)
    private Long tenantId;
    
    /** 租户名称 */
    private String tenantName;
    
    /** 联系人 */
    private String contactName;
    
    /** 联系电话 */
    private String contactPhone;
    
    /** 联系邮箱 */
    private String contactEmail;
    
    /** 域名(可选) */
    private String domain;
    
    /** 租户状态（0正常 1停用） */
    private String status;
    
    /** 过期时间 */
    private Date expireTime;
    
    /** 用户数量限制 */
    private Integer userLimit;
    
    /** 存储空间限制(MB) */
    private Long storageLimit;
    
    /** 已使用存储空间(MB) */
    private Long storageUsed;
    
    /** 删除标志（0代表存在 2代表删除） */
    private String delFlag;
    
    /** 创建者 */
    private String createBy;
    
    /** 创建时间 */
    private Date createTime;
    
    /** 更新者 */
    private String updateBy;
    
    /** 更新时间 */
    private Date updateTime;
    
    /** 备注 */
    private String remark;
}
