package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.export.RfqComparisonExportVo;
import com.cloudflow.oa.mapper.OaPurchaseRfqMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OaRfqComparisonService {
    private final OaPurchaseRfqMapper rfqs;
    private final SysSupplierMapper suppliers;
    private final OaQuotationService quotations;
    private final OaRfqAccessService access;

    public record QuoteCell(Long quotationId, Long supplierId, String supplierName, String currency, BigDecimal unitPrice, BigDecimal discountRate,
                            BigDecimal taxRate, BigDecimal lineAmount, BigDecimal taxAmount, BigDecimal grossAmount, Integer deliveryDays, String brand, String model, boolean isLowest, boolean isShortestDelivery) { }
    public record ItemRow(Long rfqItemId, String itemName, String spec, String unit, Integer quantity, BigDecimal expectedPrice, List<QuoteCell> quotes) { }
    public record SupplierRow(Long quotationId, Long supplierId, String supplierName, String currency, BigDecimal totalAmount, BigDecimal taxAmount,
                              Integer deliveryDays, Integer warrantyMonths, String paymentTerms, String standing, BigDecimal score, String indicatorColor, boolean isLowestTotal, boolean isShortestDelivery, int rank) { }
    public record CurrencySummary(String currency, BigDecimal lowestTotal, BigDecimal highestTotal, BigDecimal avgTotal, BigDecimal priceSpread) { }
    public record Comparison(List<ItemRow> items, List<SupplierRow> suppliers, List<CurrencySummary> summaries) { }

    @Audit(name = "查看保密询价比价", spel = "#id")
    public Comparison comparison(Long id) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(id)); access.assertComparison(rfq);
        List<OaSupplierQuotation> quotes = quotations.submitted(id);
        Map<Long, List<OaSupplierQuotationItem>> lines = new HashMap<>();
        for (OaSupplierQuotation quote : quotes) lines.put(quote.getQuotationId(), quotations.lines(quote.getQuotationId()));
        List<ItemRow> rows = new ArrayList<>();
        for (OaPurchaseRfqItem requirement : quotations.requirements(id)) {
            Map<Long, OaSupplierQuotationItem> matching = new LinkedHashMap<>();
            for (OaSupplierQuotation quote : quotes) {
                OaSupplierQuotationItem line = lines.get(quote.getQuotationId()).stream().filter(item -> requirement.getItemId().equals(item.getRfqItemId())).findFirst().orElseThrow(() -> new IllegalStateException("已提交报价缺少物料明细"));
                matching.put(quote.getQuotationId(), line);
            }
            List<QuoteCell> cells = new ArrayList<>();
            for (OaSupplierQuotation quote : quotes) {
                OaSupplierQuotationItem line = matching.get(quote.getQuotationId());
                BigDecimal lowest = quotes.stream().filter(item -> Objects.equals(quote.getCurrency(), item.getCurrency())).map(item -> matching.get(item.getQuotationId()).getUnitPrice()).min(BigDecimal::compareTo).orElseThrow();
                Integer days = line.getDeliveryDays() == null ? quote.getDeliveryDays() : line.getDeliveryDays();
                Integer shortest = quotes.stream().map(item -> matching.get(item.getQuotationId()).getDeliveryDays() == null ? item.getDeliveryDays() : matching.get(item.getQuotationId()).getDeliveryDays()).filter(Objects::nonNull).min(Integer::compareTo).orElse(null);
                OaRfqQuoteCalculator.Amounts amounts = OaRfqQuoteCalculator.calculate(line);
                cells.add(new QuoteCell(quote.getQuotationId(), quote.getSupplierId(), quote.getSupplierName(), quote.getCurrency(), line.getUnitPrice(), line.getDiscountRate(), line.getTaxRate(),
                        line.getLineAmount(), amounts.tax(), amounts.gross(), days, line.getBrand(), line.getModel(), lowest.compareTo(line.getUnitPrice()) == 0, days != null && days.equals(shortest)));
            }
            rows.add(new ItemRow(requirement.getItemId(), requirement.getItemName(), requirement.getSpec(), requirement.getUnit(), requirement.getQuantity(), requirement.getExpectedPrice(), cells));
        }
        Integer shortest = quotes.stream().map(OaSupplierQuotation::getDeliveryDays).filter(Objects::nonNull).min(Integer::compareTo).orElse(null);
        Map<String, List<OaSupplierQuotation>> currencies = quotes.stream().collect(Collectors.groupingBy(OaSupplierQuotation::getCurrency, TreeMap::new, Collectors.toList()));
        List<SupplierRow> supplierRows = new ArrayList<>(); List<CurrencySummary> summaries = new ArrayList<>();
        for (Map.Entry<String, List<OaSupplierQuotation>> group : currencies.entrySet()) {
            List<OaSupplierQuotation> sameCurrency = group.getValue().stream().sorted(Comparator.comparing(OaSupplierQuotation::getTotalAmount)).toList();
            BigDecimal lowest = sameCurrency.get(0).getTotalAmount(), highest = sameCurrency.get(sameCurrency.size() - 1).getTotalAmount();
            BigDecimal average = sameCurrency.stream().map(OaSupplierQuotation::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add).divide(BigDecimal.valueOf(sameCurrency.size()), 2, RoundingMode.HALF_UP);
            summaries.add(new CurrencySummary(group.getKey(), lowest, highest, average, highest.subtract(lowest)));
            for (OaSupplierQuotation quote : sameCurrency) {
                SysSupplier supplier = suppliers.selectById(quote.getSupplierId());
                if (supplier != null) OaRecordSupport.same(supplier.getTenantId(), OaRecordSupport.tenantId(), "供应商租户不一致");
                int rank = 1 + (int) sameCurrency.stream().filter(item -> item.getTotalAmount().compareTo(quote.getTotalAmount()) < 0).count();
                supplierRows.add(new SupplierRow(quote.getQuotationId(), quote.getSupplierId(), quote.getSupplierName(), quote.getCurrency(), quote.getTotalAmount(), quote.getTaxAmount(), quote.getDeliveryDays(), quote.getWarrantyMonths(), quote.getPaymentTerms(),
                        supplier == null ? null : supplier.getStanding(), supplier == null ? null : supplier.getScore(), supplier == null ? null : supplier.getIndicatorColor(), lowest.compareTo(quote.getTotalAmount()) == 0, quote.getDeliveryDays() != null && quote.getDeliveryDays().equals(shortest), rank));
            }
        }
        return new Comparison(rows, supplierRows, summaries);
    }

    @Audit(name = "导出保密询价比价", spel = "#id")
    public List<RfqComparisonExportVo> export(Long id) {
        Comparison comparison = comparison(id); List<RfqComparisonExportVo> result = new ArrayList<>();
        for (ItemRow item : comparison.items()) for (QuoteCell cell : item.quotes()) {
            SupplierRow supplier = comparison.suppliers().stream().filter(row -> row.quotationId().equals(cell.quotationId())).findFirst().orElseThrow();
            RfqComparisonExportVo row = new RfqComparisonExportVo(); row.setItemName(item.itemName()); row.setSpec(item.spec()); row.setUnit(item.unit()); row.setQuantity(item.quantity()); row.setSupplierName(cell.supplierName()); row.setCurrency(cell.currency());
            row.setUnitPrice(cell.unitPrice()); row.setDiscountRate(cell.discountRate()); row.setTaxRate(cell.taxRate()); row.setLineAmount(cell.lineAmount()); row.setTaxAmount(cell.taxAmount()); row.setGrossAmount(cell.grossAmount());
            row.setDeliveryDays(cell.deliveryDays()); row.setLowestPrice(cell.isLowest() ? "是" : "否"); row.setTotalAmount(supplier.totalAmount()); row.setRank(supplier.rank()); row.setStanding(supplier.standing()); row.setScore(supplier.score()); row.setPaymentTerms(supplier.paymentTerms());
            result.add(row);
        }
        return result;
    }
}
