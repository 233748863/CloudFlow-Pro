package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmTargetList;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CrmTargetListMapper extends BaseMapper<CrmTargetList> {
    java.util.List<CrmTargetList> selectAllByDataScope(@org.apache.ibatis.annotations.Param("dataScope") com.cloudflow.common.datascope.DataScope dataScope);
    CrmTargetList selectAccessible(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("dataScope") com.cloudflow.common.datascope.DataScope dataScope);
    CrmTargetList lockById(@org.apache.ibatis.annotations.Param("id") Long id);
}
