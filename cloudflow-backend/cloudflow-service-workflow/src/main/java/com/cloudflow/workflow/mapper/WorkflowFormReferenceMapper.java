package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface WorkflowFormReferenceMapper {
    List<String> findDictionaryValues(@Param("tenantId") Long tenantId, @Param("dictType") String dictType);

    Map<String, Object> findOwnedFormFile(@Param("tenantId") Long tenantId, @Param("userName") String userName,
                                        @Param("fileId") Long fileId, @Param("definitionId") String definitionId,
                                        @Param("instanceId") String instanceId, @Param("fieldPath") String fieldPath);

    Map<String, Object> findReference(@Param("tenantId") Long tenantId, @Param("type") String type,
                                    @Param("referenceId") Long referenceId, @Param("onlyActive") boolean onlyActive);

    Page<WorkflowFormReferenceVO> pageReferences(Page<WorkflowFormReferenceVO> page,
                                               @Param("tenantId") Long tenantId, @Param("type") String type,
                                               @Param("onlyActive") boolean onlyActive,
                                               @Param("scopeDeptId") Long scopeDeptId, @Param("dictType") String dictType);
}
