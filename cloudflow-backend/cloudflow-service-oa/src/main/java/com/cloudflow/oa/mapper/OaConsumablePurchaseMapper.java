package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface OaConsumablePurchaseMapper {
    @InterceptorIgnore(tenantLine = "true")
    List<BizPurchaseItem> lockItems(@Param("tenantId") Long tenantId, @Param("purchaseId") Long purchaseId);
    int updateReceived(@Param("record") BizPurchaseItem record, @Param("previous") Integer previous);
    BizPurchaseRequest visible(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("dataScope") DataScope dataScope);
    Page<ConsumableResults.PurchaseReceiptView> receipts(Page<ConsumableResults.PurchaseReceiptView> page,
            @Param("tenantId") Long tenantId, @Param("purchaseId") Long purchaseId);
}
