package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec.Decoded;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractTeam;
import com.cloudflow.oa.domain.dto.ContractStartDateDTO;
import com.cloudflow.oa.domain.vo.OaContractPerformanceView;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaContractPerformanceMapper;
import com.cloudflow.oa.mapper.OaContractTeamMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaContractPerformanceService {
    private static final Set<String> APPROVED = Set.of("APPROVED", "SEALING", "SEALED", "ACTIVE");
    private final OaContractMapper contracts;
    private final OaContractTeamMapper teams;
    private final OaContractPerformanceMapper sources;
    private final RemoteContractTeamDirectory directory;
    private final OutboxPublisher publisher;
    private final ObjectMapper json;
    private final PlatformTransactionManager transactionManager;
    private final IOaTraceEventService trace;

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public OaContractPerformanceView read(Long id) { return view(lockAccessible(id)); }

    @Audit(name = "补齐合同开始日期", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public OaContractPerformanceView completeStartDate(Long id, ContractStartDateDTO request) {
        OaContract contract = lockAccessible(id);
        DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        if (request == null || request.version() == null || !Objects.equals(request.version(), contract.getVersion()))
            throw invalid("合同已被修改，请先核对最新记录");
        if (contract.getStartDate() != null) throw invalid("开始日期已填写，不能通过补填入口修改");
        if (!APPROVED.contains(safe(contract.getStatus())) || !Integer.valueOf(1).equals(contract.getSignedFlag()))
            throw invalid("仅已审批签署且缺少开始日期的合同可补填，其他合同请在编辑页填写");
        if (request.startDate() == null || contract.getEndDate() != null && request.startDate().isAfter(contract.getEndDate()))
            throw invalid("开始日期不能为空且不能晚于合同结束日期");
        if (Integer.valueOf(Integer.MAX_VALUE).equals(contract.getVersion())) throw invalid("合同版本已达到上限");
        contract.setStartDate(request.startDate()); OaRecordSupport.touch(contract);
        OaRecordSupport.saved(sources.completeStartDate(contract));
        trace.record(contract.getTenantId(), "CONTRACT", id, "CONTRACT", id, "CONTRACT_START_DATE_COMPLETED",
                "补齐合同开始日期", request.startDate().toString(), UserContext.getUserId(), OaRecordSupport.userName(), null);
        synchronizeLocked(id);
        return view(OaRecordSupport.active(contracts.selectForUpdate(id, contract.getTenantId())));
    }

    @Audit(name = "确认合同销售业绩来源", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public boolean synchronize(Long id) { return synchronizeLocked(id); }

    @Audit(name = "扫描已到开始日期的合同业绩")
    public int scanDue() {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
        long afterId = 0L;
        int confirmed = 0, failed = 0;
        List<Long> batch;
        do {
            batch = sources.dueContracts(OaRecordSupport.tenantId(), afterId, LocalDate.now(), 200);
            for (Long id : batch) {
                afterId = id;
                try { if (Boolean.TRUE.equals(transaction.execute(status -> synchronizeLocked(id)))) confirmed++; }
                catch (RuntimeException failure) {
                    failed++;
                    log.error("合同业绩确认失败，等待后续扫描重试，tenantId={}, contractId={}", OaRecordSupport.tenantId(), id, failure);
                }
            }
        } while (batch.size() == 200);
        if (failed > 0) throw new IllegalStateException("合同业绩扫描存在失败，已确认=" + confirmed + "，失败=" + failed);
        return confirmed;
    }

    private boolean synchronizeLocked(Long id) {
        OaContract contract = OaRecordSupport.active(contracts.selectForUpdate(id, OaRecordSupport.tenantId()));
        Decoded previous = latest(contract);
        if (previous != null) assertImmutable(contract, previous.source());
        boolean reversed = previous != null && "REVERSE".equals(previous.source().getOperation());
        if (reversed) return false;
        boolean terminal = Set.of("CANCELLED", "TERMINATED").contains(safe(contract.getStatus()));
        if ("EXPIRED".equals(contract.getStatus())) return false;
        LocalDateTime approvedTime = previous == null ? sources.approvedTime(contract) : previous.source().getApprovedTime();
        if (!terminal && !"READY".equals(gate(contract, approvedTime))) return false;
        if (previous == null && terminal) return false;
        if (previous != null && !terminal && contract.getAmount().compareTo(previous.source().getAmount()) == 0) return false;
        ContractPerformanceSource source = previous == null ? initial(contract, approvedTime)
                : json.convertValue(previous.source(), ContractPerformanceSource.class);
        source.setContractVersion(contract.getVersion()); source.setContractStatus(contract.getStatus());
        source.setOccurredTime(LocalDateTime.now().withNano(0));
        if (previous != null) {
            if (previous.source().getRevision() == Integer.MAX_VALUE) throw invalid("合同业绩来源版本已达到上限");
            source.setRevision(previous.source().getRevision() + 1);
            source.setOperation(terminal ? "REVERSE" : "CORRECT");
            source.setPreviousEventId(previous.envelope().getEventId()); source.setPreviousDigest(previous.envelope().getPayloadDigest());
            if (!terminal) source.setAmount(OaContractTeamPolicy.money(contract.getAmount()));
        }
        BusinessEventEnvelope envelope = ContractPerformanceSourceCodec.encode(source, json);
        if (previous != null) ContractPerformanceSourceCodec.transition(previous, new Decoded(envelope, source), json);
        publisher.publish(envelope);
        return true;
    }

    private ContractPerformanceSource initial(OaContract contract, LocalDateTime approvedTime) {
        if (!sources.customerExists(contract.getCustomerId(), contract.getTenantId())) throw invalid("合同关联客户不存在或不属于本租户，不能确认销售业绩");
        ContractPerformanceSource source = new ContractPerformanceSource();
        source.setTenantId(contract.getTenantId()); source.setContractId(contract.getContractId());
        source.setRevision(1); source.setOperation("CONFIRM"); source.setCustomerId(contract.getCustomerId());
        source.setContractType(contract.getContractType()); source.setAmount(OaContractTeamPolicy.money(contract.getAmount()));
        source.setCurrency(OaContractTeamPolicy.currency(contract.getCurrency())); source.setStartDate(contract.getStartDate());
        source.setEndDate(contract.getEndDate()); source.setApprovalInstanceId(contract.getInstanceId()); source.setApprovedTime(approvedTime);
        source.setOurSigneeId(contract.getOurSigneeId()); source.setOurSignTime(contract.getOurSignTime());
        source.setCounterpartySignTime(contract.getCounterpartySignTime()); source.setSignedEvidenceDigest(signedDigest(contract));
        snapshot(contract, source);
        return source;
    }

    private void snapshot(OaContract contract, ContractPerformanceSource source) {
        List<OaContractTeam> rows = teams.lockCurrent(contract.getContractId(), contract.getTenantId());
        List<Integer> versions = teams.versions(contract.getContractId(), contract.getTenantId());
        int version = versions.isEmpty() ? 0 : versions.get(0);
        if (rows.isEmpty() && version > 0 || !rows.isEmpty() && (version <= 0 || rows.stream().anyMatch(member ->
                !Objects.equals(member.getTeamVersion(), version) || !Objects.equals(member.getTenantId(), contract.getTenantId())
                    || !Objects.equals(member.getBizId(), contract.getContractId()) || !"CONTRACT".equals(member.getBizType())
                    || !Integer.valueOf(1).equals(member.getCurrentFlag())))) throw invalid("合同当前团队版本不完整，不能确认业绩");
        if (rows.isEmpty()) {
            OaContractTeam owner = new OaContractTeam(); owner.setSalesUserId(contract.getOwnerId());
            owner.setRoleType("OWNER"); owner.setAllocatedPercentage(BigDecimal.ONE); rows = List.of(owner);
        }
        List<OaContractTeam> owners = rows.stream().filter(member -> "OWNER".equals(member.getRoleType())).toList();
        if (owners.size() != 1 || !Objects.equals(owners.get(0).getSalesUserId(), contract.getOwnerId()))
            throw invalid("合同负责人和团队主责不一致，不能确认业绩");
        if (rows.stream().anyMatch(member -> member.getSalesUserId() == null || member.getSalesUserId() <= 0)
                || rows.stream().map(OaContractTeam::getSalesUserId).distinct().count() != rows.size()) throw invalid("合同团队成员身份无效或重复");
        List<Long> users = rows.stream().map(OaContractTeam::getSalesUserId).sorted().toList();
        R<List<RemoteContractTeamDirectory.Employee>> response;
        try { response = directory.employees(users); }
        catch (RuntimeException unavailable) { throw invalid("员工服务暂不可用，合同业绩尚未确认"); }
        if (response == null || !response.isSuccess() || response.getData() == null) throw invalid("员工服务暂不可用，合同业绩尚未确认");
        Map<Long, RemoteContractTeamDirectory.Employee> employees = new HashMap<>();
        Set<Long> employeeIds = new HashSet<>();
        for (RemoteContractTeamDirectory.Employee employee : response.getData()) {
            if (employee == null || !users.contains(employee.userId()) || !Objects.equals(employee.tenantId(), contract.getTenantId())
                    || employee.employeeId() == null || employee.employeeId() <= 0 || !employeeIds.add(employee.employeeId())
                    || !employee.active() || !employee.userEnabled() || !employee.departmentEnabled()
                    || employee.deptId() == null || employee.deptId() <= 0 || employees.putIfAbsent(employee.userId(), employee) != null)
                throw invalid("合同业绩成员须为本租户唯一在职员工，且账号和部门均已启用");
        }
        if (employees.size() != users.size()) throw invalid("合同业绩成员的员工身份未全部核实");
        List<ContractPerformanceSource.Member> members = new ArrayList<>();
        for (OaContractTeam member : rows) {
            RemoteContractTeamDirectory.Employee employee = employees.get(member.getSalesUserId());
            member.setSalesUserName(employee.employeeName()); member.setDeptId(employee.deptId());
            members.add(new ContractPerformanceSource.Member(employee.userId(), employee.employeeId(), employee.employeeName(),
                    employee.deptId(), member.getRoleType(), member.getAllocatedPercentage()));
        }
        OaContractTeamPolicy.allocate(contract.getAmount(), rows);
        members.sort(Comparator.comparing(ContractPerformanceSource.Member::userId));
        source.setTeamVersion(version); source.setMembers(List.copyOf(members));
    }

    private OaContractPerformanceView view(OaContract contract) {
        Decoded latest = latest(contract);
        LocalDateTime approvedTime = latest == null ? sources.approvedTime(contract) : latest.source().getApprovedTime();
        String state = gate(contract, approvedTime);
        BigDecimal amount = null;
        LocalDateTime confirmedTime = null;
        if (latest != null) {
            assertImmutable(contract, latest.source());
            ContractPerformanceSource source = latest.source();
            OaContractPerformanceMapper.Confirmation confirmation = sources.confirmation(contract.getContractId(), contract.getTenantId(), source.completionKey());
            state = "PENDING_SYNC";
            if (confirmation != null) {
                try {
                    JsonNode evidence = json.readTree(confirmation.sourceSnapshot()).path("evidence");
                    BigDecimal expected = "REVERSE".equals(source.getOperation()) ? source.getAmount().negate() : source.getAmount();
                    if (confirmation.amount().compareTo(expected) != 0 || !Objects.equals(confirmation.currency(), source.getCurrency())
                            || !Objects.equals(confirmation.teamVersion(), source.getTeamVersion())
                            || !source.eventId().equals(evidence.path("sourceEventId").asText())
                            || !latest.envelope().getPayloadDigest().equals(evidence.path("sourceDigest").asText()))
                        throw invalid("合同业绩结果与来源不一致，请核对");
                } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw invalid("合同业绩结果来源无法核验"); }
                state = "REVERSE".equals(source.getOperation()) ? "REVERSED" : "CONFIRMED";
                amount = "REVERSED".equals(state) ? BigDecimal.ZERO : source.getAmount();
                confirmedTime = source.getOccurredTime();
            }
            if (!"REVERSE".equals(source.getOperation()) && (Set.of("CANCELLED", "TERMINATED").contains(safe(contract.getStatus()))
                    || contract.getAmount().compareTo(source.getAmount()) != 0)) {
                state = "PENDING_CONFIRMATION"; amount = null; confirmedTime = null;
            }
        }
        return new OaContractPerformanceView(state, message(state), contract.getVersion(), approvedTime != null,
                signed(contract), contract.getStartDate(), contract.getEndDate(), amount, contract.getCurrency(), confirmedTime);
    }

    private String gate(OaContract contract, LocalDateTime approvedTime) {
        if (contract.getCustomerId() == null || !Set.of("SALES", "SERVICE", "OTHER").contains(safe(contract.getContractType()))) return "NOT_APPLICABLE";
        if (Set.of("CANCELLED", "TERMINATED", "EXPIRED").contains(safe(contract.getStatus()))) return "INACTIVE";
        if (!APPROVED.contains(safe(contract.getStatus())) || approvedTime == null || approvedTime.isAfter(LocalDateTime.now())) return "WAITING_APPROVAL";
        if (!signed(contract)) return "WAITING_SIGNATURE";
        if (contract.getStartDate() == null) return "MISSING_START_DATE";
        if (contract.getStartDate().isAfter(LocalDate.now())) return "WAITING_START_DATE";
        return "READY";
    }

    private OaContract lockAccessible(Long id) {
        if (id == null || id <= 0 || UserContext.getUserId() == null) throw invalid("读取合同业绩需要有效合同及用户身份");
        return OaRecordSupport.active(contracts.selectTeamForUpdate(id, OaRecordSupport.tenantId(), DataScopeUtils.listScope("dept_id", "owner_id")));
    }

    private Decoded latest(OaContract contract) {
        OutboxEvent stored = sources.latest(contract.getContractId(), contract.getTenantId());
        if (stored == null) return null;
        Decoded decoded = ContractPerformanceSourceCodec.decode(stored, contract.getTenantId(), json);
        if (!Objects.equals(decoded.source().getContractId(), contract.getContractId())) throw invalid("合同持久来源与业务不一致");
        return decoded;
    }

    private void assertImmutable(OaContract contract, ContractPerformanceSource source) {
        if (!Objects.equals(contract.getCustomerId(), source.getCustomerId()) || !Objects.equals(contract.getCurrency(), source.getCurrency())
                || !Objects.equals(contract.getContractType(), source.getContractType()) || !Objects.equals(contract.getStartDate(), source.getStartDate())
                || !Objects.equals(contract.getEndDate(), source.getEndDate()) || !Objects.equals(contract.getInstanceId(), source.getApprovalInstanceId())
                || !signed(contract) || !Objects.equals(signedDigest(contract), source.getSignedEvidenceDigest())
                || contract.getVersion() == null || contract.getVersion() < source.getContractVersion())
            throw invalid("合同与已确认来源的币种、客户、期限、签署或版本不一致，请先核对");
    }

    private boolean signed(OaContract contract) {
        return Integer.valueOf(1).equals(contract.getSignedFlag()) && contract.getOurSigneeId() != null && contract.getOurSigneeId() > 0
                && contract.getOurSignTime() != null && !contract.getOurSignTime().isAfter(LocalDateTime.now())
                && contract.getCounterpartySignTime() != null && !contract.getCounterpartySignTime().isAfter(LocalDateTime.now())
                && !safe(contract.getCounterpartySignee()).isBlank() && !safe(contract.getSignedFileUrl()).isBlank();
    }

    private String signedDigest(OaContract contract) {
        return ContractPerformanceSource.signatureDigest(contract.getOurSigneeId(), contract.getOurSignTime(),
                contract.getCounterpartySignee(), contract.getCounterpartySignTime(), contract.getSignedFileUrl(), json);
    }

    private String message(String state) {
        return switch (state) {
            case "NOT_APPLICABLE" -> "仅关联客户的销售、服务或其他客户合同计入销售业绩";
            case "INACTIVE" -> "合同尚无可确认的有效销售业绩，正常到期保留已确认历史";
            case "WAITING_APPROVAL" -> "等待合同审批通过并核实审批记录";
            case "WAITING_SIGNATURE" -> "等待双方签署完成，不提前计入销售业绩";
            case "MISSING_START_DATE" -> "尚未计入业绩，请先补齐合同开始日期";
            case "WAITING_START_DATE" -> "开始日期尚未到达，届时由后台自动确认";
            case "PENDING_SYNC" -> "OA确认已保存，等待CRM接收；尚未计入销售业绩";
            case "CONFIRMED" -> "已确认合同销售业绩，后续团队调整不改动本次历史分配";
            case "REVERSED" -> "合同业绩已按原冻结分配冲正，历史记录保留";
            default -> "条件已满足，等待后台确认；每60秒扫描一次";
        };
    }

    private static String safe(String value) { return value == null ? "" : value; }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
}
