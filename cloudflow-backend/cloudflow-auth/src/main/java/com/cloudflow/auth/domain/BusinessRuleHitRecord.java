package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 业务规则命中记录。
 */
@Data
@TableName("sys_business_rule_hit_record")
public class BusinessRuleHitRecord implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String ruleCode;
    private String businessType;
    private Long businessId;
    private BigDecimal thresholdValue;
    private BigDecimal actualValue;
    private String effect;
    private String hitResult;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;
}
