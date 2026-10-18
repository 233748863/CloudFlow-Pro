package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("oa_consumable_request")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OaConsumableRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long requestId;

    @JsonIgnore
    private Long tenantId;

    private String requestNo;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long applicantId;

    private String applicantName;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long deptId;

    private String deptName;

    private String purpose;

    private LocalDate applyDate;

    private LocalDate expectDate;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal totalAmount;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal issuedAmount;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal returnedAmount;

    private String status;

    private String instanceId;

    @JsonIgnore
    private String createKey;

    @JsonIgnore
    private String createHash;

    @JsonIgnore
    private String submitKey;

    @JsonIgnore
    private String submitHash;

    @JsonIgnore
    private String ruleSnapshot;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime submitTime;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long issueBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime issueTime;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long cancelBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime cancelTime;

    private String cancelReason;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
