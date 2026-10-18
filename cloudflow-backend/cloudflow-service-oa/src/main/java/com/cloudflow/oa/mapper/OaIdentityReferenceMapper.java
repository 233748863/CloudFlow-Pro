package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.vo.OaIdentityReference;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaIdentityReferenceMapper {
    boolean mayInviteRfq(@Param("actorId") Long actorId, @Param("ownerId") Long ownerId, @Param("tenantId") Long tenantId);
    OaIdentityReference user(@Param("id") Long id, @Param("tenantId") Long tenantId);
    OaIdentityReference userForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
    java.util.List<OaIdentityReference> employeesForUser(@Param("userId") Long userId, @Param("tenantId") Long tenantId);
    OaIdentityReference employee(@Param("id") Long id, @Param("tenantId") Long tenantId);
    OaIdentityReference employeeRecord(@Param("id") Long id, @Param("tenantId") Long tenantId);
    long employeeLinkCount(@Param("userId") Long userId, @Param("tenantId") Long tenantId);
    OaIdentityReference jobLevel(@Param("id") Long id, @Param("tenantId") Long tenantId);
    java.util.List<OaIdentityReference> employees(@Param("tenantId") Long tenantId);
    java.util.List<OaIdentityReference> jobLevels(@Param("tenantId") Long tenantId);
    OaIdentityReference department(@Param("id") Long id, @Param("tenantId") Long tenantId);
    java.util.List<OaIdentityReference> leaderCandidates(@Param("value") String value, @Param("tenantId") Long tenantId);
}
