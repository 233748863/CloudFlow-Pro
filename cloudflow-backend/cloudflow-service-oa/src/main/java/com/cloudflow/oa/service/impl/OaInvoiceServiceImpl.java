package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaInvoiceWriteoff;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaInvoiceMapper;
import com.cloudflow.oa.mapper.OaInvoiceWriteoffMapper;
import com.cloudflow.oa.service.IOaInvoiceService;
import com.cloudflow.oa.service.remote.RemoteCrmService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class OaInvoiceServiceImpl extends ServiceImpl<OaInvoiceMapper, OaInvoice> implements IOaInvoiceService {

    private final OaInvoiceWriteoffMapper invoiceWriteoffMapper;
    private final BizExpenseClaimMapper expenseClaimMapper;
    private final BizPaymentRequestMapper paymentRequestMapper;
    private final OaContractMapper contractMapper;
    private final RemoteCrmService remoteCrmService;

    @Override
    public PageResult<OaInvoice> queryPage(OaInvoice query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaInvoice> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaInvoice::getDeleted, "0").orderByDesc(OaInvoice::getUpdateTime);
        if (StringUtils.hasText(query.getInvoiceDirection())) {
            wrapper.eq(OaInvoice::getInvoiceDirection, query.getInvoiceDirection());
        }
        if (StringUtils.hasText(query.getInvoiceCode())) {
            wrapper.like(OaInvoice::getInvoiceCode, query.getInvoiceCode());
        }
        if (StringUtils.hasText(query.getInvoiceNo())) {
            wrapper.like(OaInvoice::getInvoiceNo, query.getInvoiceNo());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(OaInvoice::getStatus, query.getStatus());
        }
        if (query.getReceivableId() != null) {
            wrapper.eq(OaInvoice::getReceivableId, query.getReceivableId());
        }
        if (query.getCustomerId() != null) {
            wrapper.eq(OaInvoice::getCustomerId, query.getCustomerId());
        }
        return PageResult.build(page(pageQuery.build(), wrapper));
    }

    @Override
    public boolean createInvoice(OaInvoice invoice) {
        validateInvoice(invoice);
        LocalDateTime now = LocalDateTime.now();
        invoice.setTenantId(resolveTenantId());
        invoice.setStatus(StringUtils.hasText(invoice.getStatus()) ? invoice.getStatus() : "REGISTERED");
        invoice.setDeleted(0);
        invoice.setCreateBy(resolveUserName());
        invoice.setCreateTime(now);
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(now);
        return save(invoice);
    }

    @Override
    @Audit(name = "更新发票")
    public boolean updateInvoice(OaInvoice invoice) {
        if (invoice == null || invoice.getInvoiceId() == null) {
            throw new IllegalArgumentException("发票ID不能为空");
        }
        validateInvoice(invoice);
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        return updateById(invoice);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean bindInvoice(Long invoiceId, OaInvoice binding) {
        OaInvoice invoice = requireInvoice(invoiceId);
        if ("VOID".equals(invoice.getStatus())) {
            throw new IllegalArgumentException("作废发票不能绑定业务单据");
        }
        if (binding == null) {
            throw new IllegalArgumentException("绑定信息不能为空");
        }
        invoice.setReceivableId(binding.getReceivableId());
        invoice.setCustomerId(binding.getCustomerId());
        invoice.setCustomerName(binding.getCustomerName());
        invoice.setContractId(binding.getContractId());
        invoice.setContractNo(binding.getContractNo());
        invoice.setExpenseClaimId(binding.getExpenseClaimId());
        invoice.setPaymentRequestId(binding.getPaymentRequestId());
        if ("REGISTERED".equals(invoice.getStatus())) {
            invoice.setStatus("BOUND");
        }
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(invoice);
        if (updated) {
            syncReceivableInvoiceStatus(invoice, BigDecimal.ZERO, null);
            syncRelatedBusinessStatus(invoice);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean writeoffInvoice(OaInvoiceWriteoff writeoff) {
        if (writeoff == null || writeoff.getInvoiceId() == null || writeoff.getWriteoffAmount() == null) {
            throw new IllegalArgumentException("核销信息不完整");
        }
        OaInvoice invoice = requireInvoice(writeoff.getInvoiceId());
        if ("VOID".equals(invoice.getStatus())) {
            throw new IllegalArgumentException("作废发票不能继续核销");
        }
        if (defaultDecimal(writeoff.getWriteoffAmount()).compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("核销金额必须大于0");
        }
        writeoff.setTenantId(resolveTenantId());
        writeoff.setWriteoffDate(writeoff.getWriteoffDate() == null ? LocalDate.now() : writeoff.getWriteoffDate());
        writeoff.setCreateBy(resolveUserName());
        writeoff.setCreateTime(LocalDateTime.now());
        invoiceWriteoffMapper.insert(writeoff);
        BigDecimal totalWriteoff = getWriteoffAmount(writeoff.getInvoiceId());
        invoice.setStatus(totalWriteoff.compareTo(defaultDecimal(invoice.getGrossAmount())) >= 0 ? "WRITEOFF_FULL" : "WRITEOFF_PARTIAL");
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(invoice);
        if (updated) {
            syncReceivableInvoiceStatus(invoice, totalWriteoff, writeoff.getWriteoffDate());
            syncRelatedBusinessStatus(invoice);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean voidInvoice(Long invoiceId, String remark) {
        OaInvoice invoice = requireInvoice(invoiceId);
        invoice.setStatus("VOID");
        invoice.setRemark(remark);
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(invoice);
        if (updated) {
            syncReceivableInvoiceStatus(invoice, BigDecimal.ZERO, null);
            syncRelatedBusinessStatus(invoice);
        }
        return updated;
    }

    @Override
    public List<OaInvoiceWriteoff> listWriteoffHistory(Long invoiceId) {
        requireInvoice(invoiceId);
        return invoiceWriteoffMapper.selectList(new LambdaQueryWrapper<OaInvoiceWriteoff>()
                .eq(OaInvoiceWriteoff::getInvoiceId, invoiceId)
                .orderByDesc(OaInvoiceWriteoff::getWriteoffDate)
                .orderByDesc(OaInvoiceWriteoff::getWriteoffId));
    }

    private void validateInvoice(OaInvoice invoice) {
        if (invoice == null) {
            throw new IllegalArgumentException("发票不能为空");
        }
        if (!StringUtils.hasText(invoice.getInvoiceDirection())) {
            throw new IllegalArgumentException("发票方向不能为空");
        }
        if (!StringUtils.hasText(invoice.getInvoiceCode()) || !StringUtils.hasText(invoice.getInvoiceNo())) {
            throw new IllegalArgumentException("发票代码和号码不能为空");
        }
        if (invoice.getGrossAmount() == null) {
            invoice.setGrossAmount(BigDecimal.ZERO);
        }
        if (invoice.getTaxAmount() == null) {
            invoice.setTaxAmount(BigDecimal.ZERO);
        }
    }

    private OaInvoice requireInvoice(Long invoiceId) {
        OaInvoice invoice = getById(invoiceId);
        if (invoice == null || !Integer.valueOf(0).equals(invoice.getDeleted())) {
            throw new IllegalArgumentException("发票不存在");
        }
        return invoice;
    }

    private BigDecimal getWriteoffAmount(Long invoiceId) {
        return invoiceWriteoffMapper.selectList(new LambdaQueryWrapper<OaInvoiceWriteoff>()
                        .eq(OaInvoiceWriteoff::getInvoiceId, invoiceId))
                .stream()
                .map(OaInvoiceWriteoff::getWriteoffAmount)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private void syncRelatedBusinessStatus(OaInvoice invoice) {
        if (invoice.getExpenseClaimId() != null) {
            updateExpenseInvoiceStatus(invoice.getExpenseClaimId());
        }
        if (invoice.getPaymentRequestId() != null) {
            updatePaymentInvoiceStatus(invoice.getPaymentRequestId());
        }
        if (invoice.getContractId() != null) {
            updateContractInvoiceStatus(invoice.getContractId());
        }
    }

    private void updateExpenseInvoiceStatus(Long expenseClaimId) {
        String status = aggregateInvoiceStatus(new LambdaQueryWrapper<OaInvoice>()
                .eq(OaInvoice::getExpenseClaimId, expenseClaimId)
                .eq(OaInvoice::getDeleted, "0"));
        LambdaUpdateWrapper<BizExpenseClaim> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizExpenseClaim::getId, expenseClaimId)
                .set(BizExpenseClaim::getInvoiceStatus, status)
                .set(BizExpenseClaim::getUpdateBy, resolveUserName())
                .set(BizExpenseClaim::getUpdateTime, LocalDateTime.now());
        expenseClaimMapper.update(null, wrapper);
    }

    private void updatePaymentInvoiceStatus(Long paymentRequestId) {
        String status = aggregateInvoiceStatus(new LambdaQueryWrapper<OaInvoice>()
                .eq(OaInvoice::getPaymentRequestId, paymentRequestId)
                .eq(OaInvoice::getDeleted, "0"));
        LambdaUpdateWrapper<BizPaymentRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPaymentRequest::getId, paymentRequestId)
                .set(BizPaymentRequest::getInvoiceStatus, status)
                .set(BizPaymentRequest::getUpdateBy, resolveUserName())
                .set(BizPaymentRequest::getUpdateTime, LocalDateTime.now());
        paymentRequestMapper.update(null, wrapper);
    }

    private void updateContractInvoiceStatus(Long contractId) {
        String status = aggregateInvoiceStatus(new LambdaQueryWrapper<OaInvoice>()
                .eq(OaInvoice::getContractId, contractId)
                .eq(OaInvoice::getDeleted, "0"));
        LambdaUpdateWrapper<OaContract> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaContract::getContractId, contractId)
                .set(OaContract::getInvoiceStatus, status)
                .set(OaContract::getUpdateBy, resolveUserName())
                .set(OaContract::getUpdateTime, LocalDateTime.now());
        contractMapper.update(null, wrapper);
    }

    private String aggregateInvoiceStatus(LambdaQueryWrapper<OaInvoice> wrapper) {
        List<OaInvoice> invoices = list(wrapper);
        if (invoices.isEmpty()) {
            return "NONE";
        }
        boolean allVoid = invoices.stream().allMatch(item -> "VOID".equals(item.getStatus()));
        if (allVoid) {
            return "VOID";
        }
        boolean allFull = invoices.stream().allMatch(item -> "WRITEOFF_FULL".equals(item.getStatus()));
        if (allFull) {
            return "WRITEOFF_FULL";
        }
        boolean anyWriteoff = invoices.stream().anyMatch(item -> "WRITEOFF_FULL".equals(item.getStatus()) || "WRITEOFF_PARTIAL".equals(item.getStatus()));
        if (anyWriteoff) {
            return "WRITEOFF_PARTIAL";
        }
        return "BOUND";
    }

    private void syncReceivableInvoiceStatus(OaInvoice invoice, BigDecimal totalWriteoffAmount, LocalDate writeoffDate) {
        if (invoice == null || invoice.getReceivableId() == null) {
            return;
        }
        try {
            RemoteCrmService.InvoiceStatusSyncRequest request = new RemoteCrmService.InvoiceStatusSyncRequest();
            request.setInvoiceId(invoice.getInvoiceId());
            request.setInvoiceStatus(invoice.getStatus());
            request.setGrossAmount(invoice.getGrossAmount());
            request.setTotalWriteoffAmount(totalWriteoffAmount == null ? BigDecimal.ZERO : totalWriteoffAmount);
            request.setWriteoffDate(writeoffDate);
            remoteCrmService.syncReceivableInvoiceStatus("true", "cloudflow-service-oa", invoice.getReceivableId(), request);
        } catch (Exception ignored) {
        }
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId();
    }

    private String resolveUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private BigDecimal defaultDecimal(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
