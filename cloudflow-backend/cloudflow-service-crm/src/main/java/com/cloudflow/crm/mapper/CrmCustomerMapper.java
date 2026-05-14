package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmCustomer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmCustomerMapper extends BaseMapper<CrmCustomer> {

    Page<CrmCustomer> selectPageByDataScope(Page<CrmCustomer> page,
                                            @Param("query") CrmCustomer query,
                                            @Param("dataScope") DataScope dataScope);

    CrmCustomer selectByIdWithDataScope(@Param("customerId") Long customerId,
                                        @Param("dataScope") DataScope dataScope);
}
