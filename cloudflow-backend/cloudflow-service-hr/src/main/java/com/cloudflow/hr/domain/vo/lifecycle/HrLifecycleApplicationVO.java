package com.cloudflow.hr.domain.vo.lifecycle;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 生命周期申请 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrLifecycleApplicationVO", description = "HR 生命周期申请 VO")
public class HrLifecycleApplicationVO {
    @Schema(description = "申请 ID") private Long id;
    @Schema(description = "申请编号") private String applicationNo;
    @Schema(description = "申请类型") private String type;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "候选人 ID") private Long candidateId;
    @Schema(description = "姓名") private String name;
    @Schema(description = "部门 ID") private Long deptId;
    @Schema(description = "岗位 ID") private Long postId;
    @Schema(description = "职位 ID") private Long positionId;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "备注") private String remark;
    @Schema(description = "申请明细 JSON") private JsonNode detailJson;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
