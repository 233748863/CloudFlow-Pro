package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 招聘需求 VO（剔除 deleted/tenantId 与加密原文 salary_min_text/salary_max_text，
 * salaryMin/salaryMax 由 maskRow 按权限脱敏后输出）。
 */
@Data
@Schema(name = "HrRecruitmentRequisitionVO", description = "HR 招聘需求 VO")
public class HrRecruitmentRequisitionVO {
    @Schema(description = "需求 ID") private Long id;
    @Schema(description = "需求编号") private String requisitionNo;
    @Schema(description = "需求标题") private String title;
    @Schema(description = "兼容前端招聘需求编号") private String requestNo;
    @Schema(description = "部门 ID") private Long deptId;
    @Schema(description = "部门名称") private String deptName;
    @Schema(description = "岗位 ID") private Long positionId;
    @Schema(description = "岗位名称") private String positionName;
    @Schema(description = "岗位编码") private String positionCode;
    @Schema(description = "职务 ID") private Long postId;
    @Schema(description = "招聘人数") private Integer headcount;
    @Schema(description = "已招聘人数") private Integer hiredCount;
    @Schema(description = "薪资下限（按 hr:comp:view 权限脱敏）") private Object salaryMin;
    @Schema(description = "薪资上限（按 hr:comp:view 权限脱敏）") private Object salaryMax;
    @Schema(description = "预计到岗日期") private LocalDate expectedArrivalDate;
    @Schema(description = "兼容前端预计到岗日期") private LocalDate expectedDate;
    @Schema(description = "招聘原因") private String reason;
    @Schema(description = "岗位要求") private String requirements;
    @Schema(description = "兼容前端岗位要求") private String jobRequirements;
    @Schema(description = "状态") private String status;
    @Schema(description = "状态描述") private String statusDesc;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
