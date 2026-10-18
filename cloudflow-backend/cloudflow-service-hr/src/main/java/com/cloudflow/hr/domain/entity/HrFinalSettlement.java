package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName(value = "hr_final_settlement", autoResultMap = true)
public class HrFinalSettlement implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long settlementId;
    private Long tenantId;
    private String settlementNo;
    private Long employeeId;
    private Long lifecycleApplicationId;
    private String settlementKind;
    private Long reversalOfId;
    private Integer supersededFlag;
    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Long activeLifecycleId;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate joinDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate relievingDate;
    private BigDecimal workYears;
    private Long ruleId;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode calculationSnapshot;
    private BigDecimal totalPayable;
    private BigDecimal totalReceivable;
    private BigDecimal assetRecoveryCost;
    private BigDecimal severanceAmount;
    private BigDecimal netAmount;
    private String status;
    private String approvalStatus;
    private String instanceId;
    private Long paymentRequestId;
    private Long settlementProofFileId;
    private Long confirmedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime confirmedTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime paidTime;
    private String remark;
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
