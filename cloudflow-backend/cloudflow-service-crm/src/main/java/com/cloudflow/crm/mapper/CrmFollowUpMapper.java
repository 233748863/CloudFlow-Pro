package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmFollowUp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmFollowUpMapper extends BaseMapper<CrmFollowUp> {

    Page<CrmFollowUp> selectPageByDataScope(Page<CrmFollowUp> page,
                                            @Param("query") CrmFollowUp query,
                                            @Param("dataScope") DataScope dataScope);

    CrmFollowUp selectByIdWithDataScope(@Param("followUpId") Long followUpId,
                                        @Param("dataScope") DataScope dataScope);
}
