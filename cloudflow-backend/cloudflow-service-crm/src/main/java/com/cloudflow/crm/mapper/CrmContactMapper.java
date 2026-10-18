package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmContact;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CrmContactMapper extends BaseMapper<CrmContact> {
    com.baomidou.mybatisplus.extension.plugins.pagination.Page<CrmContact> selectPageByDataScope(
            com.baomidou.mybatisplus.extension.plugins.pagination.Page<CrmContact> page,
            @org.apache.ibatis.annotations.Param("query") CrmContact query,
            @org.apache.ibatis.annotations.Param("dataScope") com.cloudflow.common.datascope.DataScope dataScope);
    java.util.List<CrmContact> selectAllByDataScope(@org.apache.ibatis.annotations.Param("dataScope") com.cloudflow.common.datascope.DataScope dataScope);
}
