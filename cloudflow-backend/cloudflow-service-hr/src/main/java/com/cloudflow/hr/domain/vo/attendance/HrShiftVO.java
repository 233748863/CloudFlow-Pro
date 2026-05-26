package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * HR 班次 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrShiftVO", description = "HR 班次 VO")
public class HrShiftVO {
    @Schema(description = "班次 ID") private Long id;
    @Schema(description = "班次编码") private String shiftCode;
    @Schema(description = "班次名称") private String shiftName;
    @Schema(description = "开始时间") private LocalTime startTime;
    @Schema(description = "结束时间") private LocalTime endTime;
    @Schema(description = "休息分钟数") private Integer breakMinutes;
    @Schema(description = "工时分钟数") private Integer workMinutes;
    @Schema(description = "标识色") private String color;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
