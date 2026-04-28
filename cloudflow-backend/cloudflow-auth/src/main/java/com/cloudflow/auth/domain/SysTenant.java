package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 租户实体类
 * 
 * @author CloudFlow
 */
@Data
@TableName("sys_tenant")
public class SysTenant {
    
    /**
     * 租户ID
     */
    @TableId(value = "tenant_id", type = IdType.AUTO)
    private Long tenantId;

    /**
     * Tenant code used by login and registration.
     */
    private String tenantCode;
    
    /**
     * 租户名称
     */
    private String tenantName;
    
    /**
     * 联系人
     */
    private String contactName;
    
    /**
     * 联系电话
     */
    private String contactPhone;
    
    /**
     * 联系邮箱
     */
    private String contactEmail;
    
    /**
     * 域名(可选)
     */
    private String domain;
    
    /**
     * 状态（0正常 1停用）
     */
    private String status;
    
    /**
     * 过期时间
     */
    private LocalDateTime expireTime;
    
    /**
     * 用户数量限制
     */
    private Integer userLimit;
    
    /**
     * 存储空间限制(MB)
     */
    private Long storageLimit;
    
    /**
     * 已使用存储空间(MB)
     */
    private Long storageUsed;
    
    /**
     * 删除标志（0代表存在 2代表删除）
     */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private String delFlag;
    
    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新者
     */
    @TableField(fill = FieldFill.UPDATE)
    private String updateBy;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 备注
     */
    private String remark;
}
