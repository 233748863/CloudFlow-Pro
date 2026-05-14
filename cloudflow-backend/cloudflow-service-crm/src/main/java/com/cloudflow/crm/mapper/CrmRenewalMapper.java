package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmRenewal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmRenewalMapper extends BaseMapper<CrmRenewal> {

    Page<CrmRenewal> selectPageByDataScope(Page<CrmRenewal> page,
                                           @Param("query") CrmRenewal query,
                                           @Param("dataScope") DataScope dataScope);

    CrmRenewal selectByIdWithDataScope(@Param("renewalId") Long renewalId,
                                       @Param("dataScope") DataScope dataScope);
}
