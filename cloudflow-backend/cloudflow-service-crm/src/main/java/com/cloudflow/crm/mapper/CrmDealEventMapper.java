package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmDealEvent;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmDealEventMapper extends BaseMapper<CrmDealEvent> {
    CrmDealEvent lockById(@Param("id") Long id);
    CrmDealEvent lockByKey(@Param("eventKey") String eventKey);
    List<CrmDealEvent> lockReversals(@Param("eventId") Long eventId);
}
