package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmCustomer;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CrmCustomerMapper extends BaseMapper<CrmCustomer> {
}
