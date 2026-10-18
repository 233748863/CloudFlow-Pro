package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.invoice.InvoiceReceiptSource;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.oa.domain.OaContractTeam;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaInvoiceWriteoff;
import com.cloudflow.oa.mapper.OaInvoiceReceiptMapper;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import com.cloudflow.oa.service.remote.RemoteCrmService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaInvoiceReceiptService {
    private final OaInvoiceReceiptMapper receipts;
    private final RemoteContractTeamDirectory directory;
    private final OutboxPublisher outbox;
    private final ObjectMapper json;
    private final RemoteCrmService crm;

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public OaInvoiceReceiptMapper.Receivable lock(Long id) {
        if (id == null) return null;
        if (id <= 0) throw invalid("回款计划ID无效");
        OaInvoiceReceiptMapper.Receivable record = receipts.lockReceivable(id, OaRecordSupport.tenantId());
        if (record != null && record.getContractId() != null) record.setCurrency(receipts.lockCurrency(record.getContractId(), OaRecordSupport.tenantId()));
        return verify(record);
    }

    public void summarize(OaInvoice invoice) {
        if (invoice.getReceivableId() == null) return;
        OaInvoiceReceiptMapper.Receivable record = verify(receipts.readReceivable(invoice.getReceivableId(), OaRecordSupport.tenantId()));
        BigDecimal pending = receipts.pendingAmount(record.getReceivableId(), record.getTenantId());
        BigDecimal received = OaRecordSupport.zero(record.getReceivedAmount()).add(pending);
        invoice.setReceivedAmount(received);
        invoice.setPendingReceivedAmount(pending);
        invoice.setOutstandingAmount(record.getPlannedAmount().min(invoice.getGrossAmount()).subtract(received).max(BigDecimal.ZERO));
        invoice.setCurrency(record.getCurrency());
        if (!"VOID".equals(invoice.getStatus())) invoice.setStatus(status(received, invoice.getGrossAmount()));
    }

    public BigDecimal projected(OaInvoiceReceiptMapper.Receivable record) {
        return OaRecordSupport.zero(record.getReceivedAmount()).add(receipts.pendingAmount(record.getReceivableId(), record.getTenantId()));
    }

    public void bind(OaInvoice invoice, OaInvoice binding, OaInvoiceReceiptMapper.Receivable record) {
        if (record == null) throw invalid("销项发票必须选择真实回款计划");
        if (!"OUTPUT".equals(invoice.getInvoiceDirection()) || binding.getExpenseClaimId() != null || binding.getPaymentRequestId() != null)
            throw invalid("回款计划只能绑定销项发票，且不能同时绑定其他业务");
        if (record.getInvoiceId() != null && !Objects.equals(record.getInvoiceId(), invoice.getInvoiceId())
                || receipts.boundInvoices(record.getReceivableId(), record.getTenantId()).stream().anyMatch(id -> !Objects.equals(id, invoice.getInvoiceId())))
            throw invalid("回款计划已绑定其他发票，不能直接覆盖");
        if (binding.getCustomerId() != null && !Objects.equals(binding.getCustomerId(), record.getCustomerId())
                || binding.getContractId() != null && !Objects.equals(binding.getContractId(), record.getContractId())
                || invoice.getCustomerId() != null && !Objects.equals(invoice.getCustomerId(), record.getCustomerId())
                || invoice.getContractId() != null && !Objects.equals(invoice.getContractId(), record.getContractId()))
            throw invalid("发票与回款计划的客户、合同必须一致");
        BigDecimal received = projected(record);
        if (received.compareTo(invoice.getGrossAmount()) > 0) throw invalid("发票金额小于该计划已有到账，请核对发票及回款计划");
        invoice.setReceivableId(record.getReceivableId());
        invoice.setCustomerId(record.getCustomerId()); invoice.setCustomerName(record.getCustomerName());
        invoice.setContractId(record.getContractId()); invoice.setContractNo(record.getContractNo());
        invoice.setStatus(status(received, invoice.getGrossAmount()));
    }

    public void validateReceipt(OaInvoice invoice, OaInvoiceWriteoff writeoff, OaInvoiceReceiptMapper.Receivable record) {
        if (!"CRM_RECEIVABLE".equals(writeoff.getBusinessType()) || !Objects.equals(writeoff.getBusinessId(), record.getReceivableId())
                || !Objects.equals(invoice.getReceivableId(), record.getReceivableId()))
            throw invalid("收款对象必须是本发票已绑定的回款计划");
        if (record.getInvoiceId() != null && !Objects.equals(record.getInvoiceId(), invoice.getInvoiceId()))
            throw invalid("回款计划的真实发票绑定不一致");
        if (!Objects.equals(invoice.getCustomerId(), record.getCustomerId()) || !Objects.equals(invoice.getContractId(), record.getContractId()))
            throw invalid("回款计划的客户或合同与发票不一致");
        BigDecimal after = projected(record).add(writeoff.getWriteoffAmount());
        if (after.compareTo(invoice.getGrossAmount()) > 0 || after.compareTo(record.getPlannedAmount()) > 0)
            throw invalid("本次收款超过剩余可登记金额，累计已包含绑定前历史到账");
        writeoff.setBusinessNo(record.getReceivableNo());
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void publish(OaInvoice invoice, OaInvoiceReceiptMapper.Receivable record, String operation,
            OaInvoiceWriteoff writeoff, BigDecimal receivedBefore) {
        if (record == null) return;
        InvoiceReceiptSource source = new InvoiceReceiptSource();
        source.setTenantId(record.getTenantId()); source.setOperation(operation);
        source.setInvoiceId(invoice.getInvoiceId()); source.setInvoiceVersion(invoice.getVersion());
        source.setReceivableId(record.getReceivableId()); source.setReceivableVersion(record.getVersion());
        source.setCustomerId(record.getCustomerId()); source.setContractId(record.getContractId());
        source.setCurrency(record.getCurrency()); source.setGrossAmount(invoice.getGrossAmount());
        source.setReceivedBefore(receivedBefore); source.setReceivedAfter(receivedBefore);
        source.setReceiptAmount(BigDecimal.ZERO); source.setOccurredTime(LocalDateTime.now().withNano(0));
        source.setReceiptDate(record.getReceivedDate()); source.setTeamVersion(0);
        if (writeoff != null) {
            source.setWriteoffId(writeoff.getWriteoffId()); source.setReceiptAmount(writeoff.getWriteoffAmount());
            source.setReceiptDate(writeoff.getWriteoffDate()); source.setReceivedAfter(receivedBefore.add(writeoff.getWriteoffAmount()));
            freezeTeam(source, record);
        }
        String payload;
        try { payload = json.writeValueAsString(source); }
        catch (Exception failure) { throw new IllegalStateException("发票收款来源无法持久化，操作未保存", failure); }
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(source.eventId()).tenantId(record.getTenantId())
                .sourceModule(InvoiceReceiptSource.SERVICE).sourceId(invoice.getInvoiceId()).eventType(InvoiceReceiptSource.EVENT)
                .occurredAt(source.getOccurredTime()).payload(payload).payloadDigest(InvoiceReceiptSource.digest(payload)).build();
        outbox.publishOnceAt(envelope, null);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                try {
                    RemoteCrmService.InvoiceStatusSyncRequest request = new RemoteCrmService.InvoiceStatusSyncRequest();
                    request.setEventId(envelope.getEventId());
                    R<Void> result = crm.syncReceivableInvoiceStatus("true", InvoiceReceiptSource.SERVICE, record.getReceivableId(), request);
                    if (result == null || !result.isSuccess()) log.warn("发票已保存，CRM待消费持久来源: eventId={}", envelope.getEventId());
                } catch (RuntimeException failure) {
                    log.warn("发票已保存，CRM待消费持久来源: eventId={}", envelope.getEventId(), failure);
                }
            }
        });
    }

    private void freezeTeam(InvoiceReceiptSource source, OaInvoiceReceiptMapper.Receivable record) {
        List<OaContractTeam> rows = new ArrayList<>(receipts.currentTeam(record.getReceivableId(), record.getTenantId()));
        if (rows.isEmpty()) {
            OaContractTeam owner = new OaContractTeam(); owner.setSalesUserId(record.getOwnerId());
            owner.setRoleType("OWNER"); owner.setAllocatedPercentage(BigDecimal.ONE); rows.add(owner);
        } else {
            Integer version = rows.get(0).getTeamVersion();
            if (version == null || version <= 0 || rows.stream().anyMatch(member -> !Objects.equals(version, member.getTeamVersion())))
                throw invalid("回款团队版本不完整，收款未保存");
            source.setTeamVersion(version);
        }
        List<Long> users = rows.stream().map(OaContractTeam::getSalesUserId).toList();
        if (users.isEmpty() || users.size() > 200 || users.stream().anyMatch(id -> id == null || id <= 0)
                || new HashSet<>(users).size() != users.size()) throw invalid("回款团队成员无效，收款未保存");
        R<List<RemoteContractTeamDirectory.Employee>> response = directory.employees(users.stream().sorted().toList());
        if (response == null || !response.isSuccess() || response.getData() == null) throw invalid("员工服务暂不可用，收款未保存");
        HashMap<Long, RemoteContractTeamDirectory.Employee> people = new HashMap<Long, RemoteContractTeamDirectory.Employee>();
        Set<Long> employees = new HashSet<>();
        for (RemoteContractTeamDirectory.Employee employee : response.getData()) {
            if (employee == null || !users.contains(employee.userId()) || !Objects.equals(record.getTenantId(), employee.tenantId())
                    || employee.employeeId() == null || employee.employeeId() <= 0 || !employees.add(employee.employeeId())
                    || employee.deptId() == null || employee.deptId() <= 0 || !employee.active() || !employee.userEnabled() || !employee.departmentEnabled()
                    || people.putIfAbsent(employee.userId(), employee) != null) throw invalid("回款团队成员须为本租户有效在职员工");
        }
        if (people.size() != users.size()) throw invalid("部分团队成员无法核实，收款未保存");
        for (OaContractTeam member : rows) {
            RemoteContractTeamDirectory.Employee employee = people.get(member.getSalesUserId()); member.setSalesUserName(employee.employeeName()); member.setDeptId(employee.deptId());
        }
        OaContractTeamPolicy.allocate(source.getReceiptAmount(), rows);
        if (rows.stream().filter(member -> "OWNER".equals(member.getRoleType())).count() != 1
                || rows.stream().noneMatch(member -> "OWNER".equals(member.getRoleType()) && Objects.equals(member.getSalesUserId(), record.getOwnerId())))
            throw invalid("回款团队主责与负责人不一致");
        source.setMembers(rows.stream().map(member -> new InvoiceReceiptSource.Member(member.getSalesUserId(),
                people.get(member.getSalesUserId()).employeeId(), member.getSalesUserName(), member.getDeptId(), member.getRoleType(),
                member.getAllocatedPercentage(), member.getCommissionRate())).toList());
    }

    public static String status(BigDecimal received, BigDecimal gross) {
        return received.signum() == 0 ? "BOUND" : received.compareTo(gross) >= 0 ? "WRITEOFF_FULL" : "WRITEOFF_PARTIAL";
    }

    private OaInvoiceReceiptMapper.Receivable verify(OaInvoiceReceiptMapper.Receivable record) {
        if (record == null || !Objects.equals(record.getTenantId(), OaRecordSupport.tenantId())) throw invalid("回款计划不存在或无权访问");
        if (!Set.of("PLANNED", "PARTIAL_RECEIVED", "RECEIVED").contains(record.getStatus() == null ? "" : record.getStatus()))
            throw invalid("回款计划当前状态不能绑定或登记收款");
        if (record.getVersion() == null || record.getVersion() < 0 || record.getVersion() == Integer.MAX_VALUE) throw invalid("回款计划版本无效");
        if (record.getCurrency() == null || !record.getCurrency().matches("[A-Z]{3}")) throw invalid("回款合同币种无法核实");
        BigDecimal planned = OaRecordSupport.decimal(record.getPlannedAmount(), 16, 2, false, "计划金额");
        BigDecimal received = OaRecordSupport.decimal(OaRecordSupport.zero(record.getReceivedAmount()), 16, 2, false, "已到账金额");
        if (received.compareTo(planned) > 0) throw invalid("已有到账超过回款计划，请核对原记录");
        return record;
    }

    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
}
