package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.config.WorkflowCallbackStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmProduct;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmQuoteLine;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.crm.mapper.CrmProductMapper;
import com.cloudflow.crm.mapper.CrmQuoteLineMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmQuoteService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CrmQuoteServiceImpl extends CrmServiceSupport<CrmQuoteMapper, CrmQuote>
        implements ICrmQuoteService {

    private final RemoteWorkflowService remoteWorkflowService;
    private final ICrmCustomerService customerService;
    private final RemoteOaService remoteOaService;
    private final CrmProductMapper productMapper;
    private final CrmQuoteLineMapper quoteLineMapper;

    @Override
    public PageResult<CrmQuote> queryPage(CrmQuote query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmQuote> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmQuote::getDelFlag, CrmConstants.DelFlag.NORMAL).orderByDesc(CrmQuote::getUpdateTime);
        eqIfPresent(wrapper, CrmQuote::getCustomerId, query.getCustomerId());
        eqIfPresent(wrapper, CrmQuote::getOpportunityId, query.getOpportunityId());
        likeIfPresent(wrapper, CrmQuote::getQuoteName, query.getQuoteName());
        eqIfPresent(wrapper, CrmQuote::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public CrmQuote getQuoteDetail(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!CrmConstants.DelFlag.NORMAL.equals(quote.getDelFlag())) {
            throw new IllegalArgumentException("报价不存在");
        }
        quote.setQuoteLines(listQuoteLines(quoteId));
        return quote;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createQuote(CrmQuote quote) {
        fillCustomerSnapshot(quote);
        prepareQuoteForSave(quote);
        if (!StringUtils.hasText(quote.getQuoteNo())) {
            quote.setQuoteNo(Localize.nextNo(CrmConstants.NoPrefix.QUOTE));
        }
        if (quote.getOwnerId() == null) {
            quote.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(quote.getOwnerName())) {
            quote.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(quote, currentTenantId(), currentUserName(), now());
        boolean saved = save(quote);
        if (!saved || quote.getQuoteId() == null) {
            return false;
        }
        saveQuoteLines(quote.getQuoteId(), quote.getQuoteLines());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateQuote(CrmQuote quote) {
        if (quote == null || quote.getQuoteId() == null) {
            throw new IllegalArgumentException("报价ID不能为空");
        }
        fillCustomerSnapshot(quote);
        prepareQuoteForSave(quote);
        CrmQuote persisted = requireById(quote.getQuoteId(), "报价不存在");
        quote.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(quote.getQuoteNo())) {
            quote.setQuoteNo(persisted.getQuoteNo());
        }
        if (quote.getOwnerId() == null) {
            quote.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(quote.getOwnerName())) {
            quote.setOwnerName(persisted.getOwnerName());
        }
        quote.setInstanceId(persisted.getInstanceId());
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (!updated) {
            return false;
        }
        replaceQuoteLines(quote.getQuoteId(), quote.getQuoteLines());
        return true;
    }

    @Override
    public boolean submitQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!CrmConstants.DelFlag.NORMAL.equals(quote.getDelFlag())) {
            throw new IllegalArgumentException("报价不存在");
        }
        if (!CrmConstants.QuoteStatus.DRAFT.equals(quote.getStatus())
                && !CrmConstants.QuoteStatus.REJECTED.equals(quote.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回报价可以提交审批");
        }

        quote.setStatus(CrmConstants.QuoteStatus.PENDING);
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());

        WorkflowProcessStartDTO dto = new WorkflowProcessStartDTO();
        dto.setProcessDefKey("quote_approval");
        dto.setBusinessKey("CRM_QUOTE:" + quoteId);
        Map<String, Object> variables = new HashMap<>();
        variables.put("quoteId", quoteId);
        variables.put("quoteNo", quote.getQuoteNo());
        variables.put("quoteName", quote.getQuoteName());
        variables.put("customerId", quote.getCustomerId());
        variables.put("customerName", quote.getCustomerName());
        variables.put("totalAmount", quote.getTotalAmount());
        WorkflowCallbackStreamConstants.applyCallbackMetadata(
                variables,
                WorkflowCallbackStreamConstants.BUSINESS_TYPE_CRM_QUOTE,
                quoteId,
                quote.getQuoteNo()
        );
        dto.setVariables(variables);

        try {
            R<?> result = remoteWorkflowService.startProcess(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                quote.setInstanceId(extractInstanceId(result.getData()));
            }
        } catch (Exception ignored) {
        }

        return updateById(quote);
    }

    @Override
    public boolean sendQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!CrmConstants.QuoteStatus.APPROVED.equals(quote.getStatus())
                && !CrmConstants.QuoteStatus.REJECTED.equals(quote.getStatus())
                && !CrmConstants.QuoteStatus.DRAFT.equals(quote.getStatus())) {
            throw new IllegalArgumentException("当前报价状态不允许发送");
        }
        quote.setStatus(CrmConstants.QuoteStatus.SENT);
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (updated) {
            customerService.refreshHealth(quote.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean acceptQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (!CrmConstants.QuoteStatus.APPROVED.equals(quote.getStatus())
                && !CrmConstants.QuoteStatus.SENT.equals(quote.getStatus())) {
            throw new IllegalArgumentException("当前报价状态不允许接受");
        }
        if (quote.getContractId() == null) {
            createContractDraft(quoteId);
        }
        quote.setStatus(CrmConstants.QuoteStatus.ACCEPTED);
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (updated) {
            customerService.refreshHealth(quote.getCustomerId());
        }
        return updated;
    }

    @Override
    public Long createContractDraft(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (quote.getContractId() != null) {
            return quote.getContractId();
        }

        RemoteOaService.ContractDraftRequest request = new RemoteOaService.ContractDraftRequest();
        request.setContractName(StringUtils.hasText(quote.getQuoteName()) ? quote.getQuoteName() : "CRM报价转合同");
        request.setCounterpartyName(quote.getCustomerName());
        request.setContractType("SALES");
        request.setAmount(quote.getTotalAmount());
        request.setCurrency(quote.getCurrency());
        request.setOwnerId(quote.getOwnerId());
        request.setOwnerName(quote.getOwnerName());
        request.setCustomerId(quote.getCustomerId());
        request.setCustomerName(quote.getCustomerName());
        request.setRemark("由CRM报价 " + quote.getQuoteNo() + " 生成");

        R<Long> response = remoteOaService.createContract("true", "cloudflow-service-crm", request);
        if (response == null || !response.isSuccess()) {
            throw new IllegalArgumentException(response != null ? response.getMsg() : "生成合同草稿失败");
        }
        Long contractId = response.getData();
        if (contractId == null) {
            throw new IllegalArgumentException("OA 合同草稿返回ID为空");
        }
        quote.setContractId(contractId);
        try {
            RemoteOaService.ContractInfo contractInfo = remoteOaService.getContract(contractId).getData();
            if (contractInfo != null) {
                quote.setContractNo(contractInfo.getContractNo());
            }
        } catch (Exception ignored) {
        }
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        updateById(quote);
        return contractId;
    }

    @Override
    public boolean expireQuote(Long quoteId) {
        CrmQuote quote = requireById(quoteId, "报价不存在");
        if (CrmConstants.QuoteStatus.ACCEPTED.equals(quote.getStatus())) {
            throw new IllegalArgumentException("已接受报价不能设为过期");
        }
        quote.setStatus(CrmConstants.QuoteStatus.EXPIRED);
        quote.setUpdateBy(currentUserName());
        quote.setUpdateTime(now());
        boolean updated = updateById(quote);
        if (updated) {
            customerService.refreshHealth(quote.getCustomerId());
        }
        return updated;
    }

    private void prepareQuoteForSave(CrmQuote quote) {
        validate(quote);
        List<CrmQuoteLine> normalizedLines = normalizeQuoteLines(quote.getQuoteLines());
        quote.setQuoteLines(normalizedLines);
        quote.setTotalAmount(sumLineAmount(normalizedLines, quote.getTotalAmount()));
        quote.setTaxAmount(sumTaxAmount(normalizedLines, quote.getTaxAmount()));
    }

    private void validate(CrmQuote quote) {
        if (quote == null) {
            throw new IllegalArgumentException("报价不能为空");
        }
        if (quote.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(quote.getQuoteName())) {
            throw new IllegalArgumentException("报价名称不能为空");
        }
        if (!StringUtils.hasText(quote.getCurrency())) {
            quote.setCurrency("CNY");
        }
        if (!StringUtils.hasText(quote.getStatus())) {
            quote.setStatus(CrmConstants.QuoteStatus.DRAFT);
        }
    }

    private List<CrmQuoteLine> normalizeQuoteLines(List<CrmQuoteLine> lines) {
        if (lines == null || lines.isEmpty()) {
            return new ArrayList<>();
        }
        List<CrmQuoteLine> normalized = new ArrayList<>();
        int sortNo = 1;
        for (CrmQuoteLine line : lines) {
            if (line == null) {
                continue;
            }
            applyLineDefaults(line, sortNo++);
            fillProductSnapshot(line);
            if (!StringUtils.hasText(line.getProductName())) {
                throw new IllegalArgumentException("报价行产品名称不能为空");
            }
            normalized.add(line);
        }
        return normalized;
    }

    private void applyLineDefaults(CrmQuoteLine line, int sortNo) {
        line.setSortNo(line.getSortNo() == null ? sortNo : line.getSortNo());
        if (line.getQuantity() == null) {
            line.setQuantity(BigDecimal.ONE);
        }
        if (line.getUnitPrice() == null) {
            line.setUnitPrice(BigDecimal.ZERO);
        }
        if (line.getDiscountRate() == null) {
            line.setDiscountRate(new BigDecimal("100"));
        }
        if (line.getTaxRate() == null) {
            line.setTaxRate(BigDecimal.ZERO);
        }
        if (line.getLineAmount() == null) {
            line.setLineAmount(calcLineAmount(line));
        }
        if (line.getTaxAmount() == null) {
            line.setTaxAmount(calcTaxAmount(line));
        }
    }

    private BigDecimal calcLineAmount(CrmQuoteLine line) {
        BigDecimal quantity = line.getQuantity() == null ? BigDecimal.ONE : line.getQuantity();
        BigDecimal unitPrice = line.getUnitPrice() == null ? BigDecimal.ZERO : line.getUnitPrice();
        BigDecimal discountRate = line.getDiscountRate() == null ? new BigDecimal("100") : line.getDiscountRate();
        return unitPrice.multiply(quantity)
                .multiply(discountRate)
                .divide(new BigDecimal("100"), 2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal calcTaxAmount(CrmQuoteLine line) {
        BigDecimal lineAmount = line.getLineAmount() == null ? calcLineAmount(line) : line.getLineAmount();
        BigDecimal taxRate = line.getTaxRate() == null ? BigDecimal.ZERO : line.getTaxRate();
        return lineAmount.multiply(taxRate)
                .divide(new BigDecimal("100"), 2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal sumLineAmount(List<CrmQuoteLine> lines, BigDecimal fallback) {
        if (lines == null || lines.isEmpty()) {
            return fallback == null ? BigDecimal.ZERO : fallback;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (CrmQuoteLine line : lines) {
            total = total.add(line.getLineAmount() == null ? BigDecimal.ZERO : line.getLineAmount());
        }
        return total;
    }

    private BigDecimal sumTaxAmount(List<CrmQuoteLine> lines, BigDecimal fallback) {
        if (lines == null || lines.isEmpty()) {
            return fallback == null ? BigDecimal.ZERO : fallback;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (CrmQuoteLine line : lines) {
            total = total.add(line.getTaxAmount() == null ? BigDecimal.ZERO : line.getTaxAmount());
        }
        return total;
    }

    private void fillProductSnapshot(CrmQuoteLine line) {
        if (line.getProductId() == null) {
            return;
        }
        CrmProduct product = getProductById(line.getProductId());
        if (product == null || !CrmConstants.DelFlag.NORMAL.equals(product.getDelFlag())) {
            return;
        }
        if (!StringUtils.hasText(line.getProductNo())) {
            line.setProductNo(product.getProductNo());
        }
        if (!StringUtils.hasText(line.getProductName())) {
            line.setProductName(product.getProductName());
        }
        if (!StringUtils.hasText(line.getCategory())) {
            line.setCategory(product.getCategory());
        }
        if (!StringUtils.hasText(line.getSpec())) {
            line.setSpec(product.getSpec());
        }
        if (!StringUtils.hasText(line.getUnit())) {
            line.setUnit(product.getUnit());
        }
        if (line.getUnitPrice() == null || BigDecimal.ZERO.compareTo(line.getUnitPrice()) == 0) {
            line.setUnitPrice(product.getStandardPrice() == null ? BigDecimal.ZERO : product.getStandardPrice());
        }
        if (line.getLineAmount() == null || BigDecimal.ZERO.compareTo(line.getLineAmount()) == 0) {
            line.setLineAmount(calcLineAmount(line));
        }
        if (line.getTaxAmount() == null || BigDecimal.ZERO.compareTo(line.getTaxAmount()) == 0) {
            line.setTaxAmount(calcTaxAmount(line));
        }
    }

    private CrmProduct getProductById(Long productId) {
        return productMapper.selectById(productId);
    }

    private void saveQuoteLines(Long quoteId, List<CrmQuoteLine> lines) {
        if (lines == null || lines.isEmpty()) {
            return;
        }
        for (CrmQuoteLine line : lines) {
            Localize.fillCommonAudit(line, currentTenantId(), currentUserName(), now());
            line.setQuoteId(quoteId);
            quoteLineMapper.insert(line);
        }
    }

    private void replaceQuoteLines(Long quoteId, List<CrmQuoteLine> lines) {
        quoteLineMapper.delete(new LambdaQueryWrapper<CrmQuoteLine>().eq(CrmQuoteLine::getQuoteId, quoteId));
        saveQuoteLines(quoteId, lines);
    }

    private List<CrmQuoteLine> listQuoteLines(Long quoteId) {
        return quoteLineMapper.selectList(new LambdaQueryWrapper<CrmQuoteLine>()
                .eq(CrmQuoteLine::getQuoteId, quoteId)
                .eq(CrmQuoteLine::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .orderByAsc(CrmQuoteLine::getSortNo));
    }

    private void fillCustomerSnapshot(CrmQuote quote) {
        if (quote == null || quote.getCustomerId() == null) {
            return;
        }
        CrmCustomer customer = customerService.getById(quote.getCustomerId());
        if (customer != null && CrmConstants.DelFlag.NORMAL.equals(customer.getDelFlag())) {
            quote.setCustomerName(customer.getCustomerName());
        }
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data != null ? String.valueOf(data) : null;
    }
}
