package com.cloudflow.crm.mapper;

import com.cloudflow.crm.domain.vo.CrmReceiptAchievementRow;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService.Scope;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmReceiptAchievementMapper {
    List<CrmReceiptAchievementRow> team(@Param("dimension") String dimension, @Param("ids") List<Long> ids,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("currency") String currency, @Param("scope") Scope scope);
    List<CrmReceiptAchievementRow> owner(@Param("dimension") String dimension, @Param("ids") List<Long> ids,
            @Param("start") LocalDate start, @Param("end") LocalDate end,
            @Param("currency") String currency, @Param("scope") Scope scope);
}
