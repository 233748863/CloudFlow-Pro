package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.util.Date;

/**
 * 系统参数配置表
 * 对应数据库表 sys_config
 *
 * @author CloudFlow
 */
@Data
@TableName("sys_config")
public class SysConfig {

    /** 参数主键 */
    @TableId(type = IdType.AUTO)
    private Long configId;

    /** 参数名称 */
    private String configName;

    /** 参数键名（唯一标识，如 sys.user.initPassword） */
    private String configKey;

    /** 参数键值 */
    private String configValue;

    /** 系统内置（Y=是 N=否），内置参数不允许删除 */
    private String configType;

    /** 配置作用域（0=全局 1=租户） */
    private String configScope;

    private String createBy;

    private Date createTime;

    private String updateBy;

    private Date updateTime;

    /** 备注 */
    private String remark;

    /** 租户ID */
    private Long tenantId;
}
