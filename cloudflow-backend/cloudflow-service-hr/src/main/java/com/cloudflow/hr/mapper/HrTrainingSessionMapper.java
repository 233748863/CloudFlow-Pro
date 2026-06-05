package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import org.apache.ibatis.annotations.Param;

public interface HrTrainingSessionMapper extends BaseMapper<HrTrainingSession> {

    /**
     * 报名审批通过时累加班次的实报名数。容量校验在报名入口已完成，回调阶段仅做无条件 +1。
     */
    int incrementEnrolledCount(@Param("sessionId") Long sessionId, @Param("tenantId") Long tenantId);
}
