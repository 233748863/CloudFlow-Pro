package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmQuote;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmQuoteMapper extends BaseMapper<CrmQuote> {

    Page<CrmQuote> selectPageByDataScope(Page<CrmQuote> page,
                                         @Param("query") CrmQuote query,
                                         @Param("dataScope") DataScope dataScope);

    CrmQuote selectByIdWithDataScope(@Param("quoteId") Long quoteId,
                                     @Param("dataScope") DataScope dataScope);
}
