package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
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
    @Schema(description = "年度数量上限") private BigDecimal maxDaysPerYear;
    @Schema(description = "入职满多少天可用") private Integer applicableAfterDays;
    @Schema(description = "单次连续数量上限") private BigDecimal maxContinuousDays;
    @Schema(description = "是否允许结转") private Integer carryForwardFlag;
    @Schema(description = "结转数量上限") private BigDecimal maxCarryForwardDays;
    @Schema(description = "结转过期天数") private Integer carryForwardExpireDays;
    @Schema(description = "是否按周期累积") private Integer earnedLeaveFlag;
    @Schema(description = "累积频率") private String earnedLeaveFrequency;
    @Schema(description = "舍入方式") private String roundingMode;
    @Schema(description = "是否允许折现") private Integer encashmentFlag;
    @Schema(description = "折现薪酬项ID") private Long encashmentComponentId;
    @Schema(description = "是否无薪假") private Integer lwpFlag;
    @Schema(description = "是否部分带薪") private Integer partialPaidFlag;
    @Schema(description = "部分带薪比例") private BigDecimal salaryFractionPerDay;
    @Schema(description = "是否调休假") private Integer compensatoryFlag;
    @Schema(description = "是否可选节假日") private Integer optionalLeaveFlag;
    @Schema(description = "是否包含节假日") private Integer includeHolidayFlag;
    @Schema(description = "是否允许负余额") private Integer allowNegativeFlag;
    @Schema(description = "是否允许超额分配") private Integer allowOverAllocationFlag;
    @Schema(description = "是否必须附件") private Integer needAttachmentFlag;
    @Schema(description = "状态") private Integer status;
    @Schema(description = "额度规则 JSON") private JsonNode quotaRule;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
