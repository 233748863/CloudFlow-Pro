package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Mapper
public interface OaConsumableLedgerMapper extends BaseMapper<OaConsumableLedger> {
    Map<String, Object> sourceContext(@Param("tenantId") Long tenantId, @Param("sourceType") String sourceType, @Param("sourceId") Long sourceId);
    List<OaConsumableLedger> operation(@Param("tenantId") Long tenantId, @Param("key") String key);
    OaConsumableLedger tail(@Param("tenantId") Long tenantId, @Param("consumableId") Long consumableId);
    OaConsumableLedger reversal(@Param("tenantId") Long tenantId, @Param("ledgerId") Long ledgerId);
    List<OaConsumableLedger> chain(@Param("tenantId") Long tenantId, @Param("consumableId") Long consumableId,
                                 @Param("afterId") Long afterId);
    List<OaConsumableLedger> returns(@Param("tenantId") Long tenantId, @Param("ledgerId") Long ledgerId);
    List<OaConsumableLedger> requestRows(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
    BigDecimal receivedAmount(@Param("tenantId") Long tenantId, @Param("itemId") Long itemId);
    Long receivedQuantity(@Param("tenantId") Long tenantId, @Param("itemId") Long itemId);
    BigDecimal lastPurchasePrice(@Param("tenantId") Long tenantId, @Param("consumableId") Long consumableId);
    OaConsumableLedger lastInbound(@Param("tenantId") Long tenantId, @Param("consumableId") Long consumableId);
    Page<OaConsumableLedger> ledgerPage(Page<OaConsumableLedger> page, @Param("tenantId") Long tenantId,
                                      @Param("query") ConsumableQuery query);
    Page<ConsumableResults.ReportRow> stockReport(Page<ConsumableResults.ReportRow> page,
            @Param("tenantId") Long tenantId, @Param("query") ConsumableQuery query);
    Page<ConsumableResults.ReportRow> usageReport(Page<ConsumableResults.ReportRow> page,
            @Param("tenantId") Long tenantId, @Param("query") ConsumableQuery query,
            @Param("allData") boolean allData, @Param("scopeDeptIds") List<Long> scopeDeptIds,
            @Param("scopeUserId") Long scopeUserId);
}
