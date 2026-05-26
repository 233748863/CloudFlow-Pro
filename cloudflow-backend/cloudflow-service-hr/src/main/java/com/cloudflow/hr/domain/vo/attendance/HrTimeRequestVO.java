package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 假勤申请 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrTimeRequestVO", description = "HR 假勤申请 VO")
public class HrTimeRequestVO {
    @Schema(description = "申请 ID") private Long id;
    @Schema(description = "申请单号") private String requestNo;
    @Schema(description = "申请类型") private String requestType;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "假期类型 ID") private Long leaveTypeId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime startTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime endTime;
    @Schema(description = "时长") private BigDecimal duration;
    @Schema(description = "单位 DAY/HOUR") private String unit;
    @Schema(description = "原因") private String reason;
    @Schema(description = "状态") private String status;
    @Schema(description = "流程实例 ID") private String processInstanceId;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
