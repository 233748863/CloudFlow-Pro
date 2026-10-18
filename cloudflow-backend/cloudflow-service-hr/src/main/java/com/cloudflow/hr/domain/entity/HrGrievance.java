package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_grievance")
public class HrGrievance implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long grievanceId;
    private Long tenantId;
    private String grievanceNo;
    private Long employeeId;
    private String employeeName;
    private Long deptId;
    private String grievanceType;
    private String subject;
    private String description;
    private String cause;
    private String expectation;
    private String againstType;
    private Long againstId;
    private String againstName;
    private String relatedBizType;
    private Long relatedBizId;
    private String attachmentUrl;
    private String priority;
    private String status;
    private Long handlerId;
    private String handlerName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime acceptTime;
    private String resolutionDetail;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate resolutionDate;
    private Integer satisfiedFlag;
    private Long escalatedDisputeId;
    private String instanceId;
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
