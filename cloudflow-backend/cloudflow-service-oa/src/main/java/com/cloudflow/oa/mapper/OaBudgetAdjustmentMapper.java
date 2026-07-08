package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaBudgetAdjustmentMapper extends BaseMapper<OaBudgetAdjustment> {

    Page<OaBudgetAdjustment> selectPageByDataScope(Page<OaBudgetAdjustment> page,
                                                   @Param("query") OaBudgetAdjustment query,
                                                   @Param("dataScope") DataScope dataScope);
}
