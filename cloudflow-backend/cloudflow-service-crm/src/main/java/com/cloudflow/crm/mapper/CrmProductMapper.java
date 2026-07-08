package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmProduct;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmProductMapper extends BaseMapper<CrmProduct> {

    Page<CrmProduct> selectPageByDataScope(Page<CrmProduct> page,
                                           @Param("query") CrmProduct query,
                                           @Param("dataScope") DataScope dataScope);
}
