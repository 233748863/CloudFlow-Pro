package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 人才盘点校准会议创建/更新入参。
 *
 * <p>剔除系统字段（id/tenantId/reviewId/deleted/createTime/updateTime/createBy/updateBy）。
 * reviewId 由 path 参数传入，sessionNo 不传由后端按 CAL-{reviewId}-{时间戳} 生成。
 * participants 为参与人员工 ID 列表（JacksonTypeHandler 序列化为 JSON 列）。
 */
@Data
@Schema(name = "HrTalentCalibrationSessionDTO", description = "人才盘点校准会议入参")
public class HrTalentCalibrationSessionDTO {

    @Schema(description = "会议编号；不传由后端生成")
    @Size(max = 64)
    private String sessionNo;

    @Schema(description = "会议名称")
    @NotBlank(message = "会议名称不能为空")
    @Size(max = 128)
    private String sessionName;

    @Schema(description = "会议时间")
    private LocalDateTime scheduledAt;

    @Schema(description = "会议地点")
    @Size(max = 128)
    private String location;

    @Schema(description = "主持人员工 ID")
    private Long facilitatorId;

    @Schema(description = "参与人员工 ID 列表")
    private List<Long> participants;

    @Schema(description = "会议议程")
    @Size(max = 2048)
    private String agenda;

    @Schema(description = "会议纪要")
    @Size(max = 4096)
    private String minutes;

    @Schema(description = "会议状态：PLANNED / IN_PROGRESS / CLOSED；不传默认 PLANNED")
    @Size(max = 32)
    private String status;
}
