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
 * 业务规则版本。
 */
@Data
@TableName("sys_business_rule_version")
public class BusinessRuleVersion implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long ruleId;
    private String ruleCode;
    private Integer versionNo;
    private BigDecimal thresholdValue;
    private String effect;
    private Integer enabled;
    private Integer priority;
    private String remark;
    private String status;
    private String publisherName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime publishedTime;

    private String snapshotJson;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
