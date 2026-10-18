package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.Serializable;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
@TableName("crm_mass_email_recipient")
public class CrmMassEmailRecipient implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    @ToString.Include
    private Long recipientId;
    private Long tenantId;
    private Long massEmailId;
    private Long campaignId;
    private Long crmEmailId;
    private String targetType;
    private Long targetId;
    @JsonIgnore
    private String emailHash;
    @JsonIgnore
    private String emailEncrypted;
    private String emailMask;
    @JsonIgnore
    private String variableSnapshotEncrypted;
    @JsonIgnore
    private String openTokenHash;
    @JsonIgnore
    private String unsubscribeTokenHash;
    private Long messageRecordId;
    private Long deliveryId;
    private Integer testFlag;
    @ToString.Include
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime firstOpenTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime firstClickTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime unsubscribedTime;
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
