package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 招聘渠道 VO（剔除 deleted/tenantId，
 * contactPhone/contactEmail 由 maskRow 按权限脱敏后输出）。
 */
@Data
@Schema(name = "HrRecruitmentChannelVO", description = "HR 招聘渠道 VO")
public class HrRecruitmentChannelVO {
    @Schema(description = "渠道 ID") private Long id;
    @Schema(description = "渠道编码") private String channelCode;
    @Schema(description = "渠道名称") private String channelName;
    @Schema(description = "渠道类型 PORTAL/HEADHUNTER/REFERRAL/CAMPUS/SOCIAL/OTHER") private String channelType;
    @Schema(description = "成本金额") private BigDecimal costAmount;
    @Schema(description = "成本币种") private String costCurrency;
    @Schema(description = "合同起始") private LocalDate contractStart;
    @Schema(description = "合同结束") private LocalDate contractEnd;
    @Schema(description = "对接人姓名") private String contactName;
    @Schema(description = "对接人手机（按 hr:comp:view 权限脱敏）") private Object contactPhone;
    @Schema(description = "对接人邮箱（按 hr:comp:view 权限脱敏）") private Object contactEmail;
    @Schema(description = "状态 ACTIVE/EXPIRED/DISABLED") private String status;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
