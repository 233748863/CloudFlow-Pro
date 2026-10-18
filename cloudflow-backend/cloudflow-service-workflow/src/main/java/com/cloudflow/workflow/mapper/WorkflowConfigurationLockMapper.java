package com.cloudflow.workflow.mapper;

import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface WorkflowConfigurationLockMapper {
    String findProcessKey(@Param("tenantId") Long tenantId, @Param("definitionId") String definitionId);

    List<String> findFormProcessKeys(@Param("tenantId") Long tenantId, @Param("formId") String formId);

    @InterceptorIgnore(tenantLine = "true")
    List<WfProcessDefinition> lockDefinitions(@Param("tenantId") Long tenantId, @Param("processKey") String processKey);

    WfFormDefinition lockForm(@Param("tenantId") Long tenantId, @Param("formId") String formId);

    @InterceptorIgnore(tenantLine = "true")
    List<WfFormFieldPermission> lockStartPermissions(@Param("tenantId") Long tenantId,
                                                   @Param("definitionId") String definitionId);

    long countDefinitionInstances(@Param("tenantId") Long tenantId, @Param("definitionId") String definitionId,
                                  @Param("statuses") List<String> statuses);

    long countProcessInstances(@Param("tenantId") Long tenantId, @Param("processKey") String processKey,
                               @Param("statuses") List<String> statuses);
}
