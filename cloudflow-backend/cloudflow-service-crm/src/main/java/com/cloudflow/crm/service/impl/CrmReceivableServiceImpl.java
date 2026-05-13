package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.ReceivableInvoiceSyncDTO;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmReceivableService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CrmReceivableServiceImpl extends CrmServiceSupport<CrmReceivableMapper, CrmReceivable>
        implements ICrmReceivableService {

    private final ICrmCustomerService customerService;
    private final RemoteOaService remoteOaService;

    @Override
    public PageResult<CrmReceivable> queryPage(CrmReceivable query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmReceivable> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmReceivable::getDelFlag, "0").orderByDesc(CrmReceivable::getUpdateTime);
        eqIfPresent(wrapper, CrmReceivable::getCustomerId, query.getCustomerId());
        eqIfPresent(wrapper, CrmReceivable::getContractId, query.getContractId());
        likeIfPresent(wrapper, CrmReceivable::getReceivableName, query.getReceivableName());
        eqIfPresent(wrapper, CrmReceivable::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createReceivable(CrmReceivable receivable) {
        fillBindingSnapshot(receivable);
        validate(receivable);
        if (!StringUtils.hasText(receivable.getReceivableNo())) {
            receivable.setReceivableNo(Localize.nextNo(CrmConstants.NoPrefix.RECEIVABLE));
        }
        if (receivable.getOwnerId() == null) {
            receivable.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(receivable.getOwnerName())) {
            receivable.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(receivable, currentTenantId(), currentUserName(), now());
        boolean saved = save(receivable);
        if (saved) {
            customerService.refreshHealth(receivable.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateReceivable(CrmReceivable receivable) {
        if (receivable == null || receivable.getReceivableId() == null) {
            throw new IllegalArgumentException("回款ID不能为空");
        }
        fillBindingSnapshot(receivable);
        validate(receivable);
        CrmReceivable persisted = requireById(receivable.getReceivableId(), "回款计划不存在");
        receivable.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(receivable.getReceivableNo())) {
            receivable.setReceivableNo(persisted.getReceivableNo());
        }
        if (receivable.getOwnerId() == null) {
            receivable.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(receivable.getOwnerName())) {
            receivable.setOwnerName(persisted.getOwnerName());
        }
        receivable.setUpdateBy(currentUserName());
        receivable.setUpdateTime(now());
        boolean updated = updateById(receivable);
        if (updated) {
            customerService.refreshHealth(receivable.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean confirmReceipt(Long receivableId) {
        CrmReceivable receivable = requireById(receivableId, "回款计划不存在");
        receivable.setReceivedAmount(receivable.getPlannedAmount());
        receivable.setOutstandingAmount(BigDecimal.ZERO);
        receivable.setReceivedDate(receivable.getReceivedDate() == null ? java.time.LocalDate.now() : receivable.getReceivedDate());
        receivable.setStatus(CrmConstants.ReceivableStatus.RECEIVED);
        receivable.setUpdateBy(currentUserName());
        receivable.setUpdateTime(now());
        boolean updated = updateById(receivable);
        if (updated) {
            customerService.refreshHealth(receivable.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean bindInvoice(Long receivableId, Long invoiceId) {
        CrmReceivable receivable = requireById(receivableId, "回款计划不存在");
        RemoteOaService.InvoiceBindRequest request = new RemoteOaService.InvoiceBindRequest();
        request.setReceivableId(receivableId);
        request.setCustomerId(receivable.getCustomerId());
        request.setCustomerName(receivable.getCustomerName());
        request.setContractId(receivable.getContractId());
        request.setContractNo(receivable.getContractNo());
        R<Void> result = remoteOaService.bindInvoice(invoiceId, request);
        if (result == null || !result.isSuccess()) {
            throw new IllegalArgumentException(result != null ? result.getMsg() : "绑定发票失败");
        }
        return true;
    }

    @Override
    public boolean syncInvoiceStatus(Long receivableId, ReceivableInvoiceSyncDTO syncDTO) {
        CrmReceivable receivable = requireById(receivableId, "回款计划不存在");
        if (!"0".equals(receivable.getDelFlag())) {
            throw new IllegalArgumentException("回款计划不存在");
        }

        String invoiceStatus = normalizeInvoiceStatus(syncDTO == null ? null : syncDTO.getInvoiceStatus());
        receivable.setInvoiceStatus(invoiceStatus);

        BigDecimal plannedAmount = zeroIfNull(receivable.getPlannedAmount());
        BigDecimal currentReceived = zeroIfNull(receivable.getReceivedAmount());
        BigDecimal syncedWriteoffAmount = zeroIfNull(syncDTO == null ? null : syncDTO.getTotalWriteoffAmount());
        LocalDate syncDate = syncDTO != null && syncDTO.getWriteoffDate() != null ? syncDTO.getWriteoffDate() : LocalDate.now();

        if ("WRITEOFF_FULL".equals(invoiceStatus)) {
            BigDecimal receivedAmount = plannedAmount.signum() > 0
                    ? plannedAmount.min(syncedWriteoffAmount.signum() > 0 ? syncedWriteoffAmount : plannedAmount)
                    : syncedWriteoffAmount;
            applyReceivableAmounts(receivable, receivedAmount, syncDate);
        } else if ("WRITEOFF_PARTIAL".equals(invoiceStatus)) {
            BigDecimal receivedAmount = currentReceived.max(plannedAmount.min(syncedWriteoffAmount));
            applyReceivableAmounts(receivable, receivedAmount, syncDate);
        } else {            applyReceivableAmounts(receivable, currentReceived, receivable.getReceivedDate());
        }

        receivable.setUpdateBy("oa-invoice-sync");
        receivable.setUpdateTime(now());
        boolean updated = updateById(receivable);
        if (updated) {
            customerService.refreshHealth(receivable.getCustomerId());
        }
        return updated;
    }

    @Override
    public List<CrmReceivableAgingBucketVO> getAgingBuckets() {
        Map<String, CrmReceivableAgingBucketVO> buckets = new LinkedHashMap<>();
        buckets.put("CURRENT", createBucket("CURRENT", "未逾期"));
        buckets.put("DUE_30", createBucket("DUE_30", "逾期1-30天"));
        buckets.put("DUE_60", createBucket("DUE_60", "逾期31-60天"));
        buckets.put("DUE_90", createBucket("DUE_90", "逾期61-90天"));
        buckets.put("DUE_90_PLUS", createBucket("DUE_90_PLUS", "逾期90天以上"));

        LocalDate today = LocalDate.now();
        List<CrmReceivable> receivables = list(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getDelFlag, "0")
                .orderByAsc(CrmReceivable::getDueDate));
        Map<String, java.util.Set<Long>> customerCounter = new LinkedHashMap<>();
        for (String key : buckets.keySet()) {
            customerCounter.put(key, new java.util.HashSet<>());
        }

        for (CrmReceivable item : receivables) {
            BigDecimal outstanding = zeroIfNull(item.getOutstandingAmount());
            if (outstanding.signum() <= 0) {
                continue;
            }
            String bucketCode = resolveAgingBucket(item.getDueDate(), today);
            CrmReceivableAgingBucketVO bucket = buckets.get(bucketCode);
            if (bucket == null) {
                continue;
            }
            bucket.setReceivableCount(bucket.getReceivableCount() + 1);
            bucket.setOutstandingAmount(bucket.getOutstandingAmount().add(outstanding));
            if (item.getCustomerId() != null) {
                customerCounter.get(bucketCode).add(item.getCustomerId());
            }
        }

        for (Map.Entry<String, CrmReceivableAgingBucketVO> entry : buckets.entrySet()) {
            entry.getValue().setCustomerCount(customerCounter.get(entry.getKey()).size());
        }
        return new ArrayList<>(buckets.values());
    }

    private void validate(CrmReceivable receivable) {
        if (receivable == null) {
            throw new IllegalArgumentException("回款计划不能为空");
        }
        if (receivable.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(receivable.getReceivableName())) {
            throw new IllegalArgumentException("回款名称不能为空");
        }
        if (receivable.getPlannedAmount() == null) {
            throw new IllegalArgumentException("计划回款金额不能为空");
        }
        if (receivable.getReceivedAmount() == null) {
            receivable.setReceivedAmount(BigDecimal.ZERO);
        }
        if (receivable.getOutstandingAmount() == null) {
            receivable.setOutstandingAmount(receivable.getPlannedAmount().subtract(receivable.getReceivedAmount()));
        }
        if (!StringUtils.hasText(receivable.getInvoiceStatus())) {
            receivable.setInvoiceStatus("NONE");
        }
        if (!StringUtils.hasText(receivable.getStatus())) {
            receivable.setStatus("PLANNED");
        }
    }

    private void applyReceivableAmounts(CrmReceivable receivable, BigDecimal receivedAmount, LocalDate receivedDate) {
        BigDecimal plannedAmount = zeroIfNull(receivable.getPlannedAmount());
        BigDecimal normalizedReceived = zeroIfNull(receivedAmount);
        if (plannedAmount.signum() > 0) {
            normalizedReceived = normalizedReceived.min(plannedAmount);
        }
        if (normalizedReceived.signum() < 0) {
            normalizedReceived = BigDecimal.ZERO;
        }

        BigDecimal outstandingAmount = plannedAmount.subtract(normalizedReceived);
        if (outstandingAmount.signum() < 0) {
            outstandingAmount = BigDecimal.ZERO;
        }

        receivable.setReceivedAmount(normalizedReceived);
        receivable.setOutstandingAmount(outstandingAmount);
        if (normalizedReceived.signum() > 0) {
            receivable.setReceivedDate(receivable.getReceivedDate() != null ? receivable.getReceivedDate() : receivedDate);
        }

        if (plannedAmount.signum() > 0 && outstandingAmount.signum() == 0) {
            receivable.setStatus("RECEIVED");
        } else if (normalizedReceived.signum() > 0) {
            receivable.setStatus("PARTIAL_RECEIVED");
        } else {
            receivable.setStatus("PLANNED");
        }
    }

    private BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String normalizeInvoiceStatus(String invoiceStatus) {
        return StringUtils.hasText(invoiceStatus) ? invoiceStatus : "NONE";
    }

    private CrmReceivableAgingBucketVO createBucket(String code, String name) {
        CrmReceivableAgingBucketVO bucket = new CrmReceivableAgingBucketVO();
        bucket.setBucketCode(code);
        bucket.setBucketName(name);
        bucket.setCustomerCount(0);
        bucket.setReceivableCount(0);
        bucket.setOutstandingAmount(BigDecimal.ZERO);
        return bucket;
    }

    private String resolveAgingBucket(LocalDate dueDate, LocalDate today) {
        if (dueDate == null || !dueDate.isBefore(today)) {
            return "CURRENT";
        }
        long overdueDays = ChronoUnit.DAYS.between(dueDate, today);
        if (overdueDays <= 30) {
            return "DUE_30";
        }
        if (overdueDays <= 60) {
            return "DUE_60";
        }
        if (overdueDays <= 90) {
            return "DUE_90";
        }
        return "DUE_90_PLUS";
    }

    private void fillBindingSnapshot(CrmReceivable receivable) {
        if (receivable == null) {
            return;
        }
        if (receivable.getContractId() != null) {
            try {
                R<RemoteOaService.ContractInfo> result = remoteOaService.getContract(receivable.getContractId());
                if (result != null && result.isSuccess() && result.getData() != null) {
                    RemoteOaService.ContractInfo contract = result.getData();
                    if (StringUtils.hasText(contract.getContractNo())) {
                        receivable.setContractNo(contract.getContractNo());
                    }
                    if (contract.getCustomerId() != null) {
                        receivable.setCustomerId(contract.getCustomerId());
                    }
                    if (StringUtils.hasText(contract.getCustomerName())) {
                        receivable.setCustomerName(contract.getCustomerName());
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (receivable.getCustomerId() != null && !StringUtils.hasText(receivable.getCustomerName())) {
            CrmCustomer customer = customerService.getById(receivable.getCustomerId());
            if (customer != null && "0".equals(customer.getDelFlag())) {
                receivable.setCustomerName(customer.getCustomerName());
            }
        }
    }
}
