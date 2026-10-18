package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CrmActivityParticipantMapper extends BaseMapper<CrmActivityParticipant> {
    List<CrmActivityParticipant> lockActiveByActivity(@Param("activityId") Long activityId);
    int deactivateByActivity(@Param("activityId") Long activityId);
    int upsertParticipant(@Param("participant") CrmActivityParticipant participant);
}
