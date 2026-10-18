package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaContractFulfilmentTerm;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaContractFulfilmentTermMapper extends BaseMapper<OaContractFulfilmentTerm> {
    OaContractFulfilmentTerm selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
    OaContractFulfilmentTerm selectByNumberIncludingDeleted(@Param("contractId") Long contractId,
            @Param("tenantId") Long tenantId, @Param("termNo") Integer termNo);
    int updateDeletionState(@Param("record") OaContractFulfilmentTerm record,
            @Param("expectedDeleted") int expectedDeleted, @Param("deleted") int deleted);
}
