package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 用户与岗位关联表
 */
@Data
@TableName("sys_user_post")
public class SysUserPost {
    /** 用户ID */
    private Long userId;
    /** 岗位ID */
    private Long postId;
    /** 租户ID */
    private Long tenantId;
}
