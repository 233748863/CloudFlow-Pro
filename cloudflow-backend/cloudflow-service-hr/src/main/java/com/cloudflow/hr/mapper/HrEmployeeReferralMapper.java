package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.HrReferralRequests;
import com.cloudflow.hr.domain.entity.HrEmployeeReferral;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface HrEmployeeReferralMapper extends BaseMapper<HrEmployeeReferral> {
    HrEmployeeReferral lockReferral(@Param("tenantId") Long tenantId, @Param("referralId") Long referralId);
    HrEmployeeReferral lockByCandidate(@Param("tenantId") Long tenantId, @Param("candidateId") Long candidateId);
    List<Long> pendingEmployment(@Param("tenantId") Long tenantId, @Param("afterId") Long afterId, @Param("limit") int limit);
    int incrementHired(@Param("tenantId") Long tenantId, @Param("requisitionId") Long requisitionId);
    Long lockReferrer(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    long salaryCount(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("periodId") Long periodId);
    long pendingBonus(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("periodId") Long periodId);
    Page<HrEmployeeReferral> pageReferrals(Page<HrEmployeeReferral> page, @Param("tenantId") Long tenantId,
            @Param("query") HrReferralRequests.Query query, @Param("employeeId") Long employeeId, @Param("scope") Scope scope);
    int bindResume(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId,
            @Param("referralId") Long referralId, @Param("hash") String hash);
    ResumeFile lockResume(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);
    Long activePosition(@Param("tenantId") Long tenantId, @Param("positionId") Long positionId);
    Page<Option> positionOptions(Page<Option> page, @Param("tenantId") Long tenantId, @Param("query") HrReferralRequests.Query query);
    Page<Option> requisitionOptions(Page<Option> page, @Param("tenantId") Long tenantId, @Param("positionId") Long positionId,
            @Param("query") HrReferralRequests.Query query, @Param("scope") Scope scope);
    Page<Option> bonusOptions(Page<Option> page, @Param("tenantId") Long tenantId, @Param("query") HrReferralRequests.Query query,
            @Param("components") boolean components);
    record Option(Long value, String label) { }
    record Scope(int type, Long departmentId, List<Long> departmentIds) { }
    record ResumeFile(Long fileId, String fileName, Long fileSize, String fileHash, String businessId) { }
}
