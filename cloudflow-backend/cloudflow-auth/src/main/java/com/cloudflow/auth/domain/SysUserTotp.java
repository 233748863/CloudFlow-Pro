package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("sys_user_totp")
public class SysUserTotp implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long userId;

    private String secretCiphertext;

    private Integer enabled;

    private LocalDateTime enabledAt;

    /** 最近一次验证通过的时间步，用于拒绝同一步长内的重放 */
    private Long lastUsedStep;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
