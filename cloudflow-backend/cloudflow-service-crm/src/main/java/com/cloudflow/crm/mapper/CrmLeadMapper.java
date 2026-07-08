package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmLead;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmLeadMapper extends BaseMapper<CrmLead> {

    Page<CrmLead> selectPageByDataScope(Page<CrmLead> page,
                                        @Param("query") CrmLead query,
                                        @Param("dataScope") DataScope dataScope);
}
