package com.cloudflow.auth.mapper;

import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.domain.SysJobLog;
import com.cloudflow.auth.im.ImConfigRow;
import com.cloudflow.auth.im.ImBindingRow;
import com.cloudflow.auth.im.ImLoginAccounts;
import com.cloudflow.auth.im.ImLoginRequests;
import com.cloudflow.auth.im.ImLocalOrganization;
import com.cloudflow.auth.im.ImSyncRunRow;
import com.cloudflow.auth.im.ImViews;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ImMapper {
    List<ImBindingRow> managedBindings(@Param("tenantId") long tenantId, @Param("offset") long offset, @Param("limit") int limit);
    long countManagedBindings(@Param("tenantId") long tenantId);
    ImBindingRow managedBinding(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId);
    int changeManagedBinding(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId,
            @Param("version") int version, @Param("beforeStatus") String beforeStatus, @Param("afterStatus") String afterStatus,
            @Param("operator") String operator);
    List<ImBindingRow> ownBindings(@Param("tenantId") long tenantId, @Param("userId") long userId);
    List<ImBindingRow> bindingConflicts(@Param("tenantId") long tenantId, @Param("configId") long configId,
            @Param("userId") long userId, @Param("externalUserId") String externalUserId);
    int insertBinding(ImBindingRow row);
    int removeOwnBinding(@Param("tenantId") long tenantId, @Param("userId") long userId,
            @Param("mappingId") long mappingId, @Param("version") int version);
    List<Long> loginTenants(@Param("tenantCode") String tenantCode);
    List<ImConfigRow> loginConfigurations(@Param("tenantId") long tenantId);
    List<ImLoginAccounts.Binding> loginBindings(@Param("tenantId") long tenantId, @Param("configId") long configId,
            @Param("externalUserId") String externalUserId);
    SysUser loginUser(@Param("tenantId") long tenantId, @Param("userId") long userId);
    SysTenant lockLoginTenant(@Param("tenantId") long tenantId);
    Long lockLoginBinding(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId);
    List<Long> lockLoginTotp(@Param("tenantId") long tenantId, @Param("userId") long userId);
    List<Long> lockLoginMenus(@Param("menuIds") java.util.Set<Long> menuIds);
    List<ImLoginRequests.IpRule> loginIpRules();
    SysUser user(@Param("tenantId") long tenantId, @Param("userId") long userId);
    SysUser lockUser(@Param("tenantId") long tenantId, @Param("userId") long userId);
    SysTenant tenant(@Param("tenantId") long tenantId);
    List<String> permissions(@Param("tenantId") long tenantId, @Param("userId") long userId);
    int administrator(@Param("tenantId") long tenantId, @Param("userId") long userId);
    ImConfigRow config(@Param("tenantId") long tenantId, @Param("configId") long configId);
    ImConfigRow lockConfig(@Param("tenantId") long tenantId, @Param("configId") long configId);
    List<ImConfigRow> configurations(@Param("tenantId") long tenantId, @Param("offset") long offset, @Param("limit") int limit);
    long countConfigurations(@Param("tenantId") long tenantId);
    int insertConfig(ImConfigRow row);
    int updateConfig(ImConfigRow row);
    int countProvider(@Param("tenantId") long tenantId, @Param("imType") String imType);
    long references(@Param("tenantId") long tenantId, @Param("configId") long configId);
    SysDept department(@Param("tenantId") long tenantId, @Param("deptId") long deptId);
    List<ImViews.DepartmentOption> scopeDepartments(@Param("tenantId") long tenantId, @Param("keyword") String keyword,
            @Param("offset") long offset, @Param("limit") int limit);
    long countScopeDepartments(@Param("tenantId") long tenantId, @Param("keyword") String keyword);
    List<ImLocalOrganization.Department> organizationDepartments(@Param("tenantId") long tenantId, @Param("limit") int limit);
    List<ImLocalOrganization.User> organizationUsers(@Param("tenantId") long tenantId, @Param("limit") int limit);
    List<ImLocalOrganization.DepartmentMapping> organizationDepartmentMappings(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("limit") int limit);
    List<ImLocalOrganization.UserMapping> organizationUserMappings(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("limit") int limit);
    List<Long> protectedOrganizationUsers(@Param("tenantId") long tenantId);
    int insertSyncRun(ImSyncRunRow row);
    ImSyncRunRow syncRun(@Param("tenantId") long tenantId, @Param("syncRunId") long syncRunId);
    List<ImSyncRunRow> syncRuns(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("offset") long offset, @Param("limit") int limit);
    long countSyncRuns(@Param("tenantId") long tenantId, @Param("configId") long configId);
    List<SysJob> scheduledJobs(@Param("tenantId") long tenantId);
    int insertScheduledJob(SysJob row);
    int updateScheduledJob(SysJob row);
    SysJob scheduledJob(@Param("tenantId") long tenantId, @Param("jobId") long jobId);
    SysJobLog scheduledLog(@Param("tenantId") long tenantId, @Param("jobId") long jobId, @Param("executeNo") String executeNo);
    SysJobLog lockScheduledLog(@Param("tenantId") long tenantId, @Param("jobId") long jobId, @Param("executeNo") String executeNo);
    int linkScheduledRun(@Param("tenantId") long tenantId, @Param("jobId") long jobId, @Param("executeNo") String executeNo, @Param("reference") String reference);
    int runningSynchronizations(@Param("tenantId") long tenantId);
    int markSynchronized(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("version") int version, @Param("completedAt") java.time.LocalDateTime completedAt);
}
