package com.cloudflow.workflow.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface WorkflowFormFileMapper {
    Map<String, Object> findFile(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);

    int bindFiles(@Param("tenantId") Long tenantId, @Param("definitionId") String definitionId,
                  @Param("instanceId") String instanceId, @Param("userName") String userName,
                  @Param("fieldPath") String fieldPath, @Param("fileIds") List<Long> fileIds);
}
