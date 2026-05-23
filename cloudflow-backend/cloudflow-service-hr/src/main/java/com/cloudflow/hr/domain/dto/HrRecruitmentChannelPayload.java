package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR-P0-3 招聘渠道 payload。
 */
@Data
@TableName(value = "hr_recruitment_channel", autoResultMap = true)
public class HrRecruitmentChannelPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String channelCode;
    private String channelName;
    /** PORTAL / HEADHUNTER / REFERRAL / CAMPUS / SOCIAL / OTHER */
    private String channelType;
    private BigDecimal costAmount;
    private String costCurrency;
    private LocalDate contractStart;
    private LocalDate contractEnd;
    private String contactName;
    private String contactPhone;
    private String contactEmail;
    /** ACTIVE / EXPIRED / DISABLED */
    private String status;
    private String remark;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
