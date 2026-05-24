package com.cloudflow.hr.domain.dto.dispute;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 劳动争议分页查询入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrLaborDisputeQueryDTO", description = "劳动争议分页查询入参")
public class HrLaborDisputeQueryDTO extends PageQuery {

    @Schema(description = "争议编号")
    private String disputeNo;

    @Schema(description = "申请人员工 ID")
    private Long applicantEmployeeId;

    @Schema(description = "争议类型 SALARY/CONTRACT/INJURY/DISMISSAL/OTHER")
    private String disputeType;

    @Schema(description = "状态 DRAFT/SUBMITTED/MEDIATING/ARBITRATING/CLOSED")
    private String status;

    @Schema(description = "立案起始日期")
    private LocalDate openedFrom;

    @Schema(description = "立案截止日期")
    private LocalDate openedTo;

    @Schema(description = "关键字 模糊匹配 申请人姓名/外部当事人")
    private String keyword;
}
