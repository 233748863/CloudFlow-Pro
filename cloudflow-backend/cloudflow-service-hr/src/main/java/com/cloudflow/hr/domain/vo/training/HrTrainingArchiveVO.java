package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 培训档案聚合 VO（员工视角的培训总览：学时/完成/在读/证书 + 报名与证书明细行）。
 */
@Data
@Schema(name = "HrTrainingArchiveVO", description = "HR 培训档案聚合 VO")
public class HrTrainingArchiveVO {
    @Schema(description = "员工轻量信息（id/employeeNo/name/deptId/positionId）") private Map<String, Object> employee;
    @Schema(description = "累计学时") private BigDecimal totalCreditHours;
    @Schema(description = "已完成培训数") private Integer completedCount;
    @Schema(description = "进行中培训数") private Integer ongoingCount;
    @Schema(description = "有效证书数") private Integer certificateCount;
    @Schema(description = "报名明细行") private List<Map<String, Object>> enrollments;
    @Schema(description = "证书明细行") private List<Map<String, Object>> certificates;
    @Schema(description = "最近一次培训日期") private LocalDate lastTrainingDate;
    @Schema(description = "年度学时（按年聚合）") private Object yearHours;
    @Schema(description = "年度学时（按年聚合 Map 形态）") private Map<String, Object> yearHoursMap;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "档案缓存刷新时间") private LocalDateTime refreshedAt;
}
