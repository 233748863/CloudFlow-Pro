package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.service.HrAdvanceDraftRules;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface HrEmployeeAdvanceMapper extends BaseMapper<HrEmployeeAdvance> {
    Long lockEmployee(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    HrEmployeeAdvance lockAdvance(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId);
    SalarySource lockSalary(@Param("tenantId") Long tenantId, @Param("salarySlipId") Long salarySlipId);
    List<HrSalarySlip> pendingCorrectionSlips(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    Page<HrEmployeeAdvance> pageAdvances(Page<HrEmployeeAdvance> page, @Param("tenantId") Long tenantId,
            @Param("query") HrAdvanceRequests.Query query, @Param("scope") EmployeeScope scope);
    int updateDraft(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId,
            @Param("plan") HrAdvanceDraftRules.Plan plan, @Param("version") Integer version, @Param("operator") String operator);
    int bindProof(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId,
            @Param("fileId") Long fileId, @Param("fileHash") String fileHash, @Param("owner") String owner);
    ProofFile lockProof(@Param("tenantId") Long tenantId, @Param("advanceId") Long advanceId, @Param("fileId") Long fileId);
    HrAdvanceRepayment proofRepayment(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);

    record SalarySource(Long salarySlipId, Long employeeId, String periodMonth, String status, Long reservedSettlementId) { }
    record EmployeeScope(int type, Long userId, Long deptId, List<Long> deptIds) { }
    record ProofFile(Long fileId, String fileName, String fileHash, Long fileSize) { }
}
