package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 供应商主数据。
 */
@Data
@TableName("sys_supplier")
public class SysSupplier implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long supplierId;

    private Long tenantId;

    private String supplierName;

    private String contactName;

    private String contactPhone;

    private String bankName;

    private String bankAccount;

    /** 状态(ACTIVE启用/DISABLED停用) */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private String delFlag;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
