package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
import com.cloudflow.oa.mapper.OaInvoiceReceiptMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.event.InvoiceWriteoffEvent;
import com.cloudflow.oa.event.InvoiceVoidEvent;
import com.cloudflow.oa.event.InvoiceBoundEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaInvoiceServiceImpl extends ServiceImpl<OaInvoiceMapper, OaInvoice> implements IOaInvoiceService {

    private final OaInvoiceWriteoffMapper invoiceWriteoffMapper;
    private final BizExpenseClaimMapper expenseClaimMapper;
    private final BizPaymentRequestMapper paymentRequestMapper;
    private final OaContractMapper contractMapper;
    private final OaInvoiceReceiptService receipts;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;
    private final OaProjectAccountingService projectAccounting;

    @Override
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public PageResult<OaInvoice> queryPage(OaInvoice query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaInvoice> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaInvoice::getDeleted, "0").orderByDesc(OaInvoice::getUpdateTime);
        if (StringUtils.hasText(query.getInvoiceDirection())) {
            wrapper.eq(OaInvoice::getInvoiceDirection, query.getInvoiceDirection());
        }
        if (StringUtils.hasText(query.getKeyword())) {
            wrapper.and((LambdaQueryWrapper<OaInvoice> matches) -> matches
                    .like(OaInvoice::getInvoiceCode, query.getKeyword())
                    .or().like(OaInvoice::getInvoiceNo, query.getKeyword()));
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
        Page<OaInvoice> result = page(pageQuery.build(), wrapper);
        result.getRecords().forEach(this::summarize);
        return PageResult.build(result);
    }

    @Override
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public OaInvoice getInvoiceInfo(Long invoiceId) {
        OaInvoice invoice = requireInvoice(invoiceId);
        summarize(invoice);
        return invoice;
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean createInvoice(OaInvoice invoice) {
        validateInvoice(invoice);
        if (invoice.getInvoiceId() != null || invoice.getReceivableId() != null
                || StringUtils.hasText(invoice.getStatus()) && !"REGISTERED".equals(invoice.getStatus()))
            throw new IllegalArgumentException("新增发票不能指定ID、回款绑定或核销结果，请使用专用操作");
        LocalDateTime now = LocalDateTime.now();
        invoice.setTenantId(resolveTenantId());
        invoice.setStatus(StringUtils.hasText(invoice.getStatus()) ? invoice.getStatus() : "REGISTERED");
        invoice.setDeleted(0);
        invoice.setVersion(0);
        invoice.setCreateBy(resolveUserName());
        invoice.setCreateTime(now);
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(now);
        boolean saved = save(invoice);
        if (saved) projectAccounting.refreshContract(invoice.getContractId());
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "更新发票", diff = true, highRisk = true)
    public boolean updateInvoice(OaInvoice invoice) {
        if (invoice == null || invoice.getInvoiceId() == null) {
            throw new IllegalArgumentException("发票ID不能为空");
        }
        Locked locked = lockInvoice(invoice.getInvoiceId());
        OaInvoice previous = locked.invoice();
        requireVersion(previous, invoice.getVersion());
        validateInvoice(invoice);
        if (locked.receivable() != null && !"VOID".equals(previous.getStatus()))
            previous.setStatus(OaInvoiceReceiptService.status(receipts.projected(locked.receivable()), previous.getGrossAmount()));
        if (invoice.getReceivableId() != null && !Objects.equals(invoice.getReceivableId(), previous.getReceivableId())
                || invoice.getExpenseClaimId() != null && !Objects.equals(invoice.getExpenseClaimId(), previous.getExpenseClaimId())
                || invoice.getPaymentRequestId() != null && !Objects.equals(invoice.getPaymentRequestId(), previous.getPaymentRequestId())
                || invoice.getStatus() != null && !Objects.equals(invoice.getStatus(), previous.getStatus()))
            throw new IllegalArgumentException("发票绑定、核销或作废结果不能通过普通编辑修改");
        if (previous.getReceivableId() != null || getWriteoffAmount(previous.getInvoiceId()).signum() > 0) {
            if (invoice.getGrossAmount().compareTo(previous.getGrossAmount()) != 0 || !Objects.equals(invoice.getInvoiceDirection(), previous.getInvoiceDirection())
                    || invoice.getCustomerId() != null && !Objects.equals(invoice.getCustomerId(), previous.getCustomerId())
                    || invoice.getContractId() != null && !Objects.equals(invoice.getContractId(), previous.getContractId()))
                throw new IllegalArgumentException("发票已有绑定或收款，不能更改金额、方向、客户或合同");
            invoice.setCustomerId(previous.getCustomerId()); invoice.setCustomerName(previous.getCustomerName());
            invoice.setContractId(previous.getContractId()); invoice.setContractNo(previous.getContractNo());
        }
        invoice.setReceivableId(previous.getReceivableId()); invoice.setExpenseClaimId(previous.getExpenseClaimId());
        invoice.setPaymentRequestId(previous.getPaymentRequestId()); invoice.setStatus(previous.getStatus());
        OaRecordSupport.update(invoice, previous);
        Long previousContractId = previous.getContractId();
        boolean updated = updateById(invoice);
        OaRecordSupport.saved(updated ? 1 : 0);
        if (updated) { projectAccounting.refreshContract(previousContractId); if (!java.util.Objects.equals(previousContractId, invoice.getContractId())) projectAccounting.refreshContract(invoice.getContractId()); }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean bindInvoice(Long invoiceId, OaInvoice binding) {
        if (binding == null) throw new IllegalArgumentException("绑定信息不能为空");
        OaInvoice observed = requireInvoice(invoiceId);
        if (observed.getReceivableId() != null && !Objects.equals(observed.getReceivableId(), binding.getReceivableId()))
            throw new IllegalArgumentException("发票已绑定回款计划，不能直接更换或解除绑定");
        OaInvoiceReceiptMapper.Receivable receivable = receipts.lock(binding.getReceivableId());
        OaInvoice invoice = OaRecordSupport.active(baseMapper.lockById(invoiceId, resolveTenantId()));
        if ("VOID".equals(invoice.getStatus())) {
            throw new IllegalArgumentException("作废发票不能绑定业务单据");
        }
        if (invoice.getReceivableId() != null && !Objects.equals(invoice.getReceivableId(), binding.getReceivableId()))
            throw new IllegalArgumentException("发票已绑定其他回款计划");
        if (receivable != null && Objects.equals(invoice.getReceivableId(), binding.getReceivableId())) return true;
        if (getWriteoffAmount(invoiceId).signum() > 0) throw new IllegalArgumentException("发票已有核销记录，不能更换业务绑定");
        Long previousContractId = invoice.getContractId();
        BigDecimal receivedBefore = receivable == null ? BigDecimal.ZERO : receipts.projected(receivable);
        if (receivable != null || "OUTPUT".equals(invoice.getInvoiceDirection())) receipts.bind(invoice, binding, receivable);
        else {
            invoice.setCustomerId(binding.getCustomerId()); invoice.setCustomerName(binding.getCustomerName());
            invoice.setContractId(binding.getContractId()); invoice.setContractNo(binding.getContractNo());
            invoice.setExpenseClaimId(binding.getExpenseClaimId()); invoice.setPaymentRequestId(binding.getPaymentRequestId());
        }
        if ("REGISTERED".equals(invoice.getStatus())) {
            invoice.setStatus("BOUND");
        }
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(invoice);
        OaRecordSupport.saved(updated ? 1 : 0);
        if (updated) {
            receipts.publish(invoice, receivable, "BOUND", null, receivedBefore);
            syncRelatedBusinessStatus(invoice);

            // M1-7: 发布事件到 Outbox
            projectAccounting.refreshContract(previousContractId);
            if (!java.util.Objects.equals(previousContractId, invoice.getContractId())) projectAccounting.refreshContract(invoice.getContractId());
            InvoiceBoundEvent event = new InvoiceBoundEvent();
            event.setInvoiceId(invoice.getInvoiceId());
            event.setInvoiceCode(invoice.getInvoiceCode());
            event.setInvoiceNo(invoice.getInvoiceNo());
            event.setInvoiceDirection(invoice.getInvoiceDirection());
            event.setGrossAmount(invoice.getGrossAmount());
            event.setCustomerId(invoice.getCustomerId());
            event.setCustomerName(invoice.getCustomerName());
            event.setContractId(invoice.getContractId());
            event.setContractNo(invoice.getContractNo());
            event.setExpenseClaimId(invoice.getExpenseClaimId());
            event.setPaymentRequestId(invoice.getPaymentRequestId());
            event.setBoundAt(LocalDateTime.now());

            try {
                BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                        .eventType("INVOICE_BOUND")
                        .sourceModule("cloudflow-oa")
                        .sourceId(invoice.getInvoiceId())
                        .payload(objectMapper.writeValueAsString(event))
                        .build();
                outboxPublisher.publish(envelope);
            } catch (Exception failure) {
                throw new IllegalStateException("发票绑定事件保存失败，操作已回滚", failure);
            }
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean writeoffInvoice(OaInvoiceWriteoff writeoff) {
        if (writeoff == null || writeoff.getInvoiceId() == null || writeoff.getWriteoffAmount() == null) {
            throw new IllegalArgumentException("核销信息不完整");
        }
        Locked locked = lockInvoice(writeoff.getInvoiceId());
        OaInvoice invoice = locked.invoice();
        requireVersion(invoice, writeoff.getInvoiceVersion());
        if ("VOID".equals(invoice.getStatus())) {
            throw new IllegalArgumentException("作废发票不能继续核销");
        }
        if (defaultDecimal(writeoff.getWriteoffAmount()).compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("核销金额必须大于0");
        }
        writeoff.setWriteoffAmount(OaRecordSupport.decimal(writeoff.getWriteoffAmount(), 18, 2, false, "本次核销金额"));
        if (writeoff.getWriteoffId() != null) throw new IllegalArgumentException("新增核销不能指定记录ID");
        if (writeoff.getRemark() != null && writeoff.getRemark().length() > 500) throw new IllegalArgumentException("收款说明最多500字符");
        if (writeoff.getWriteoffDate() != null && writeoff.getWriteoffDate().isAfter(LocalDate.now())) throw new IllegalArgumentException("实际收款日期不能晚于今天");
        BigDecimal receivedBefore = locked.receivable() == null ? getWriteoffAmount(invoice.getInvoiceId()) : receipts.projected(locked.receivable());
        if (locked.receivable() != null) receipts.validateReceipt(invoice, writeoff, locked.receivable());
        else {
            if ("OUTPUT".equals(invoice.getInvoiceDirection()) || "CRM_RECEIVABLE".equals(writeoff.getBusinessType()))
                throw new IllegalArgumentException("请先绑定真实回款计划，再登记收款");
            Long target = "PAYMENT_REQUEST".equals(writeoff.getBusinessType()) ? invoice.getPaymentRequestId()
                    : "EXPENSE_CLAIM".equals(writeoff.getBusinessType()) ? invoice.getExpenseClaimId() : null;
            if (target == null || !Objects.equals(target, writeoff.getBusinessId())) throw new IllegalArgumentException("核销对象必须是发票已绑定的业务");
            if (receivedBefore.add(writeoff.getWriteoffAmount()).compareTo(invoice.getGrossAmount()) > 0)
                throw new IllegalArgumentException("核销金额超过发票剩余金额");
        }
        writeoff.setTenantId(resolveTenantId());
        writeoff.setWriteoffDate(writeoff.getWriteoffDate() == null ? LocalDate.now() : writeoff.getWriteoffDate());
        writeoff.setCreateBy(resolveUserName());
        writeoff.setCreateTime(LocalDateTime.now());
        OaRecordSupport.saved(invoiceWriteoffMapper.insert(writeoff));
        BigDecimal totalWriteoff = receivedBefore.add(writeoff.getWriteoffAmount());
        invoice.setStatus(totalWriteoff.compareTo(defaultDecimal(invoice.getGrossAmount())) >= 0 ? "WRITEOFF_FULL" : "WRITEOFF_PARTIAL");
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(invoice);
        OaRecordSupport.saved(updated ? 1 : 0);
        if (updated) {
            receipts.publish(invoice, locked.receivable(), "RECEIPT", writeoff, receivedBefore);
            syncRelatedBusinessStatus(invoice);

            // M1-7: 发布事件到 Outbox
            InvoiceWriteoffEvent event = new InvoiceWriteoffEvent();
            event.setInvoiceId(invoice.getInvoiceId());
            event.setInvoiceCode(invoice.getInvoiceCode());
            event.setInvoiceNo(invoice.getInvoiceNo());
            event.setInvoiceDirection(invoice.getInvoiceDirection());
            event.setGrossAmount(invoice.getGrossAmount());
            event.setWriteoffAmount(writeoff.getWriteoffAmount());
            event.setTotalWriteoffAmount(totalWriteoff);
            event.setStatus(invoice.getStatus());
            event.setWriteoffDate(writeoff.getWriteoffDate());
            event.setCustomerId(invoice.getCustomerId());
            event.setContractId(invoice.getContractId());
            event.setWriteoffAt(LocalDateTime.now());

            try {
                BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                        .eventType("INVOICE_WRITEOFF")
                        .sourceModule("cloudflow-oa")
                        .sourceId(invoice.getInvoiceId())
                        .payload(objectMapper.writeValueAsString(event))
                        .build();
                outboxPublisher.publish(envelope);
            } catch (Exception failure) {
                throw new IllegalStateException("发票收款事件保存失败，操作已回滚", failure);
            }
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean voidInvoice(Long invoiceId, String remark) {
        Locked locked = lockInvoice(invoiceId);
        OaInvoice invoice = locked.invoice();
        if ("VOID".equals(invoice.getStatus())) return true;
        BigDecimal receivedBefore = locked.receivable() == null ? getWriteoffAmount(invoiceId) : receipts.projected(locked.receivable());
        invoice.setStatus("VOID");
        invoice.setRemark(remark);
        invoice.setUpdateBy(resolveUserName());
        invoice.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(invoice);
        OaRecordSupport.saved(updated ? 1 : 0);
        if (updated) {
            receipts.publish(invoice, locked.receivable(), "VOID", null, receivedBefore);
            syncRelatedBusinessStatus(invoice);

            // M1-7: 发布事件到 Outbox
            projectAccounting.refreshContract(invoice.getContractId());
            InvoiceVoidEvent event = new InvoiceVoidEvent();
            event.setInvoiceId(invoice.getInvoiceId());
            event.setInvoiceCode(invoice.getInvoiceCode());
            event.setInvoiceNo(invoice.getInvoiceNo());
            event.setInvoiceDirection(invoice.getInvoiceDirection());
            event.setGrossAmount(invoice.getGrossAmount());
            event.setRemark(remark);
            event.setCustomerId(invoice.getCustomerId());
            event.setContractId(invoice.getContractId());
            event.setVoidAt(LocalDateTime.now());

            try {
                BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                        .eventType("INVOICE_VOID")
                        .sourceModule("cloudflow-oa")
                        .sourceId(invoice.getInvoiceId())
                        .payload(objectMapper.writeValueAsString(event))
                        .build();
                outboxPublisher.publish(envelope);
            } catch (Exception failure) {
                throw new IllegalStateException("发票作废事件保存失败，操作已回滚", failure);
            }
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

    @Override
    @Audit(name = "删除无绑定及收款的发票", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean removeInvoices(List<Long> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > 200 || ids.stream().anyMatch(id -> id == null || id <= 0))
            throw new IllegalArgumentException("请选择1至200条发票");
        for (Long id : ids.stream().distinct().sorted().toList()) {
            OaInvoice invoice = lockInvoice(id).invoice();
            if (!"REGISTERED".equals(invoice.getStatus()) || invoice.getReceivableId() != null || invoice.getExpenseClaimId() != null
                    || invoice.getPaymentRequestId() != null || getWriteoffAmount(id).signum() > 0)
                throw new IllegalArgumentException("发票已有绑定或收款，不能删除");
            OaRecordSupport.touch(invoice); OaRecordSupport.saved(baseMapper.removeLocked(invoice));
        }
        return true;
    }

    private void validateInvoice(OaInvoice invoice) {
        if (invoice == null) {
            throw new IllegalArgumentException("发票不能为空");
        }
        if (!Set.of("INPUT", "OUTPUT").contains(invoice.getInvoiceDirection() == null ? "" : invoice.getInvoiceDirection())) {
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
        invoice.setGrossAmount(OaRecordSupport.decimal(invoice.getGrossAmount(), 18, 2, false, "发票金额"));
        invoice.setTaxAmount(OaRecordSupport.decimal(invoice.getTaxAmount(), 18, 2, false, "税额"));
    }

    private OaInvoice requireInvoice(Long invoiceId) {
        OaInvoice invoice = getById(invoiceId);
        if (invoice == null || !Integer.valueOf(0).equals(invoice.getDeleted())) {
            throw new IllegalArgumentException("发票不存在");
        }
        return invoice;
    }

    private record Locked(OaInvoice invoice, OaInvoiceReceiptMapper.Receivable receivable) { }

    private Locked lockInvoice(Long invoiceId) {
        OaInvoice observed = requireInvoice(invoiceId);
        OaInvoiceReceiptMapper.Receivable record = receipts.lock(observed.getReceivableId());
        OaInvoice invoice = OaRecordSupport.active(baseMapper.lockById(invoiceId, resolveTenantId()));
        if (!Objects.equals(observed.getReceivableId(), invoice.getReceivableId())) throw new IllegalArgumentException("发票绑定已改变，请刷新核对后重试");
        if (invoice.getVersion() == null || invoice.getVersion() < 0 || invoice.getVersion() == Integer.MAX_VALUE)
            throw new IllegalArgumentException("发票版本无效");
        return new Locked(invoice, record);
    }

    private void requireVersion(OaInvoice invoice, Integer expected) {
        if (expected == null || !Objects.equals(expected, invoice.getVersion())) throw new IllegalArgumentException("发票已被修改，请刷新核对后重试");
    }

    private void summarize(OaInvoice invoice) {
        if (invoice.getReceivableId() != null) receipts.summarize(invoice);
        else {
            BigDecimal amount = getWriteoffAmount(invoice.getInvoiceId());
            invoice.setReceivedAmount(amount); invoice.setOutstandingAmount(invoice.getGrossAmount().subtract(amount).max(BigDecimal.ZERO));
            invoice.setPendingReceivedAmount(BigDecimal.ZERO); invoice.setCurrency("CNY");
        }
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
