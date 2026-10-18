package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaContractTemplateTerm;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface OaContractTemplateTermMapper extends BaseMapper<OaContractTemplateTerm> {
    OaContractTemplateTerm selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<OaContractTemplateTerm> selectByTemplateIncludingDeleted(@Param("templateId") Long templateId,
            @Param("tenantId") Long tenantId);
    int updateDeletionState(@Param("record") OaContractTemplateTerm record,
            @Param("expectedDeleted") int expectedDeleted, @Param("deleted") int deleted);
}
