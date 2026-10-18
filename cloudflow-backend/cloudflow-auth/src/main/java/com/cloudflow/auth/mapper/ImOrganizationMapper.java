package com.cloudflow.auth.mapper;

import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.im.ImLocalOrganization;
import com.cloudflow.auth.im.ImOrgSnapshot;
import com.cloudflow.auth.im.ImSyncRunRow;
import com.cloudflow.auth.im.ImSyncRunner;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ImOrganizationMapper {
    Long lockTenant(@Param("tenantId") long tenantId);
    Long lockRecoveryTenant(@Param("tenantId") long tenantId);
    ImSyncRunRow lockRun(@Param("tenantId") long tenantId, @Param("runId") long runId);
    int otherRunning(@Param("tenantId") long tenantId, @Param("runId") long runId);
    List<ImSyncRunner.Target> recoveryTargets(@Param("afterId") long afterId, @Param("limit") int limit);
    int checkpoint(@Param("row") ImSyncRunRow row, @Param("mode") String mode, @Param("cursor") String cursor);
    int insertDepartment(@Param("row") SysDept row, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updateDepartment(@Param("row") SysDept row, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updateAncestors(@Param("tenantId") long tenantId, @Param("id") long id, @Param("version") int version,
            @Param("ancestors") String ancestors, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int insertDepartmentMapping(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("deptId") long deptId,
            @Param("source") ImOrgSnapshot.Department source, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updateDepartmentMapping(@Param("mapping") ImLocalOrganization.DepartmentMapping mapping,
            @Param("source") ImOrgSnapshot.Department source, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int insertUser(@Param("row") SysUser row, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updateUser(@Param("row") SysUser row, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int advanceUserRevisions(@Param("tenantId") long tenantId);
    int insertUserMapping(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("userId") long userId,
            @Param("source") ImOrgSnapshot.Member source, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int updateUserMapping(@Param("mapping") ImLocalOrganization.UserMapping mapping,
            @Param("source") ImOrgSnapshot.Member source, @Param("actor") String actor, @Param("now") LocalDateTime now);
    int releaseUserMapping(@Param("mapping") ImLocalOrganization.UserMapping mapping, @Param("actor") String actor, @Param("now") LocalDateTime now);
}
