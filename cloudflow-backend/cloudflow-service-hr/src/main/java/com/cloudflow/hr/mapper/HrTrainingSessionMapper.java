package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface HrTrainingSessionMapper extends BaseMapper<HrTrainingSession> {

    /**
     * 报名审批通过时累加班次的实报名数。容量校验在报名入口已完成，回调阶段仅做无条件 +1。
     */
    @Update("UPDATE hr_training_session SET enrolled_count = COALESCE(enrolled_count, 0) + 1, "
            + "update_time = NOW() WHERE id = #{sessionId} AND tenant_id = #{tenantId} AND deleted = 0")
    int incrementEnrolledCount(@Param("sessionId") Long sessionId, @Param("tenantId") Long tenantId);
}
