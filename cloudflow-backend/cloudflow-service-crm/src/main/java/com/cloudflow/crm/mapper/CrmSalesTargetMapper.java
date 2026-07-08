package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmSalesTarget;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmSalesTargetMapper extends BaseMapper<CrmSalesTarget> {

    Page<CrmSalesTarget> selectPageByDataScope(Page<CrmSalesTarget> page,
                                               @Param("query") CrmSalesTarget query,
                                               @Param("dataScope") DataScope dataScope);
}
