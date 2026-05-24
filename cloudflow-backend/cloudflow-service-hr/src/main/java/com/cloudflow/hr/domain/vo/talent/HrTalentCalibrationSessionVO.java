package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 人才盘点校准会议视图。
 *
 * <p>对应 {@code HrTalentCalibrationSession} entity 对外暴露字段。
 * {@code participants} 由 JacksonTypeHandler 自动从 JSON 列反序列化。
 */
@Data
@Schema(name = "HrTalentCalibrationSessionVO", description = "人才盘点校准会议视图")
public class HrTalentCalibrationSessionVO {

    @Schema(description = "会议主键")
    private Long id;

    @Schema(description = "所属盘点 ID")
    private Long reviewId;

    @Schema(description = "会议编号")
    private String sessionNo;

    @Schema(description = "会议名称")
    private String sessionName;

    @Schema(description = "会议时间")
    private LocalDateTime scheduledAt;

    @Schema(description = "会议地点")
    private String location;

    @Schema(description = "主持人员工 ID")
    private Long facilitatorId;

    @Schema(description = "参与人员工 ID 列表")
    private List<Long> participants;

    @Schema(description = "会议议程")
    private String agenda;

    @Schema(description = "会议纪要")
    private String minutes;

    @Schema(description = "会议状态：PLANNED/IN_PROGRESS/CLOSED")
    private String status;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    private LocalDateTime updateTime;
}
