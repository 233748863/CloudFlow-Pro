package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 考勤规则 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrAttendanceRuleVO", description = "HR 考勤规则 VO")
public class HrAttendanceRuleVO {
    @Schema(description = "规则 ID") private Long id;
    @Schema(description = "规则编码") private String ruleCode;
    @Schema(description = "规则名称") private String ruleName;
    @Schema(description = "规则类型") private String ruleType;
    @Schema(description = "班次 ID") private Long shiftId;
    @Schema(description = "状态") private Integer status;
    @Schema(description = "工作日（数字 1-7）") private List<Integer> workDays;
    @Schema(description = "打卡方式") private List<String> checkMethods;
    @Schema(description = "高级配置 JSON") private JsonNode configJson;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
