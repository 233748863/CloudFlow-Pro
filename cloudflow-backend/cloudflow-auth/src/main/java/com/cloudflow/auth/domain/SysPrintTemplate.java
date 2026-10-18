package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/** 打印模板配置；版本由服务在租户锁内按旧版本条件递增。 */
@Data
@TableName("sys_print_template")
public class SysPrintTemplate {
    @TableId(type = IdType.AUTO)
    private Long templateId;
    private Long tenantId;
    private String templateCode;
    private String templateName;
    private String bizType;
    private String templateFormat;
    private String outputFormat;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String templateContent;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String templateFileUrl;
    private String paperSize;
    private String orientation;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal paperWidthMm;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal paperHeightMm;
    private BigDecimal marginTop;
    private BigDecimal marginBottom;
    private BigDecimal marginLeft;
    private BigDecimal marginRight;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String variablesDeclare;
    private Integer defaultFlag;
    private Integer version;
    private String status;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remark;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
