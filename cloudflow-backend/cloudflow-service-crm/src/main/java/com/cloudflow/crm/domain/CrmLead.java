package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("crm_lead")
public class CrmLead implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long leadId;
    private Long tenantId;
    private String leadNo;
    private String leadName;
    private String companyName;
    private String contactName;
    private String mobile;
    private String phone;
    private String email;
    private String source;
    private String industry;
    private String status;
    private Long ownerId;
    private String ownerName;
    private Long deptId;
    private String deptName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime nextFollowUpTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastFollowUpTime;
    private Long convertedCustomerId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime convertedTime;
    private String remark;
    private String qualificationStatus;
    private Long qualifiedBy;
    private String qualifiedByName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime qualifiedTime;
    private String disqualifyReason;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal annualRevenue;
    private String employeeScale;
    private String marketSegment;
    private Long territoryId;
    private String jobTitle;
    private String website;
    private Long campaignId;
    private Integer unsubscribeFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime unsubscribeTime;
    private Integer leadScore;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime scoreUpdatedTime;
    @TableField(exist = false)
    private Integer scoreMin;
    @TableField(exist = false)
    private Integer scoreMax;
    @TableField(exist = false)
    private String scoreOrder;
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
