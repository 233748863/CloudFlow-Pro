package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@TableName("hr_shift_request")
public class HrShiftRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long requestId;
    private Long tenantId;
    private String requestNo;
    private Long employeeId;
    private Long deptId;
    private String requestMode;
    private Long fromShiftId;
    private Long toShiftId;
    private Long fromRuleId;
    private Long toRuleId;
    private LocalDate fromDate;
    private LocalDate toDate;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long swapEmployeeId;
    private String peerAcceptanceStatus;
    private Long peerRespondedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime peerRespondedTime;
    private String peerResponseNote;
    private String reason;
    private Long approverId;
    private String status;
    private String instanceId;
    private Integer minimumRestMinutes;
    @JsonIgnore
    private String scheduleSnapshot;
    private String applicationStatus;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime appliedTime;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String lastErrorCode;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String lastErrorMessage;
    @JsonIgnore
    private String idempotencyKey;
    @JsonIgnore
    private String requestDigest;
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
