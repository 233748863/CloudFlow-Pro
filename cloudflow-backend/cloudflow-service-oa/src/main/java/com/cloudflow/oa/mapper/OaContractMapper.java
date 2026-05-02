package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaContract;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 合同台账 Mapper。
 */
@Mapper
public interface OaContractMapper extends BaseMapper<OaContract> {

    Page<OaContract> selectPageByDataScope(Page<OaContract> page,
                                           @Param("query") OaContract query,
                                           @Param("dataScope") DataScope dataScope);
}
