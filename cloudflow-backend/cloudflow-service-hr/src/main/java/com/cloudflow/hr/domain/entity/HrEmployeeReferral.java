package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName(value = "hr_employee_referral", autoResultMap = true)
public class HrEmployeeReferral implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long referralId;
    private Long tenantId;
    private String referralNo;
    private Long referrerEmployeeId;
    private String referrerName;
    private String candidateName;
    private String contactPhone;
    private String email;
    private String currentEmployer;
    private String currentJobTitle;
    private Long targetPositionId;
    private Long resumeFileId;
    private String referralReason;
    private String status;
    private Long candidateId;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate hireDate;
    private Integer bonusApplicableFlag;
    private BigDecimal bonusAmount;
    private String bonusStatus;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate bonusPayDate;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode bonusConditionSnapshot;
    private String bonusConditionRemark;
    private Long compChangeId;
    private String instanceId;
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
