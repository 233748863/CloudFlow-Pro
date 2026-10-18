package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_role_mutex")
public class SysRoleMutex {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /**
     * 同 VehicleFuelLog.fuelPer100km：MyBatis-Plus 驼峰转下划线不在字母与数字之间断词，
     * roleId1 会被推成 role_id1，而建表列是 role_id_1，必须显式指定。
     */
    @TableField("role_id_1")
    private Long roleId1;

    @TableField("role_id_2")
    private Long roleId2;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
