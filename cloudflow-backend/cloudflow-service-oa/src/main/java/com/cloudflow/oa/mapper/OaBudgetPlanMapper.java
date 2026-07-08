package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaBudgetPlan;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaBudgetPlanMapper extends BaseMapper<OaBudgetPlan> {

    Page<OaBudgetPlan> selectPageByDataScope(Page<OaBudgetPlan> page,
                                             @Param("query") OaBudgetPlan query,
                                             @Param("dataScope") DataScope dataScope);

    OaBudgetPlan selectByIdWithDataScope(@Param("budgetId") Long budgetId,
                                         @Param("dataScope") DataScope dataScope);
}
