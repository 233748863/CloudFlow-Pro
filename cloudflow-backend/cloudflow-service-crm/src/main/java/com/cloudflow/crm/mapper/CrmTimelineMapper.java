package com.cloudflow.crm.mapper;

import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.vo.CrmTimelineItemVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CrmTimelineMapper {
    List<CrmTimelineItemVO> selectCustomerTimeline(@Param("customerId") Long customerId,
            @Param("tenantId") Long tenantId, @Param("userId") Long userId,
            @Param("dataScope") DataScope dataScope);
}
