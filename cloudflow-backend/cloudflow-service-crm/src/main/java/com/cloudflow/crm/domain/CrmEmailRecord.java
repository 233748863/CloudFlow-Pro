package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
@TableName(value = "crm_email_record", autoResultMap = true)
public class CrmEmailRecord implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    @ToString.Include
    private Long emailId;
    private Long tenantId;
    private Long messageRecordId;
    private String operationKey;
    private String direction;
    private String subject;
    private String contentSummary;
    private String sanitizedContent;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String fromAddress;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> toAddresses;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> ccAddresses;
    private String bizType;
    private Long bizId;
    private Long customerId;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long contactId;
    private Long senderUserId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendTime;
    private String sendStatus;
    private Integer attachmentCount;
    @TableField(typeHandler = com.cloudflow.crm.mapper.handler.CrmEmailFileIdsTypeHandler.class)
    private List<Long> attachmentFileIds;
    private Integer readFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime readTime;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remark;
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
