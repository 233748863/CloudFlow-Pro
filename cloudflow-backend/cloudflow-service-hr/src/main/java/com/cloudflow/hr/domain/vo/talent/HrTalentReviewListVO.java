package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 人才盘点活动列表行视图。
 *
 * <p>列表场景字段精简版，独立类不继承 {@link HrTalentReviewVO}。
 */
@Data
@Schema(name = "HrTalentReviewListVO", description = "人才盘点活动列表行视图")
public class HrTalentReviewListVO {

    @Schema(description = "盘点活动主键")
    private Long id;

    @Schema(description = "盘点编号")
    private String reviewNo;

    @Schema(description = "盘点活动名称")
    private String reviewName;

    @Schema(description = "盘点年度")
    private Integer reviewYear;

    @Schema(description = "盘点周期类型")
    private String cycleType;

    @Schema(description = "盘点范围类型")
    private String scopeType;

    @Schema(description = "盘点责任人员工 ID")
    private Long ownerId;

    @Schema(description = "盘点截止日期")
    private LocalDate deadline;

    @Schema(description = "盘点活动状态")
    private String status;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;
}
