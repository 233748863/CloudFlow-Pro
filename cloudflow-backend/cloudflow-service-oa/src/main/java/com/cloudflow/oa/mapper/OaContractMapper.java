package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaContract;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 合同台账 Mapper。
 */
@Mapper
public interface OaContractMapper extends BaseMapper<OaContract> {

    Page<OaContract> selectPageByDataScope(Page<OaContract> page,
                                           @Param("query") OaContract query,
                                           @Param("dataScope") DataScope dataScope);
    OaContract selectForUpdate(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);
    OaContract selectTeamForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("dataScope") DataScope dataScope);
    int writeTeamOwner(@Param("contract") OaContract contract, @Param("expectedVersion") Integer expectedVersion);
    int removeLocked(@Param("contract") OaContract contract);
}
