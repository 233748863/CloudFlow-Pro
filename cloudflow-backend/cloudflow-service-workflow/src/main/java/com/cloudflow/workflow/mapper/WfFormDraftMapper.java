package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.cloudflow.workflow.domain.WfFormDraft;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface WfFormDraftMapper extends BaseMapper<WfFormDraft> {
    WfProcessDefinition findDefinition(@Param("tenantId") Long tenantId, @Param("definitionId") String definitionId);
    @InterceptorIgnore(tenantLine = "true")
    List<WfProcessDefinition> lockDefinitions(@Param("tenantId") Long tenantId, @Param("processKey") String processKey);
    WfFormDefinition lockForm(@Param("tenantId") Long tenantId, @Param("formId") String formId);
    @InterceptorIgnore(tenantLine = "true")
    List<WfFormFieldPermission> lockStartPermissions(@Param("tenantId") Long tenantId, @Param("definitionId") String definitionId);
    WfFormDraft findOwned(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("draftId") String draftId);
    WfFormDraft lockOwned(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("draftId") String draftId);
    WfFormDraft findByDefinition(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("definitionId") String definitionId);
    int updateOwned(@Param("draft") WfFormDraft draft, @Param("expectedVersion") int expectedVersion);
    int deleteOwned(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("draftId") String draftId,
                    @Param("expectedVersion") int expectedVersion);
    WfProcessInstance findSubmitted(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                    @Param("businessKey") String businessKey);
    List<WfFormDraft> findExpired(@Param("tenantId") Long tenantId, @Param("cutoff") LocalDateTime cutoff);
    int deleteExpired(@Param("tenantId") Long tenantId, @Param("draftId") String draftId,
                      @Param("expectedVersion") int expectedVersion, @Param("cutoff") LocalDateTime cutoff);
}
