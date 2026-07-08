package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaBudgetLedger;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaBudgetLedgerMapper extends BaseMapper<OaBudgetLedger> {

    Page<OaBudgetLedger> selectPageByDataScope(Page<OaBudgetLedger> page,
                                               @Param("query") OaBudgetLedger query,
                                               @Param("dataScope") DataScope dataScope);
}
