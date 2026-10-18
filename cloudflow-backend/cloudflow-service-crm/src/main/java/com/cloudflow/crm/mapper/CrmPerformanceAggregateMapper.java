package com.cloudflow.crm.mapper;

import com.cloudflow.crm.domain.vo.CrmPerformanceAggregateRow;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService.Scope;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmPerformanceAggregateMapper {
    List<CrmPerformanceAggregateRow> aggregate(@Param("dimension") String dimension, @Param("ids") List<Long> ids,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("basis") String basis, @Param("currency") String currency, @Param("limit") Integer limit,
            @Param("scope") Scope scope);
}
