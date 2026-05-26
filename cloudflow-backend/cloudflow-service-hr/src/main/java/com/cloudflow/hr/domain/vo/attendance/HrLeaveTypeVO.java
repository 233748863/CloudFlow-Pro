package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 假期类型 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrLeaveTypeVO", description = "HR 假期类型 VO")
public class HrLeaveTypeVO {
    @Schema(description = "假期类型 ID") private Long id;
    @Schema(description = "假期编码") private String leaveCode;
    @Schema(description = "假期名称") private String leaveName;
    @Schema(description = "是否需要额度 0/1") private Integer needQuota;
    @Schema(description = "是否带薪 0/1") private Integer isPaid;
    @Schema(description = "单位 DAY/HOUR") private String unit;
    @Schema(description = "状态") private Integer status;
    @Schema(description = "额度规则 JSON") private JsonNode quotaRule;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
