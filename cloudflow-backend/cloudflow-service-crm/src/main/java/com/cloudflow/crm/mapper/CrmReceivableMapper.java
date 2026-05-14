package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmReceivable;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmReceivableMapper extends BaseMapper<CrmReceivable> {

    Page<CrmReceivable> selectPageByDataScope(Page<CrmReceivable> page,
                                              @Param("query") CrmReceivable query,
                                              @Param("dataScope") DataScope dataScope);

    CrmReceivable selectByIdWithDataScope(@Param("receivableId") Long receivableId,
                                          @Param("dataScope") DataScope dataScope);
}
