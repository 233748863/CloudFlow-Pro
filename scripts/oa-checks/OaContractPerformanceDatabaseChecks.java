package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.dto.ContractSignDTO;
import com.cloudflow.oa.domain.dto.ContractStartDateDTO;
import com.cloudflow.oa.domain.dto.OaContractTeamRequest;
import com.cloudflow.oa.domain.vo.OaContractPerformanceView;
import com.cloudflow.oa.domain.vo.OaContractTeamView;
import com.cloudflow.oa.mapper.OaContractPerformanceMapper;
import com.cloudflow.oa.service.remote.RemoteContractTeamDirectory;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaContractPerformanceDatabaseChecks {
    private final OaOperationsDatabaseChecks fixture;
    private final OaContractPerformanceService performance;
    private final OaContractServiceImpl contracts;
    private final OaContractTeamService teams;
    private final OaContractFulfilmentService fulfilment;
    private final ContractApprovalHandler approvals;
    private String directoryMode = "VALID";

    private OaContractPerformanceDatabaseChecks(OaOperationsDatabaseChecks fixture) throws Exception {
        this.fixture = fixture;
        fixture.beans.put(RemoteContractTeamDirectory.class, (RemoteContractTeamDirectory) users -> {
            if ("UNAVAILABLE".equals(directoryMode)) throw new IllegalStateException("Isolated employee service failure");
            return R.ok(users.stream().filter(user -> !"MISSING_SECOND".equals(directoryMode) || user != 2L)
                    .map(user -> new RemoteContractTeamDirectory.Employee(100000L, 1000L + user, user,
                            "合同业绩验证员工 " + user, 100L, "核验部门", true, true, true)).toList());
        });
        performance = fixture.register(OaContractPerformanceService.class);
        teams = fixture.register(OaContractTeamService.class);
        fulfilment = fixture.register(OaContractFulfilmentService.class);
        contracts = fixture.register(OaContractServiceImpl.class);
        fixture.beans.put(RedisStreamUtil.class, new RedisStreamUtil());
        approvals = fixture.register(ContractApprovalHandler.class);
    }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        int before = checks.get();
        identity(100000L, 1L);
        OaContractPerformanceDatabaseChecks verification = new OaContractPerformanceDatabaseChecks(fixture);
        verification.conditions(); verification.startDate(); verification.history(); verification.failures(); verification.approvalProtection();
        verification.scope(); verification.competition(); verification.scanIsolation();
        identity(100000L, 1L);
        System.out.println("H3_CONTRACT_PERFORMANCE_OA_DATABASE_CHECKS: assertions=" + (checks.get() - before)
                + "; failed=0; concurrency_groups=3; mysql=true; transactions=true; oa_entrypoints=true; approval=database_fixture; hr=interface_double; real_http=false; salary_posting=false; production_modified=false");
    }

    private OaContract create(LocalDate startDate, long owner) {
        OaContract contract = new OaContract();
        String name = "H3_CP_" + UUID.randomUUID();
        contract.setContractNo(name); contract.setContractName(name); contract.setCounterpartyName("合同业绩核验客户");
        contract.setContractType("SALES"); contract.setAmount(number("100.01")); contract.setCurrency("CNY");
        contract.setOwnerId(owner); contract.setOwnerName("合同业绩验证员工 " + owner); contract.setDeptId(100L);
        contract.setCustomerId(fixture.jdbc.queryForObject("SELECT MIN(customer_id) FROM crm_customer WHERE tenant_id=100000 AND deleted=0", Long.class));
        contract.setStartDate(startDate); contract.setEndDate(LocalDate.now().plusMonths(1));
        return contracts.getContractInfo(contracts.createContract(contract));
    }

    private OaContract current(OaContract contract) { return contracts.getContractInfo(contract.getContractId()); }
    private long count(OaContract contract) {
        return fixture.count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=? AND event_type='CONTRACT_PERFORMANCE_CHANGED'", contract.getContractId());
    }
    private OutboxEvent stored(OaContract contract) { return fixture.mapper(OaContractPerformanceMapper.class).latest(contract.getContractId(), 100000L); }
    private ContractPerformanceSource source(OaContract contract) { return ContractPerformanceSourceCodec.decode(stored(contract), 100000L, fixture.json).source(); }
    private boolean synchronize(OaContract contract) {
        return fixture.bean(TransactionTemplate.class).execute(status -> performance.synchronize(contract.getContractId()));
    }
    private ApprovalResultDTO bindPassedWorkflow(OaContract contract) {
        contracts.submitContract(contract.getContractId());
        String instance = "h3-cp-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,status,start_time,end_time,deleted) VALUES(?,100000,'biz_contract',?,?,'PASSED',?, ?,0)",
                instance, "CONTRACT:" + contract.getContractId(), contract.getOwnerId(), LocalDateTime.now().minusMinutes(2).withNano(0), LocalDateTime.now().minusMinutes(1).withNano(0));
        fixture.jdbc.update("UPDATE oa_contract SET instance_id=?,version=version+1 WHERE tenant_id=100000 AND contract_id=?", instance, contract.getContractId());
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setTenantId(100000L); result.setBusinessType("biz_contract");
        result.setBusinessId(contract.getContractId()); result.setProcessInstanceId(instance); result.setApproverId(1L);
        result.setApproverName("隔离审批输入"); result.setApprovalResult("APPROVED"); return result;
    }
    private ApprovalResultDTO approve(OaContract contract) {
        ApprovalResultDTO callback = bindPassedWorkflow(contract); approvals.handleApproved(callback); return callback;
    }
    private void sign(OaContract contract) {
        ContractSignDTO request = new ContractSignDTO(); request.setSignMethod("SCAN"); request.setCounterpartySignee("真实数据库核验签署人");
        request.setCounterpartySignTime(LocalDateTime.now().minusMinutes(3).withNano(987654321));
        request.setSignedFileUrl(OaProjectContractDatabaseChecks.upload(fixture, OaPrivateFileStorageService.Kind.CONTRACT_SIGNED));
        HttpServletRequest http = proxy(HttpServletRequest.class, (method, values) -> "getRemoteAddr".equals(method) ? "127.0.0.1" : null);
        fulfilment.sign(contract.getContractId(), request, http);
        OaContract signed = current(contract);
        equal(request.getCounterpartySignTime().withNano(0), signed.getCounterpartySignTime(), "signature precision follows database seconds without rounding into the next second");
        equal(false, signed.getOurSignTime().isAfter(LocalDateTime.now()), "persisted signature time is not rounded into the future");
    }
    private void team(OaContract contract, String primary, String partner) {
        OaContractTeamView current = teams.read(contract.getContractId(), null);
        teams.save(contract.getContractId(), new OaContractTeamRequest(current.teamVersion(), current.businessVersion(), List.of(
                new OaContractTeamRequest.Member(1L, "OWNER", number(primary)), new OaContractTeamRequest.Member(2L, "CO_SELLER", number(partner))), "隔离团队设置"));
    }

    private void conditions() {
        OaContract contract = create(LocalDate.now(), 1L);
        equal("WAITING_APPROVAL", performance.read(contract.getContractId()).state(), "draft never counts as contract performance");
        equal(false, synchronize(contract), "draft sync produces no source");
        ApprovalResultDTO callback = approve(contract);
        equal("WAITING_SIGNATURE", performance.read(contract.getContractId()).state(), "approved unsigned contract waits for both signatures");
        equal(0L, count(contract), "approval alone does not count performance");
        sign(contract);
        equal("PENDING_SYNC", performance.read(contract.getContractId()).state(), "OA persisted confirmation is not reported as CRM completed");
        equal(1L, count(contract), "approval signature and due start create one source");
        equal(0, source(contract).getTeamVersion(), "default owner freezes version zero");
        decimal("1", source(contract).getMembers().get(0).percentage(), "unconfigured owner receives all contract performance");
        equal(1001L, source(contract).getMembers().get(0).employeeId(), "employee identity comes from HR interface");
        equal(true, current(contract).getCurrencyLocked(), "pending source locks currency before CRM consumes it");
        int version = current(contract).getVersion();
        approvals.handleApproved(callback); synchronize(contract);
        equal(version, current(contract).getVersion(), "duplicate callback and confirmation do not modify contract version");
        equal(1L, count(contract), "duplicate confirmation does not create more sources");
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=100000 AND business_type='CONTRACT' AND business_id=? AND snapshot_json LIKE '%members%'", contract.getContractId()), "public timeline does not receive hidden team snapshot");
        OaContract future = create(LocalDate.now().plusDays(2), 1L); approve(future); sign(future);
        equal("WAITING_START_DATE", performance.read(future.getContractId()).state(), "future start remains pending");
        equal(0L, count(future), "future contract produces no advance facts");
        OaContract unverified = create(LocalDate.now(), 1L);
        fixture.jdbc.update("UPDATE oa_contract SET status='APPROVED',version=version+1 WHERE contract_id=?", unverified.getContractId());
        sign(unverified);
        equal("WAITING_APPROVAL", performance.read(unverified.getContractId()).state(), "status text without persisted passed workflow cannot count");
        equal(0L, count(unverified), "unverified approval creates no source");
        fixture.jdbc.update("UPDATE oa_contract SET contract_type='PURCHASE',version=version+1 WHERE contract_id=?", unverified.getContractId());
        equal("NOT_APPLICABLE", performance.read(unverified.getContractId()).state(), "purchases are not customer sales");
    }

    private void startDate() {
        OaContract contract = create(null, 1L); approve(contract); sign(contract);
        equal("MISSING_START_DATE", performance.read(contract.getContractId()).state(), "signed contract with missing start needs supplementation");
        equal(0L, count(contract), "missing date never creates performance");
        OaContract original = current(contract);
        fails(IllegalArgumentException.class, () -> performance.completeStartDate(contract.getContractId(), new ContractStartDateDTO(original.getVersion(), null)), "empty start date rejected");
        fails(IllegalArgumentException.class, () -> performance.completeStartDate(contract.getContractId(), new ContractStartDateDTO(original.getVersion(), original.getEndDate().plusDays(1))), "start after end rejected");
        fails(IllegalArgumentException.class, () -> performance.completeStartDate(contract.getContractId(), new ContractStartDateDTO(original.getVersion() - 1, LocalDate.now())), "stale date version rejected");
        equal(original.getVersion(), current(contract).getVersion(), "rejected supplementation leaves version unchanged");
        OaContractPerformanceView result = performance.completeStartDate(contract.getContractId(), new ContractStartDateDTO(original.getVersion(), LocalDate.now()));
        equal("PENDING_SYNC", result.state(), "supplementing due start persists source atomically");
        equal(LocalDate.now(), current(contract).getStartDate(), "explicit date is saved");
        equal(original.getOurSignTime(), current(contract).getOurSignTime(), "supplement does not rewrite original signature time");
        equal(original.getSignedFileUrl(), current(contract).getSignedFileUrl(), "supplement preserves signed evidence file");
        equal(1L, count(contract), "supplement emits exactly one source");
        fails(IllegalArgumentException.class, () -> performance.completeStartDate(contract.getContractId(), new ContractStartDateDTO(result.businessVersion(), LocalDate.now().minusDays(1))), "existing start date cannot be overwritten");
        OaContract ordinaryEdit = current(contract); ordinaryEdit.setAmount(number("90"));
        fails(IllegalArgumentException.class, () -> contracts.updateContract(ordinaryEdit), "signed amount stays locked in ordinary editing");
        fails(IllegalArgumentException.class, () -> contracts.cancelContract(contract.getContractId()), "effective contract cancellation is not opened by performance integration");
        equal(1L, count(contract), "locked actions cannot create correction or reversal");
        OaContract future = create(null, 1L); approve(future); sign(future);
        OaContractPerformanceView next = performance.completeStartDate(future.getContractId(), new ContractStartDateDTO(current(future).getVersion(), LocalDate.now().plusDays(3)));
        equal("WAITING_START_DATE", next.state(), "future supplement saves date but still waits");
        equal(0L, count(future), "future supplement cannot post performance");
    }

    private void history() {
        OaContract contract = create(LocalDate.now(), 1L); team(contract, "0.6", "0.4"); approve(contract); sign(contract);
        String frozen = stored(contract).getPayloadJson();
        team(contract, "0.2", "0.8");
        equal(frozen, stored(contract).getPayloadJson(), "later team adjustment preserves source byte for byte");
        equal(1L, count(contract), "team change does not count contract again");
        equal(1, source(contract).getTeamVersion(), "confirmed team version remains historical");
        fixture.jdbc.update("UPDATE oa_contract SET amount=80.01,version=version+1 WHERE contract_id=?", contract.getContractId());
        equal(true, synchronize(contract), "controlled legal-correction source creates next revision");
        equal("CORRECT", source(contract).getOperation(), "correction is explicit");
        decimal("0.6000", source(contract).getMembers().get(0).percentage(), "correction retains original members rather than current team");
        equal(2L, count(contract), "correction adds rather than replaces source");
        fixture.jdbc.update("UPDATE oa_contract SET status='EXPIRED',version=version+1 WHERE contract_id=?", contract.getContractId());
        equal(false, synchronize(contract), "normal expiry does not reverse historical performance");
        equal(2L, count(contract), "expiry adds no artificial reversal");
        fixture.jdbc.update("UPDATE oa_contract SET status='TERMINATED',version=version+1 WHERE contract_id=?", contract.getContractId());
        equal(true, synchronize(contract), "controlled terminal source records an explicit reversal");
        equal("REVERSE", source(contract).getOperation(), "terminal revision carries reversal operation");
        decimal("80.01", source(contract).getAmount(), "reversal references preceding corrected amount");
        equal(false, synchronize(contract), "repeated terminal state produces no additional source");
        equal(3L, count(contract), "complete chain keeps each immutable predecessor");
    }

    private void failures() {
        OaContract contract = create(LocalDate.now(), 1L); approve(contract);
        int version = current(contract).getVersion();
        directoryMode = "UNAVAILABLE";
        try { fails(IllegalArgumentException.class, () -> sign(contract), "HR failure rolls signature and source back together"); }
        finally { directoryMode = "VALID"; }
        equal(0, current(contract).getSignedFlag(), "failed source does not falsely persist signature completion");
        equal(version, current(contract).getVersion(), "failed source preserves version"); equal(0L, count(contract), "HR failure creates no source");
        fixture.jdbc.execute("CREATE TRIGGER h3_contract_source_failure BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF NEW.event_type='CONTRACT_PERFORMANCE_CHANGED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated contract source failure'; END IF; END");
        try { fails(RuntimeException.class, () -> sign(contract), "outbox insertion failure rolls signing back"); }
        finally { fixture.jdbc.execute("DROP TRIGGER h3_contract_source_failure"); }
        equal(version, current(contract).getVersion(), "outbox failure preserves contract version");
        equal(0, current(contract).getSignedFlag(), "outbox failure leaves signature retryable");
        equal(0L, count(contract), "outbox failure leaves no partial source");
        sign(contract); equal(1L, count(contract), "source succeeds after transient fault is removed");
    }

    private void approvalProtection() {
        OaContract cancelled = create(LocalDate.now(), 1L); ApprovalResultDTO callback = bindPassedWorkflow(cancelled);
        contracts.cancelContract(cancelled.getContractId()); int version = current(cancelled).getVersion();
        approvals.handleApproved(callback);
        equal("CANCELLED", current(cancelled).getStatus(), "late passed callback cannot resurrect cancelled contract");
        equal(version, current(cancelled).getVersion(), "late callback cannot advance cancelled version");
        OaContract contract = create(LocalDate.now(), 1L); ApprovalResultDTO approved = approve(contract); sign(contract);
        approved.setProcessInstanceId("stale-" + UUID.randomUUID()); approvals.handleApproved(approved);
        equal(1L, count(contract), "stale workflow instance cannot create more performance");
        approved.setTenantId(100001L);
        fails(IllegalArgumentException.class, () -> approvals.handleApproved(approved), "callback rejects mismatched tenant context");
    }

    private void scope() {
        OaContract contract = create(null, 1L); approve(contract); sign(contract); int version = current(contract).getVersion();
        identity(100001L, 1L);
        try {
            fails(IllegalArgumentException.class, () -> performance.read(contract.getContractId()), "foreign tenant cannot read performance");
            fails(IllegalArgumentException.class, () -> performance.completeStartDate(contract.getContractId(), new ContractStartDateDTO(version, LocalDate.now())), "foreign tenant cannot supplement date");
        } finally { identity(100000L, 1L); }
        identity(100000L, 2L); UserContext.setDsType(4);
        try { fails(IllegalArgumentException.class, () -> performance.read(contract.getContractId()), "out-of-scope user cannot read contract confirmation"); }
        finally { identity(100000L, 1L); }
        equal(0L, count(contract), "rejected foreign access does not confirm performance");
    }

    private void competition() throws Exception {
        OaContract contract = create(LocalDate.now().plusDays(2), 1L); approve(contract); sign(contract);
        fixture.jdbc.update("UPDATE oa_contract SET start_date=?,version=version+1 WHERE contract_id=?", LocalDate.now(), contract.getContractId());
        int[] results = compete(() -> synchronize(contract) ? 1 : 0, () -> synchronize(contract) ? 1 : 0);
        equal(1, results[0] + results[1], "parallel due checks persist one initial source"); equal(1L, count(contract), "parallel due checks have one durable identity");
        OaContract date = create(null, 1L); approve(date); sign(date); int version = current(date).getVersion();
        int[] dates = compete(() -> attempt(() -> performance.completeStartDate(date.getContractId(), new ContractStartDateDTO(version, LocalDate.now()))),
                () -> attempt(() -> performance.completeStartDate(date.getContractId(), new ContractStartDateDTO(version, LocalDate.now().minusDays(1)))));
        equal(1, dates[0] + dates[1], "competing date supplementation has one winner"); equal(1L, count(date), "date competition creates one source");
        OaContract team = create(LocalDate.now().plusDays(1), 1L); team(team, "0.6", "0.4"); approve(team); sign(team);
        fixture.jdbc.update("UPDATE oa_contract SET start_date=?,version=version+1 WHERE contract_id=?", LocalDate.now(), team.getContractId());
        compete(() -> { synchronize(team); return 1; }, () -> { team(team, "0.5", "0.5"); return 1; });
        equal(1L, count(team), "due confirmation and team change serialize on contract");
        decimal("0.6000", source(team).getMembers().get(0).percentage(), "team mutation freezes eligible old team before replacing it");
    }

    private void scanIsolation() {
        OaContract failed, healthy;
        try {
            identity(100000L, 2L);
            failed = create(LocalDate.now().plusDays(2), 2L); approve(failed); sign(failed);
            identity(100000L, 3L);
            healthy = create(LocalDate.now().plusDays(2), 3L); approve(healthy); sign(healthy);
        } finally { identity(100000L, 1L); }
        fixture.jdbc.update("UPDATE oa_contract SET start_date=?,version=version+1 WHERE contract_id IN (?,?)", LocalDate.now(), failed.getContractId(), healthy.getContractId());
        directoryMode = "MISSING_SECOND";
        try { fails(IllegalStateException.class, performance::scanDue, "scheduled scan reports failed contract rather than fake success"); }
        finally { directoryMode = "VALID"; }
        equal(0L, count(failed), "failed contract remains retryable without partial source");
        equal(1L, count(healthy), "one failed contract does not starve subsequent healthy contract");
        performance.scanDue(); equal(1L, count(failed), "later background scan recovers failed contract");
        equal(1L, count(healthy), "recovery scan does not duplicate already confirmed contract");
    }

    private int attempt(Runnable action) { try { action.run(); return 1; } catch (IllegalArgumentException conflict) { return 0; } }
    private int[] compete(Callable<Integer> first, Callable<Integer> second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Integer> left = executor.submit(() -> { identity(100000L, 1L); start.await(); return first.call(); });
            Future<Integer> right = executor.submit(() -> { identity(100000L, 1L); start.await(); return second.call(); });
            start.countDown(); return new int[] { left.get(30, TimeUnit.SECONDS), right.get(30, TimeUnit.SECONDS) };
        } finally { executor.shutdownNow(); identity(100000L, 1L); }
    }
}
