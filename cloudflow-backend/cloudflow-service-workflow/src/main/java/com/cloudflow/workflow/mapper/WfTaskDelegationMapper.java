package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WfTaskDelegationMapper extends BaseMapper<WfTaskDelegation> {
    WfTaskDelegation selectForUpdate(@Param("tenantId") Long tenantId, @Param("delegationId") String delegationId);
}
