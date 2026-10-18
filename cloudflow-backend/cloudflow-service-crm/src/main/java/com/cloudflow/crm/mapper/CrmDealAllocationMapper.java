package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmDealAllocation;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmDealAllocationMapper extends BaseMapper<CrmDealAllocation> {
    List<CrmDealAllocation> lockByEvent(@Param("eventId") Long eventId);
}
