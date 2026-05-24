package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 人才盘点活动详情视图。
 *
 * <p>对外返回剔除多租户/逻辑删除等内部字段，仅暴露业务字段与必要审计字段。
 * 与 {@code HrTalentReview} entity 物理分离，禁止任何 MyBatis 注解。
 */
@Data
@Schema(name = "HrTalentReviewVO", description = "人才盘点活动详情视图")
public class HrTalentReviewVO {

    @Schema(description = "盘点活动主键")
    private Long id;

    @Schema(description = "盘点编号")
    private String reviewNo;

    @Schema(description = "盘点活动名称")
    private String reviewName;

    @Schema(description = "盘点年度")
    private Integer reviewYear;

    @Schema(description = "盘点周期类型：H/Q/Y 等")
    private String cycleType;

    @Schema(description = "盘点范围类型：DEPT/POSITION/LEVEL/CUSTOM")
    private String scopeType;

    @Schema(description = "盘点范围值（JSON/CSV）")
    private String scopeValue;

    @Schema(description = "业绩源目标 ID")
    private Long performanceSourceObjectiveId;

    @Schema(description = "盘点责任人员工 ID")
    private Long ownerId;

    @Schema(description = "盘点截止日期")
    private LocalDate deadline;

    @Schema(description = "盘点活动状态：DRAFT/IN_PROGRESS/CALIBRATING/PUBLISHED/CLOSED")
    private String status;

    @Schema(description = "盘点发布时间")
    private LocalDateTime publishTime;

    @Schema(description = "盘点说明")
    private String description;

    @Schema(description = "关联流程实例 ID")
    private String processInstanceId;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    private LocalDateTime updateTime;
}
