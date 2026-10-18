package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfAgentSetting;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import com.cloudflow.workflow.domain.WfTaskHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface WfAgentSettingMapper extends BaseMapper<WfAgentSetting> {
    Long lockPrincipal(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<WfAgentSetting> selectPrincipalForUpdate(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<WfTask> selectPrincipalTasksForUpdate(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    WfAgentSetting selectCurrentSetting(@Param("tenantId") Long tenantId, @Param("settingId") String settingId);
    WfTaskDelegation selectCurrentRelation(@Param("tenantId") Long tenantId, @Param("taskId") String taskId,
                                           @Param("settingId") String settingId);
    Long selectCurrentActiveUser(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<WfTaskHistory> selectCurrentReturns(@Param("tenantId") Long tenantId, @Param("taskId") String taskId);
    List<Long> selectRefreshPrincipals(@Param("tenantId") Long tenantId, @Param("afterUserId") Long afterUserId,
                                       @Param("limit") int limit);
}
