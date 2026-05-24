package com.cloudflow.common.tenant.support;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * sys_tenant 精简视图。
 * <p>
 * 仅暴露平台级跨租户调度需要的字段：tenantId / status / expireTime。
 * 各业务服务（OA / HR / CRM 等）通过 {@link TenantIterator} 遍历活跃租户，
 * 避免直接依赖 cloudflow-auth 模块的 SysTenant。
 * </p>
 *
 * @author CloudFlow
 */
@Data
@TableName("sys_tenant")
public class SysTenantLite {

    @TableId(value = "tenant_id", type = IdType.AUTO)
    private Long tenantId;

    /** 0=正常 1=停用 */
    private String status;

    /** 过期时间，null 视为不过期 */
    @TableField("expire_time")
    private LocalDateTime expireTime;

    @TableLogic
    private Integer deleted;
}
