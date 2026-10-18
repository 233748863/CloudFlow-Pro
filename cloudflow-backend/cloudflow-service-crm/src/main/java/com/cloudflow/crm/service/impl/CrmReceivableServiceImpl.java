package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmReceivableWriteoffDTO;
import com.cloudflow.crm.domain.dto.ReceivableInvoiceSyncDTO;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.mapper.CrmDealTeamMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmReceivableService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmDealTeamStore;
import com.cloudflow.crm.service.deal.CrmReceivableTeamService;
import com.cloudflow.crm.service.receivable.CrmReceivableAccessService;
import com.cloudflow.crm.service.receivable.CrmReceivableAmounts;
import com.cloudflow.crm.service.receivable.CrmInvoiceReceiptService;
import com.cloudflow.crm.service.receivable.CrmReceivableReceiptService;
import com.cloudflow.crm.mapper.CrmInvoiceReceiptMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmReceivableServiceImpl extends CrmServiceSupport<CrmReceivableMapper, CrmReceivable>
        implements ICrmReceivableService {

    private static final String SCOPE_DEPT_COLUMN = "scope_dept_id";
    private static final String SCOPE_OWNER_COLUMN = "scope_owner_id";

    private final ICrmCustomerService crmCustomerService;
    private final RemoteOaService remoteOaService;
    private final SysDictHelper sysDictHelper;
    private final CrmEventPublisher crmEventPublisher;
    private final CrmReceivableAccessService access;
    private final CrmReceivableTeamService receivableTeams;
    private final CrmDealTeamStore teams;
    private final CrmDealTeamMapper teamRecords;
    private final CrmDealEventMapper events;
    private final CrmApprovalMapper approvals;
    private final CrmAuditTrail auditTrail;
    private final CrmInvoiceReceiptService invoiceReceipts;
    private final CrmInvoiceReceiptMapper invoiceSources;
    private final CrmReceivableReceiptService receiptFacts;

    @Override
    public PageResult<CrmReceivable> queryPage(CrmReceivable query, PageQuery pageQuery) {
        return PageResult.build(baseMapper.selectPageByDataScope(
                pageQuery.build(),
                query,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN)));
    }

    @Override
    public CrmReceivable getAccessibleReceivable(Long receivableId) {
        return access.read(receivableId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createReceivable(CrmReceivable receivable) {
        validate(receivable);
        validateNewSettlement(receivable);
        fillBindingSnapshot(receivable);
        if (!StringUtils.hasText(receivable.getReceivableNo())) {
            receivable.setReceivableNo(CrmConstants.NoPrefix.RECEIVABLE + IdUtils.simpleUUID());
        }
        receivable.setReceivableNo(CrmRecordSupport.text(receivable.getReceivableNo(), 50, "回款编号"));
        CrmReceivableTeamService.Initial initialTeam = receivableTeams.prepareCreate(receivable);
        CrmReceivableAmounts.apply(receivable, BigDecimal.ZERO, null);
        receivable.setInvoiceStatus(CrmConstants.InvoiceStatus.NONE);
        CrmRecordSupport.create(receivable, "receivableId");
        CrmRecordSupport.saved(baseMapper.insert(receivable));
        receivableTeams.initialize(receivable, initialTeam);
        crmCustomerService.refreshHealth(receivable.getCustomerId());
        return true;
    }

    @Override
    @Audit(name = "更新应收款")
    @Transactional(rollbackFor = Exception.class)
    public boolean updateReceivable(CrmReceivable receivable) {
        if (receivable == null || receivable.getReceivableId() == null) {
            throw new IllegalArgumentException("回款ID不能为空");
        }
        CrmReceivable persisted = access.lockOwned(receivable.getReceivableId());
        CrmReceivableAmounts.version(persisted, receivable.getVersion());
        CrmReceivableAmounts.active(persisted);
        validateProtectedSettlementFields(persisted, receivable);
        validate(receivable);
        boolean bindingChanged = !Objects.equals(persisted.getCustomerId(), receivable.getCustomerId())
                || !Objects.equals(persisted.getContractId(), receivable.getContractId());
        if (bindingChanged && hasHistory(persisted)) throw new IllegalArgumentException("回款计划已有业务记录，不能更换客户或合同");
        CrmReceivableTeamService.Initial initialTeam = null;
        Long previousCustomer = persisted.getCustomerId();
        if (bindingChanged) {
            fillBindingSnapshot(receivable);
            persisted.setCustomerId(receivable.getCustomerId());
            persisted.setCustomerName(receivable.getCustomerName());
            persisted.setContractId(receivable.getContractId());
            persisted.setContractNo(receivable.getContractNo());
            initialTeam = receivableTeams.prepareCreate(persisted);
        }
        BigDecimal received = CrmReceivableAmounts.received(persisted);
        if (receivable.getPlannedAmount().compareTo(received.add(invoiceSources.pendingAmount(persisted.getReceivableId(), persisted.getTenantId()))) < 0)
            throw new IllegalArgumentException("计划金额不能小于已到账及等待同步的真实发票收款");
        persisted.setReceivableName(receivable.getReceivableName());
        persisted.setPlannedAmount(receivable.getPlannedAmount());
        persisted.setDueDate(receivable.getDueDate());
        persisted.setRemark(receivable.getRemark());
        CrmReceivableAmounts.apply(persisted, received, persisted.getReceivedDate());
        CrmDealTeamStore.Current currentTeam = teams.inspect("RECEIVABLE", persisted.getReceivableId());
        if (!currentTeam.rows().isEmpty()) {
            CrmDealTeamStore.Snapshot snapshot = teams.lock("RECEIVABLE", persisted.getReceivableId(), persisted.getOwnerId(), currentTeam.version());
            teams.refreshPreview("RECEIVABLE", persisted.getReceivableId(), snapshot, persisted.getPlannedAmount());
        }
        CrmRecordSupport.touch(persisted);
        CrmRecordSupport.saved(baseMapper.writePlan(persisted, receivable.getVersion()));
        if (initialTeam != null) receivableTeams.initialize(persisted, initialTeam);
        crmCustomerService.refreshHealth(persisted.getCustomerId());
        if (!Objects.equals(previousCustomer, persisted.getCustomerId())) crmCustomerService.refreshHealth(previousCustomer);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "确认剩余回款到账", highRisk = true)
    public boolean confirmReceipt(Long receivableId, Integer version) {
        CrmReceivable receivable = access.lockInScope(receivableId);
        CrmReceivableAmounts.version(receivable, version);
        CrmReceivableAmounts.active(receivable);
        requireCrmReceiptEntry(receivable);
        BigDecimal remaining = CrmReceivableAmounts.remaining(receivable);
        if (remaining.signum() <= 0) {
            if (CrmReceivableAmounts.received(receivable).signum() == 0) throw new IllegalArgumentException("当前没有可确认的未收金额");
            return true;
        }
        receiptFacts.recordReceipt(receivable, remaining, LocalDate.now(), "CONFIRM", null);
        CrmReceivableAmounts.apply(receivable, receivable.getPlannedAmount(), LocalDate.now());
        saveSettlement(receivable);
        auditTrail.record("CRM_RECEIVABLE_CONFIRMED", "CRM_RECEIVABLE:" + receivableId,
                "本次到账=" + remaining.toPlainString() + ",原版本=" + version, true);
        publishReceivableConfirmed(receivable);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "核销本次实际回款", highRisk = true)
    public boolean writeoffReceivable(Long receivableId, CrmReceivableWriteoffDTO writeoffDTO) {
        CrmRecordSupport.require(writeoffDTO, "核销信息不能为空");
        CrmReceivable receivable = access.lockInScope(receivableId);
        CrmReceivableAmounts.version(receivable, writeoffDTO.getVersion());
        CrmReceivableAmounts.active(receivable);
        requireCrmReceiptEntry(receivable);
        BigDecimal writeoffAmount = CrmReceivableAmounts.positive(writeoffDTO.getAmount(), "核销金额");
        BigDecimal currentReceived = CrmReceivableAmounts.received(receivable);
        BigDecimal outstandingAmount = CrmReceivableAmounts.remaining(receivable);
        if (outstandingAmount.signum() <= 0) {
            throw new IllegalArgumentException("当前应收款已全部核销");
        }
        if (writeoffAmount.compareTo(outstandingAmount) > 0) {
            throw new IllegalArgumentException("核销金额不能超过剩余未收金额");
        }

        validateRemark(writeoffDTO.getRemark());
        LocalDate writeoffDate = CrmReceivableAmounts.date(writeoffDTO.getWriteoffDate());
        receiptFacts.recordReceipt(receivable, writeoffAmount, writeoffDate, "WRITEOFF", writeoffDTO.getRemark());
        CrmReceivableAmounts.apply(receivable, currentReceived.add(writeoffAmount), writeoffDate);
        saveSettlement(receivable);
        auditTrail.record("CRM_RECEIVABLE_WRITEOFF", "CRM_RECEIVABLE:" + receivableId,
                "本次到账=" + writeoffAmount.toPlainString() + ",日期=" + writeoffDate + ",原版本=" + writeoffDTO.getVersion()
                        + ",说明=" + (writeoffDTO.getRemark() == null ? "" : writeoffDTO.getRemark()), true);
        return true;
    }

    @Override
    public boolean bindInvoice(Long receivableId, Long invoiceId) {
        CrmReceivable receivable = getAccessibleReceivable(receivableId);
        if (invoiceId == null || invoiceId <= 0) throw new IllegalArgumentException("发票ID无效");
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
        CrmRecordSupport.require(syncDTO, "发票同步信息不能为空");
        return invoiceReceipts.synchronize(receivableId, syncDTO.getEventId());
    }

    @Override
    @Audit(name = "删除无业务历史的回款计划", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean removeReceivables(List<Long> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > 200 || ids.stream().anyMatch(id -> id == null || id <= 0))
            throw new IllegalArgumentException("请选择1至200条有效回款计划");
        for (Long id : ids.stream().distinct().sorted().toList()) {
            CrmReceivable record = access.lockInScope(id);
            CrmReceivableAmounts.version(record, record.getVersion());
            if (!"PLANNED".equals(record.getStatus()) || hasHistory(record))
                throw new IllegalArgumentException("回款计划已有业务记录，不能删除");
            CrmRecordSupport.touch(record);
            CrmRecordSupport.saved(baseMapper.deletePlan(record, record.getVersion()));
            crmCustomerService.refreshHealth(record.getCustomerId());
        }
        return true;
    }

    @Override
    public List<CrmReceivableAgingBucketVO> getAgingBuckets() {
        Map<String, CrmReceivableAgingBucketVO> buckets = new LinkedHashMap<>();
        buckets.put("CURRENT", createBucket("CURRENT", "未逾期"));
        // A6 治理：按字典动态生成档位桶
        List<SysDictHelper.DictItem> tiers = sysDictHelper.getDictData("crm_receivable_overdue_tier");
        if (tiers != null && !tiers.isEmpty()) {
            List<SysDictHelper.DictItem> sorted = CrmHealthCalculator.sortedTiers(tiers);
            for (SysDictHelper.DictItem item : sorted) {
                String code = CrmHealthCalculator.tierCodeOf(item, sorted);
                String name = item.getLabel() != null ? item.getLabel() : code;
                buckets.put(code, createBucket(code, name));
            }
        } else {
            buckets.put("DUE_30", createBucket("DUE_30", "逾期1-30天"));
            buckets.put("DUE_60", createBucket("DUE_60", "逾期31-60天"));
            buckets.put("DUE_90", createBucket("DUE_90", "逾期61-90天"));
            buckets.put("DUE_90_PLUS", createBucket("DUE_90_PLUS", "逾期90天以上"));
        }

        LocalDate today = LocalDate.now();
        List<CrmReceivable> receivables = baseMapper.selectPageByDataScope(
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, Long.MAX_VALUE),
                new CrmReceivable(),
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN)).getRecords();
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
        if (receivable.getCustomerId() == null || receivable.getCustomerId() <= 0) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        receivable.setReceivableName(CrmRecordSupport.text(receivable.getReceivableName(), 120, "回款名称"));
        receivable.setPlannedAmount(CrmDealPolicy.money(receivable.getPlannedAmount()));
        validateRemark(receivable.getRemark());
    }

    private void validateNewSettlement(CrmReceivable receivable) {
        if (receivable.getReceivableId() != null) throw new IllegalArgumentException("新增回款计划不能指定ID");
        if (receivable.getReceivedAmount() != null && receivable.getReceivedAmount().signum() != 0
                || receivable.getOutstandingAmount() != null && receivable.getOutstandingAmount().compareTo(receivable.getPlannedAmount()) != 0
                || receivable.getReceivedDate() != null || receivable.getInvoiceId() != null
                || StringUtils.hasText(receivable.getStatus()) && !"PLANNED".equals(receivable.getStatus())
                || StringUtils.hasText(receivable.getInvoiceStatus()) && !"NONE".equals(receivable.getInvoiceStatus()))
            throw new IllegalArgumentException("新增计划不能写入到账、退款或发票核销结果，请走专用流程");
    }

    private void validateRemark(String remark) {
        if (remark != null && remark.length() > 500) throw new IllegalArgumentException("回款说明最多500字符");
    }

    private boolean hasHistory(CrmReceivable record) {
        return CrmReceivableAmounts.received(record).signum() > 0 || record.getInvoiceId() != null
                || !invoiceSources.boundInvoices(record.getReceivableId(), record.getTenantId()).isEmpty()
                || !teamRecords.lockVersions("RECEIVABLE", record.getReceivableId()).isEmpty()
                || events.selectCount(new LambdaQueryWrapper<CrmDealEvent>().eq(CrmDealEvent::getBizType, "RECEIVABLE")
                        .eq(CrmDealEvent::getBizId, record.getReceivableId())) > 0
                || approvals.selectCount(new LambdaQueryWrapper<CrmApproval>().eq(CrmApproval::getBusinessRefType, "CRM_RECEIVABLE")
                        .eq(CrmApproval::getBusinessRefId, record.getReceivableId())) > 0;
    }

    private void requireCrmReceiptEntry(CrmReceivable receivable) {
        if (receivable.getInvoiceId() != null || !invoiceSources.boundInvoices(receivable.getReceivableId(), receivable.getTenantId()).isEmpty())
            throw new IllegalArgumentException("回款计划已绑定发票，请在发票页面登记实际收款；CRM只查看到账结果");
    }

    private void saveSettlement(CrmReceivable receivable) {
        CrmRecordSupport.touch(receivable);
        CrmRecordSupport.saved(baseMapper.writeSettlement(receivable, receivable.getVersion()));
        crmCustomerService.refreshHealth(receivable.getCustomerId());
    }

    private void validateProtectedSettlementFields(CrmReceivable persisted, CrmReceivable input) {
        if (persisted == null || input == null) {
            return;
        }
        if (input.getOwnerId() != null && !Objects.equals(input.getOwnerId(), persisted.getOwnerId())) {
            throw new IllegalArgumentException("回款负责人变更请走归属调整流程");
        }
        if (input.getReceivableNo() != null && !Objects.equals(input.getReceivableNo(), persisted.getReceivableNo()))
            throw new IllegalArgumentException("回款编号创建后不能修改");
        if (input.getReceivedAmount() != null && compareAmount(input.getReceivedAmount(), persisted.getReceivedAmount()) != 0) {
            throw new IllegalArgumentException("回款确认、核销或退款请走专用流程");
        }
        if (input.getOutstandingAmount() != null && compareAmount(input.getOutstandingAmount(), persisted.getOutstandingAmount()) != 0) {
            throw new IllegalArgumentException("回款确认、核销或退款请走专用流程");
        }
        if (input.getReceivedDate() != null && !Objects.equals(input.getReceivedDate(), persisted.getReceivedDate())) {
            throw new IllegalArgumentException("回款确认、核销或退款请走专用流程");
        }
        if (StringUtils.hasText(input.getStatus()) && !Objects.equals(input.getStatus(), persisted.getStatus())) {
            throw new IllegalArgumentException("回款确认、核销或退款请走专用流程");
        }
        if (StringUtils.hasText(input.getInvoiceStatus()) && !Objects.equals(input.getInvoiceStatus(), persisted.getInvoiceStatus())) {
            throw new IllegalArgumentException("发票状态请通过开票/核销链路同步");
        }
        if (input.getInvoiceId() != null && !Objects.equals(input.getInvoiceId(), persisted.getInvoiceId())) {
            throw new IllegalArgumentException("发票绑定请使用绑定发票操作");
        }
    }

    private int compareAmount(BigDecimal left, BigDecimal right) {
        return zeroIfNull(left).compareTo(zeroIfNull(right));
    }

    private void publishReceivableConfirmed(CrmReceivable receivable) {
        Long tenantId = receivable.getTenantId();
        String customerName = receivable.getCustomerName();
        if ((!StringUtils.hasText(customerName) || tenantId == null) && receivable.getCustomerId() != null) {
            CrmCustomer customer = crmCustomerService.getAccessibleCustomer(receivable.getCustomerId());
            if (!StringUtils.hasText(customerName)) {
                customerName = customer.getCustomerName();
            }
            if (tenantId == null) {
                tenantId = customer.getTenantId();
            }
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("receivableId", receivable.getReceivableId());
        fields.put("receivableNo", receivable.getReceivableNo());
        fields.put("receivableName", receivable.getReceivableName());
        fields.put("customerId", receivable.getCustomerId());
        fields.put("customerName", customerName);
        fields.put("contractId", receivable.getContractId());
        fields.put("contractNo", receivable.getContractNo());
        fields.put("invoiceId", receivable.getInvoiceId());
        fields.put("plannedAmount", receivable.getPlannedAmount());
        fields.put("receivedAmount", receivable.getReceivedAmount());
        fields.put("receivedDate", receivable.getReceivedDate());
        Long eventTenant = tenantId != null ? tenantId : UserContext.getTenantId();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                try { crmEventPublisher.publish(CrmEventStreamConstants.EVENT_RECEIVABLE_CONFIRMED, eventTenant, fields); }
                catch (Exception failure) { log.error("回款已提交，发票绑定通知失败: receivableId={}", receivable.getReceivableId(), failure); }
            }
        });
    }

    private BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
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
        return CrmHealthCalculator.resolveAgingBucket(dueDate, today, sysDictHelper);
    }

    private void fillBindingSnapshot(CrmReceivable receivable) {
        CrmCustomer customer = crmCustomerService.getAccessibleCustomer(receivable.getCustomerId());
        if (!Objects.equals(customer.getTenantId(), CrmRecordSupport.tenantId())) throw new IllegalArgumentException("客户不存在或无权访问");
        receivable.setCustomerName(customer.getCustomerName());
        if (receivable.getContractId() != null) {
            if (receivable.getContractId() <= 0) throw new IllegalArgumentException("合同ID无效");
            R<RemoteOaService.ContractInfo> result;
            try {
                result = remoteOaService.getContract(receivable.getContractId());
            } catch (Exception unavailable) {
                throw new ServiceException("合同服务暂不可用，回款计划未保存", 503);
            }
            if (result == null || !result.isSuccess() || result.getData() == null)
                throw new ServiceException("合同服务暂不可用或合同不可访问，回款计划未保存", 503);
            RemoteOaService.ContractInfo contract = result.getData();
            if (!Objects.equals(contract.getContractId(), receivable.getContractId()) || !Objects.equals(contract.getCustomerId(), customer.getCustomerId()))
                throw new IllegalArgumentException("合同与回款计划必须属于同一客户");
            receivable.setContractNo(CrmRecordSupport.text(contract.getContractNo(), 50, "合同编号"));
        } else receivable.setContractNo(null);
    }
}
