package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR Offer VO（剔除 deleted/tenantId 与加密原文 salaryText，
 * salary 由 maskRow 按权限脱敏后输出）。
 */
@Data
@Schema(name = "HrOfferVO", description = "HR Offer VO")
public class HrOfferVO {
    @Schema(description = "Offer ID") private Long id;
    @Schema(description = "Offer 编号") private String offerNo;
    @Schema(description = "候选人 ID") private Long candidateId;
    @Schema(description = "岗位 ID") private Long positionId;
    @Schema(description = "薪资（按 hr:comp:view 权限脱敏）") private Object salary;
    @Schema(description = "预计到岗日期") private LocalDate expectedArrivalDate;
    @Schema(description = "Offer 过期日期") private LocalDate expireDate;
    @Schema(description = "Offer 内容") private String offerContent;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
