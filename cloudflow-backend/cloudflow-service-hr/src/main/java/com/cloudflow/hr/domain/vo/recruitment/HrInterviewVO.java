package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 面试 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrInterviewVO", description = "HR 面试 VO")
public class HrInterviewVO {
    @Schema(description = "面试 ID") private Long id;
    @Schema(description = "候选人 ID") private Long candidateId;
    @Schema(description = "候选人姓名") private String candidateName;
    @Schema(description = "岗位名称") private String positionName;
    @Schema(description = "面试轮次") private String interviewRound;
    @Schema(description = "面试轮次名称") private String interviewRoundName;
    @Schema(description = "面试类型") private String interviewType;
    @Schema(description = "面试类型名称") private String interviewTypeName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime interviewTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime interviewEndTime;
    @Schema(description = "面试地点") private String location;
    @Schema(description = "会议室名称") private String meetingRoomName;
    @Schema(description = "评价") private String evaluation;
    @Schema(description = "评分") private BigDecimal score;
    @Schema(description = "结果") private String result;
    @Schema(description = "状态") private String status;
    @Schema(description = "状态名称") private String statusName;
    @Schema(description = "状态描述") private String statusDesc;
    @Schema(description = "面试官 ID 列表") private List<Long> interviewerIds;
    @Schema(description = "面试官姓名列表") private List<String> interviewerNames;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
