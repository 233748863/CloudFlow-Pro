package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.cloudflow.crm.support.CrmCampaignLogArchiveCodec;
import lombok.Data;
import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("crm_campaign_log")
public class CrmCampaignLog implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long logId;
    private Long tenantId;
    private Long campaignId;
    private Long massEmailId;
    private String action;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actionTime;
    private String targetType;
    private Long targetId;
    private String targetEmail;
    private String clickUrl;
    private String userAgent;
    private String ipAddress;
    private Long messageRecordId;
    private Integer testFlag;
    private String sourceEventKey;
    @JsonIgnore
    private byte[] archivePayload;
    @JsonIgnore
    private byte[] archiveChecksum;
    @JsonIgnore
    private LocalDateTime archivedTime;
    @JsonIgnore
    private LocalDateTime archiveCheckedTime;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    public String getTargetEmail() {
        return archivePayload == null ? targetEmail : archivedDetails().targetEmail();
    }

    public String getClickUrl() {
        return archivePayload == null ? clickUrl : archivedDetails().clickUrl();
    }

    public String getUserAgent() {
        return archivePayload == null ? userAgent : archivedDetails().userAgent();
    }

    public String getIpAddress() {
        return archivePayload == null ? ipAddress : archivedDetails().ipAddress();
    }

    private CrmCampaignLogArchiveCodec.Details archivedDetails() {
        return CrmCampaignLogArchiveCodec.decode(archivePayload, archiveChecksum);
    }
}
