package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 人才池成员视图。
 */
@Data
@Schema(name = "HrTalentPoolMemberVO", description = "人才池成员视图")
public class HrTalentPoolMemberVO {

    @Schema(description = "成员记录主键")
    private Long id;

    @Schema(description = "所属池 ID")
    private Long poolId;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "加入时间")
    private LocalDateTime joinedAt;

    @Schema(description = "来源盘点 ID")
    private Long joinedReviewId;

    @Schema(description = "退出时间")
    private LocalDateTime exitAt;

    @Schema(description = "退出原因")
    private String exitReason;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "备注")
    private String remark;
}
