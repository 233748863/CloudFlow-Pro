package com.cloudflow.crm.service.opportunity;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmOpportunityItem;
import com.cloudflow.crm.domain.CrmProduct;
import com.cloudflow.crm.domain.dto.CrmOpportunityItemsRequest;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityItemMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmProductMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmOpportunityItemService {
    private final CrmOpportunityItemMapper items;
    private final CrmOpportunityMapper opportunities;
    private final CrmProductMapper products;
    private final CrmOpportunityAccessService access;
    private final CrmOpportunityTeamService teams;

    public record View(Long opportunityId, Integer version, List<CrmOpportunityItem> items,
            BigDecimal subtotal, BigDecimal taxAmount, BigDecimal totalAmount, BigDecimal expectedAmount, BigDecimal weightedAmount) { }

    @Transactional(readOnly = true)
    public View list(Long id) { return view(access.read(id), rows(id)); }

    @Audit(name = "保存商机产品明细")
    @Transactional(rollbackFor = Exception.class)
    public View save(Long id, CrmOpportunityItemsRequest request) {
        CrmRecordSupport.require(request, "产品明细不能为空");
        if (request.items() == null || request.items().size() > 200) throw new CrmBusinessException("商机产品明细须为0至200行");
        CrmOpportunity opportunity = access.lock(id);
        CrmOpportunityStagePolicy.version(request.version(), opportunity);
        if (!"OPEN".equals(opportunity.getStatus()) || "WON".equals(opportunity.getStage()) || "LOST".equals(opportunity.getStage()))
            throw new CrmBusinessException("已结案商机的产品金额不能修改");
        List<CrmOpportunityItem> normalized = new ArrayList<>();
        for (int index = 0; index < request.items().size(); index++) normalized.add(normalize(id, request.items().get(index), index + 1));
        BigDecimal subtotal = total(normalized, false);
        BigDecimal expected = normalized.isEmpty() ? CrmSalesAmounts.expected(opportunity.getExpectedAmount()) : CrmSalesAmounts.expected(subtotal);
        opportunity.setExpectedAmount(expected); opportunity.setWeightedAmount(CrmSalesAmounts.weighted(expected, opportunity.getWinRate()));
        teams.synchronize(opportunity);
        CrmRecordSupport.touch(opportunity);
        CrmRecordSupport.saved(opportunities.updateById(opportunity));
        items.update(null, new LambdaUpdateWrapper<CrmOpportunityItem>().eq(CrmOpportunityItem::getOpportunityId, id)
                .eq(CrmOpportunityItem::getDeleted, 0).set(CrmOpportunityItem::getDeleted, 1)
                .set(CrmOpportunityItem::getUpdateBy, CrmRecordSupport.userName()).set(CrmOpportunityItem::getUpdateTime, LocalDateTime.now()));
        for (CrmOpportunityItem item : normalized) CrmRecordSupport.saved(items.insert(item));
        return view(opportunity, normalized);
    }

    public void applyAmount(CrmOpportunity opportunity) {
        List<CrmOpportunityItem> current = opportunity.getOpportunityId() == null ? List.of() : rows(opportunity.getOpportunityId());
        if (!current.isEmpty()) opportunity.setExpectedAmount(CrmSalesAmounts.expected(total(current, false)));
    }

    private List<CrmOpportunityItem> rows(Long id) {
        return items.selectList(new LambdaQueryWrapper<CrmOpportunityItem>().eq(CrmOpportunityItem::getOpportunityId, id)
                .eq(CrmOpportunityItem::getDeleted, 0).orderByAsc(CrmOpportunityItem::getSortNo).orderByAsc(CrmOpportunityItem::getItemId));
    }

    private CrmOpportunityItem normalize(Long opportunityId, CrmOpportunityItemsRequest.Item request, int sortNo) {
        CrmRecordSupport.require(request, "产品明细行不能为空");
        CrmOpportunityItem item = new CrmOpportunityItem();
        item.setOpportunityId(opportunityId); item.setSortNo(sortNo); item.setProductId(request.productId());
        item.setProductNo(optional(request.productNo(), 64, "产品编号")); item.setProductName(request.productName());
        item.setSpec(optional(request.spec(), 200, "规格")); item.setUnit(optional(request.unit(), 30, "单位"));
        item.setRemark(optional(request.remark(), 500, "产品备注"));
        if (request.productId() != null) {
            CrmProduct product = products.selectById(request.productId());
            if (product == null || !Objects.equals(CrmRecordSupport.tenantId(), product.getTenantId())
                    || !Integer.valueOf(0).equals(product.getDeleted()) || !"ACTIVE".equals(product.getStatus())) throw new CrmBusinessException("产品不存在或已停用");
            if (product.getCurrency() != null && !"CNY".equals(product.getCurrency())) throw new CrmBusinessException("商机人民币金额不能直接使用其他币种的产品");
            item.setProductNo(product.getProductNo()); item.setProductName(product.getProductName());
            item.setSpec(optional(product.getSpec(), 200, "产品规格")); item.setUnit(product.getUnit());
        }
        item.setProductName(CrmRecordSupport.text(item.getProductName(), 200, "产品名称"));
        CrmSalesAmounts.Line amounts = CrmSalesAmounts.line(request.quantity(), request.unitPrice(), request.discountRate(), request.taxRate());
        item.setQuantity(amounts.quantity()); item.setUnitPrice(amounts.unitPrice()); item.setDiscountRate(amounts.discountRate()); item.setTaxRate(amounts.taxRate());
        item.setLineAmount(amounts.lineAmount()); item.setTaxAmount(amounts.taxAmount()); CrmRecordSupport.create(item, "itemId");
        return item;
    }

    private View view(CrmOpportunity opportunity, List<CrmOpportunityItem> current) {
        BigDecimal subtotal = total(current, false); BigDecimal tax = total(current, true);
        return new View(opportunity.getOpportunityId(), opportunity.getVersion(), List.copyOf(current), subtotal, tax,
                subtotal.add(tax), opportunity.getExpectedAmount(), opportunity.getWeightedAmount());
    }

    private BigDecimal total(List<CrmOpportunityItem> current, boolean tax) {
        return current.stream().map(item -> tax ? item.getTaxAmount() : item.getLineAmount()).reduce(new BigDecimal("0.00"), BigDecimal::add);
    }

    private String optional(String value, int maximum, String label) {
        if (value == null) return null;
        if (value.length() > maximum || value.chars().anyMatch(character -> character < 32 && character != '\n' && character != '\r'))
            throw new CrmBusinessException(label + "最多" + maximum + "字符且不能含控制字符");
        return value.trim();
    }
}
