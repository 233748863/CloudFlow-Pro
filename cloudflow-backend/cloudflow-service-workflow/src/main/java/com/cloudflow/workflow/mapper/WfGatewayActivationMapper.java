package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfGatewayActivation;
import com.cloudflow.workflow.domain.vo.WorkflowGatewayTrace;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WfGatewayActivationMapper extends BaseMapper<WfGatewayActivation> {
    List<WorkflowGatewayTrace> selectTrace(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId);
    WfGatewayActivation selectForUpdate(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId,
                                        @Param("activationId") String activationId);
    int markReleased(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId,
                     @Param("activationId") String activationId, @Param("version") Integer version);
    int markCancelled(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId);
    int deleteArchived(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId);
}
