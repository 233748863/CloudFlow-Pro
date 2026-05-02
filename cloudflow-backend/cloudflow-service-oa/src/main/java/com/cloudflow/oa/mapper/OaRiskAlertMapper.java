package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaRiskAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 风险提醒 Mapper。
 */
@Mapper
public interface OaRiskAlertMapper extends BaseMapper<OaRiskAlert> {

    Page<OaRiskAlert> selectPageByDataScope(Page<OaRiskAlert> page,
                                            @Param("query") OaRiskAlert query,
                                            @Param("dataScope") DataScope dataScope);
}
