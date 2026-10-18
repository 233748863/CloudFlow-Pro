package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmActivity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.dto.CrmActivityQuery;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CrmActivityMapper extends BaseMapper<CrmActivity> {
    Page<CrmActivity> selectPageByDataScope(Page<CrmActivity> page, @Param("query") CrmActivityQuery query,
            @Param("userId") Long userId, @Param("dataScope") DataScope dataScope, @Param("now") LocalDateTime now);
    CrmActivity selectAccessible(@Param("id") Long id, @Param("userId") Long userId,
            @Param("dataScope") DataScope dataScope);
    List<CrmActivity> selectConflictingAccessible(@Param("activity") CrmActivity activity,
            @Param("userIds") List<Long> userIds, @Param("userId") Long userId, @Param("dataScope") DataScope dataScope);
    List<CrmActivity> selectConflictingPeriods(@Param("activity") CrmActivity activity,
            @Param("userIds") List<Long> userIds);
    CrmActivity lockById(@Param("id") Long id);
    List<Long> selectPendingReminderActivities(@Param("now") LocalDateTime now);
    int activeParticipantCount(@Param("tenantId") Long tenantId, @Param("userIds") List<Long> userIds);
    List<com.cloudflow.common.core.domain.ParticipantBusy> participantBusy(@Param("tenantId") Long tenantId,
            @Param("userIds") List<Long> userIds, @Param("viewerId") Long viewerId,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
