package com.cloudflow.hr.domain.vo.dispute;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 劳动争议 VO（剔除 deleted/tenantId/version；applicantExternalPhone 由 maskRow 按权限掩码或解密后返回）。
 */
@Data
@Schema(name = "HrLaborDisputeVO", description = "HR 劳动争议 VO")
public class HrLaborDisputeVO {
    @Schema(description = "争议 ID") private Long id;
    @Schema(description = "争议单号") private String disputeNo;
    @Schema(description = "申请人员工 ID") private Long applicantEmployeeId;
    @Schema(description = "申请人外部姓名") private String applicantExternalName;
    @Schema(description = "申请人外部联系电话（掩码/解密由权限决定）") private Object applicantExternalPhone;
    @Schema(description = "争议类型") private String disputeType;
    @Schema(description = "诉求金额") private BigDecimal claimAmount;
    @Schema(description = "诉求说明") private String claimDescription;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "立案日期") private LocalDate openedAt;
    @Schema(description = "结案日期") private LocalDate closedAt;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
