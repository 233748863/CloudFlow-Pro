package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
@TableName(value = "crm_sales_stage", autoResultMap = true)
public class CrmSalesStage implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long stageId;
    private Long tenantId;
    private String stageCode;
    private String stageName;
    private Integer sortNo;
    private BigDecimal defaultWinRate;
    private Integer allowSkipFlag;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> requiredFields;
    private Integer requiredActivityFlag;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Integer overdueDays;
    private Integer isWonFlag;
    private Integer isLostFlag;
    private String status;
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
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
