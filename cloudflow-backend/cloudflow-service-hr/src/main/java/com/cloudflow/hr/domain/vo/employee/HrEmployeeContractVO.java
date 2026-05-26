package com.cloudflow.hr.domain.vo.employee;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 员工合同 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrEmployeeContractVO", description = "HR 员工合同 VO")
public class HrEmployeeContractVO {

    @Schema(description = "合同 ID")
    private Long id;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "合同类型")
    private String contractType;

    @Schema(description = "合同编号")
    private String contractNo;

    @Schema(description = "签订日期")
    private LocalDate signDate;

    @Schema(description = "起始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;

    @Schema(description = "合同状态")
    private String status;

    @Schema(description = "签署状态")
    private String signStatus;

    @Schema(description = "签署时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime signedAt;

    @Schema(description = "附件 URL 列表")
    private List<String> attachmentUrls;

    @Schema(description = "创建人")
    private String createBy;

    @Schema(description = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Schema(description = "更新人")
    private String updateBy;

    @Schema(description = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
