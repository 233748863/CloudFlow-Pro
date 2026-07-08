package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmPriceBook;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmPriceBookMapper extends BaseMapper<CrmPriceBook> {

    Page<CrmPriceBook> selectPageByDataScope(Page<CrmPriceBook> page,
                                             @Param("query") CrmPriceBook query,
                                             @Param("dataScope") DataScope dataScope);
}
