package com.cloudflow.hr.domain.vo.ess;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * HR 员工自助门户聚合 VO（首页一次拉齐：员工基本信息 / 假期余额 / 最新工资条 / 待签合同 / 证明进度 / 未读消息）。
 */
@Data
@Schema(name = "HrEssPortalSummaryVO", description = "HR 员工自助门户聚合 VO")
public class HrEssPortalSummaryVO {
    @Schema(description = "员工块（id/employeeNo/name/employeeStatus/hireDate/deptId/deptName/positionId/positionName）") private Map<String, Object> employee;
    @Schema(description = "假期余额（多行：leaveTypeId/leaveCode/leaveName/unit/totalQuota/usedQuota/frozenQuota/availableQuota/expiryDate）") private List<Map<String, Object>> leaveBalances;
    @Schema(description = "最近一份工资条（按权限脱敏）") private Map<String, Object> latestSlip;
    @Schema(description = "待签合同（多行：contractId/contractNo/contractType/startDate/endDate/signStatus/signatureId/signMethod/signProcessInstanceId/expireTime）") private List<Map<String, Object>> pendingContracts;
    @Schema(description = "最近证明进度（多行：requestNo/certificateType/status/issuedAt 等）") private List<Map<String, Object>> recentCertificates;
    @Schema(description = "未读消息预览") private List<Map<String, Object>> unreadMessages;
    @Schema(description = "未读消息总数") private Long unreadCount;
}
