package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfFormDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.util.List;

/**
 * 表单定义 Mapper 接口
 */
@Mapper
public interface WfFormDefinitionMapper extends BaseMapper<WfFormDefinition> {
    WfFormDefinition selectLatest(@Param("tenantId") Long tenantId, @Param("formId") String formId);
    WfFormDefinition lockLatest(@Param("tenantId") Long tenantId, @Param("formId") String formId);
    List<WfFormDefinition> resolveIdentifier(@Param("tenantId") Long tenantId, @Param("identifier") String identifier);
    WfFormDefinition selectVersion(@Param("tenantId") Long tenantId, @Param("formId") String formId, @Param("version") Integer version);
    Page<WfFormDefinition> selectVersions(Page<WfFormDefinition> page, @Param("tenantId") Long tenantId, @Param("formId") String formId);
    int updateVersionLockOnly(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("expectedLock") Integer expectedLock,
                              @Param("formName") String formName, @Param("formKey") String formKey, @Param("checksum") String checksum);
    int markNotLatest(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("expectedLock") Integer expectedLock);
    List<String> latestFormIds(@Param("tenantId") Long tenantId);
    List<WfFormDefinition> cleanupCandidates(@Param("tenantId") Long tenantId, @Param("formId") String formId, @Param("keepFrom") Integer keepFrom);
    int deleteUnusedVersion(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("formId") String formId, @Param("version") Integer version);
}
