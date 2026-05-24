package com.cloudflow.hr.domain.dto.recruitment;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 招聘域共用分页查询入参（需求/候选人/面试/Offer/渠道列表使用）。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrRecruitmentCommonQueryDTO", description = "招聘域共用分页查询入参")
public class HrRecruitmentCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配 需求标题/候选人姓名")
    private String keyword;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "岗位 ID")
    private Long positionId;

    @Schema(description = "需求 ID")
    private Long requisitionId;

    @Schema(description = "候选人 ID")
    private Long candidateId;

    @Schema(description = "渠道 ID")
    private Long channelId;

    @Schema(description = "渠道类型 INTERNAL/REFERRAL/JOB_BOARD/AGENCY/CAMPUS")
    private String channelType;

    @Schema(description = "面试类型 PHONE/ONSITE/VIDEO/TECHNICAL/HR")
    private String interviewType;

    @Schema(description = "起始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;
}
