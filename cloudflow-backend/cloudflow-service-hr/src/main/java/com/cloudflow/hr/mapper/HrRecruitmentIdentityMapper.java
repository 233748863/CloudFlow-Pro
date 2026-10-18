package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Param;

public interface HrRecruitmentIdentityMapper {
    int occupy(@Param("tenantId") Long tenantId, @Param("type") String type, @Param("hash") String hash,
            @Param("referralId") Long referralId, @Param("candidateId") Long candidateId, @Param("operator") String operator);
    Owner lockOwner(@Param("tenantId") Long tenantId, @Param("type") String type, @Param("hash") String hash);
    int attachCandidate(@Param("tenantId") Long tenantId, @Param("referralId") Long referralId,
            @Param("candidateId") Long candidateId, @Param("operator") String operator);
    Long candidateDepartment(@Param("tenantId") Long tenantId, @Param("candidateId") Long candidateId);

    record Owner(Long referralId, Long candidateId) { }
}
