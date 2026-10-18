package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmHandoverTaskMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.deal.CrmDealHandoverService;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealMemberResolver;
import com.cloudflow.crm.service.deal.CrmDealTeamStore;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDealHandoverDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmHandoverTaskServiceImpl tasks;
    private final CrmDealHandoverService transfers;
    private final CrmDealTeamStore teams;
    private final CrmDealMemberResolver members;
    private final TransactionTemplate transactions;
    private long nextOwner = 72000L;

    private record Business(String type, Long id, Long customerId, Long originalOwner) { }
    private record Ownership(Long userId, String name, Integer version) { }

    private CrmDealHandoverDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; tasks = fixture.bean(CrmHandoverTaskServiceImpl.class); transfers = fixture.bean(CrmDealHandoverService.class);
        teams = fixture.bean(CrmDealTeamStore.class); members = fixture.bean(CrmDealMemberResolver.class); transactions = fixture.bean(TransactionTemplate.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); CrmDealHandoverDatabaseChecks checks = new CrmDealHandoverDatabaseChecks(fixture);
        checks.manual(); checks.newSuccessorAndDefaults(); checks.rollback(); checks.automatic(); checks.staleAndScope(); checks.competition(); checks.eventCompetition();
        System.out.println("H3_HANDOVER_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; mysql=true; manual_entrypoint=true; offboard_entrypoint=true; quote_opportunity_receivable=true; historical_allocation_fixture=true; concurrency_groups=4; hr=interface_double; http=false; production_modified=false");
    }

    private CrmCustomer customer(Long ownerId) {
        CrmCustomer customer = fixture.customer("h3-handover"); customer.setOwnerId(ownerId); customer.setOwnerName("CRM user " + ownerId);
        fixture.mapper(CrmCustomerMapper.class).updateById(customer); return customer;
    }

    private Business create(String type) { nextOwner += 10; return create(type, customer(nextOwner), nextOwner); }

    private Business create(String type, CrmCustomer customer, Long ownerId) {
        if ("OPPORTUNITY".equals(type)) {
            CrmOpportunity opportunity = new CrmOpportunity(); opportunity.setCustomerId(customer.getCustomerId()); opportunity.setOwnerId(ownerId);
            opportunity.setOpportunityName("交接商机验收"); opportunity.setExpectedAmount(new BigDecimal("100.01"));
            opportunity.setExpectedSignDate(LocalDate.now().plusDays(10)); fixture.bean(CrmOpportunityServiceImpl.class).createOpportunity(opportunity);
            return new Business(type, opportunity.getOpportunityId(), customer.getCustomerId(), ownerId);
        }
        if ("QUOTE".equals(type)) {
            CrmQuote quote = new CrmQuote(); quote.setCustomerId(customer.getCustomerId()); quote.setOwnerId(ownerId);
            quote.setQuoteName("交接报价验收"); quote.setQuoteNo("CHECK-" + UUID.randomUUID()); quote.setTotalAmount(new BigDecimal("100.01")); quote.setCurrency("USD");
            fixture.bean(CrmQuoteServiceImpl.class).createQuote(quote); return new Business(type, quote.getQuoteId(), customer.getCustomerId(), ownerId);
        }
        CrmReceivable receivable = fixture.receivable(customer, null, "100.01", "20.01", LocalDate.now().plusDays(10));
        receivable.setOwnerId(ownerId); receivable.setOwnerName("CRM user " + ownerId); fixture.mapper(CrmReceivableMapper.class).updateById(receivable);
        return new Business(type, receivable.getReceivableId(), customer.getCustomerId(), ownerId);
    }

    private Ownership ownership(Business business) {
        return switch (business.type()) {
            case "OPPORTUNITY" -> { CrmOpportunity row = fixture.mapper(CrmOpportunityMapper.class).selectById(business.id()); yield new Ownership(row.getOwnerId(), row.getOwnerName(), row.getVersion()); }
            case "QUOTE" -> { CrmQuote row = fixture.mapper(CrmQuoteMapper.class).selectById(business.id()); yield new Ownership(row.getOwnerId(), row.getOwnerName(), row.getVersion()); }
            default -> { CrmReceivable row = fixture.mapper(CrmReceivableMapper.class).selectById(business.id()); yield new Ownership(row.getOwnerId(), row.getOwnerName(), row.getVersion()); }
        };
    }

    private void lock(Business business) {
        switch (business.type()) {
            case "OPPORTUNITY" -> fixture.mapper(CrmOpportunityMapper.class).lockById(business.id());
            case "QUOTE" -> fixture.mapper(CrmQuoteMapper.class).lockById(business.id());
            default -> fixture.mapper(CrmReceivableMapper.class).lockById(business.id());
        }
    }

    private CrmDealMemberResolver.Assignment assignment(Long userId, String role, String percentage) {
        return new CrmDealMemberResolver.Assignment(userId, role, new BigDecimal(percentage), new BigDecimal("0.1250"));
    }

    private int prepareTeam(Business business) {
        return transactions.execute(status -> {
            lock(business); Long owner = business.originalOwner(); CrmDealTeamStore.Current current = teams.inspect(business.type(), business.id());
            CrmDealMemberResolver.Resolved resolved = members.resolve(List.of(assignment(owner, "OWNER", "0.5"), assignment(owner + 1, "CO_SELLER", "0.3"), assignment(owner + 2, "SUPPORT", "0.2")));
            int version = teams.replace(business.type(), business.id(), current.version(), resolved.members(), new BigDecimal("100.01"), "交接前团队夹具");
            if ("OPPORTUNITY".equals(business.type())) {
                CrmOpportunity opportunity = fixture.mapper(CrmOpportunityMapper.class).selectById(business.id()); opportunity.setTeamVersion(version);
                CrmRecordSupport.saved(fixture.mapper(CrmOpportunityMapper.class).writeTeam(opportunity, opportunity.getVersion()));
            }
            return version;
        });
    }

    private CrmHandoverTask task(Business business) {
        CrmHandoverTask task = new CrmHandoverTask(); task.setBusinessType("CRM_" + business.type()); task.setBusinessId(business.id());
        task.setBusinessName("交接业务验收"); task.setFromOwnerId(business.originalOwner()); task.setFromOwnerName("CRM user " + business.originalOwner());
        task.setFromDeptId(100L); task.setStatus("PENDING"); task.setTriggerSource("EMPLOYEE_LEFT"); task.setTriggerEventId(UUID.randomUUID().toString());
        CrmRecordSupport.create(task, "handoverId"); fixture.mapper(CrmHandoverTaskMapper.class).insert(task); return task;
    }

    private List<String> teamSnapshot(Business business, int version) {
        return teams.rows(business.type(), business.id(), version).stream().map(row -> row.getTeamId() + ":" + row.getTeamVersion()
                + ":" + row.getSalesUserId() + ":" + row.getSalesUserName() + ":" + row.getDeptId() + ":" + row.getRoleType()
                + ":" + row.getAllocatedPercentage() + ":" + row.getAllocatedAmount() + ":" + row.getCommissionRate() + ":" + row.getCommissionAmount()).toList();
    }

    private CrmDealTeam currentMember(Business business, Long userId) {
        return teams.rows(business.type(), business.id(), null).stream().filter(row -> userId.equals(row.getSalesUserId())).findFirst().orElseThrow();
    }

    private void manual() {
        for (String type : List.of("OPPORTUNITY", "QUOTE", "RECEIVABLE")) {
            Business business = create(type); int version = prepareTeam(business); List<String> previous = teamSnapshot(business, version);
            Ownership owner = ownership(business); Long successor = business.originalOwner() + 1;
            Long factId = "RECEIVABLE".equals(type) ? historicalReceipt(business, version) : null;
            List<? extends Object> factsBefore = factId == null ? List.of() : fixture.jdbc.queryForList("SELECT * FROM crm_deal_allocation WHERE event_id=? ORDER BY allocation_id", factId);
            HrEmployeeSummaryVO departed = fixture.employee(business.originalOwner()); departed.setActive(false); departed.setUserEnabled(false);
            fixture.employeeDirectory.put(business.originalOwner(), departed);
            try {
                CrmHandoverTask pending = task(business);
                equal(1, tasks.reassign(pending.getHandoverId(), successor, "FORGED OWNER NAME", "确认合并比例"), "manual handover succeeds with departed old owner: " + type);
                equal(successor, ownership(business).userId(), "manual handover writes new business owner: " + type);
                equal("CRM user " + successor, ownership(business).name(), "manual handover ignores forged owner name: " + type);
                equal(owner.version() + 1, ownership(business).version(), "manual handover increments real business version once: " + type);
                equal(2, teams.rows(type, business.id(), null).size(), "manual handover merges rather than duplicates successor: " + type);
                equal(version + 1, currentMember(business, successor).getTeamVersion(), "manual handover creates new whole-team version: " + type);
                decimal("0.8", currentMember(business, successor).getAllocatedPercentage(), "manual handover combines departing and successor shares: " + type);
                equal("OWNER", currentMember(business, successor).getRoleType(), "manual successor is sole owner: " + type);
                equal(null, currentMember(business, successor).getCommissionRate(), "changed successor commission requires confirmation: " + type);
                decimal("0.2", currentMember(business, business.originalOwner() + 2).getAllocatedPercentage(), "third member percentage stays unchanged: " + type);
                decimal("0.125", currentMember(business, business.originalOwner() + 2).getCommissionRate(), "third member confirmed rate stays unchanged: " + type);
                equal(previous, teamSnapshot(business, version), "manual handover does not rewrite historical team: " + type);
                CrmHandoverTask completed = fixture.mapper(CrmHandoverTaskMapper.class).selectById(pending.getHandoverId());
                equal("REASSIGNED", completed.getStatus(), "manual task commits reassigned state: " + type);
                equal("CRM user " + successor, completed.getToOwnerName(), "manual task stores verified successor name: " + type);
                fails(IllegalArgumentException.class, () -> tasks.reassign(pending.getHandoverId(), successor, "ignored", null), "completed handover cannot apply twice: " + type);
                if ("OPPORTUNITY".equals(type)) equal(version + 1, fixture.mapper(CrmOpportunityMapper.class).selectById(business.id()).getTeamVersion(), "opportunity points to new handover team version");
                if ("QUOTE".equals(type)) equal("USD", fixture.mapper(CrmQuoteMapper.class).selectById(business.id()).getCurrency(), "quote handover preserves historical currency");
                if (factId != null) {
                    equal(factsBefore, fixture.jdbc.queryForList("SELECT * FROM crm_deal_allocation WHERE event_id=? ORDER BY allocation_id", factId), "handover preserves all existing receipt allocation fields");
                    decimal("20.01", fixture.mapper(CrmReceivableMapper.class).selectById(business.id()).getReceivedAmount(), "handover cannot alter actual received amount");
                }
            } finally { fixture.employeeDirectory.remove(business.originalOwner()); }
        }
    }

    private Long historicalReceipt(Business business, int version) {
        return transactions.execute(status -> {
            lock(business); CrmDealTeamStore.Snapshot snapshot = teams.lock(business.type(), business.id(), business.originalOwner(), version);
            ObjectNode evidence = fixture.json.createObjectNode().put("fixture", "preexisting-receipt").put("receivableId", business.id());
            return fixture.bean(CrmDealLedgerService.class).append(new CrmDealLedgerService.Fact("HANDOVER_CHECK:" + UUID.randomUUID(), "RECEIPT",
                    "RECEIVABLE", business.id(), business.customerId(), new BigDecimal("20.01"), "CNY", LocalDateTime.now().minusDays(1),
                    version, "cloudflow-service-crm", ownership(business).version(), evidence, false), snapshot.resolved().members()).getEventId();
        });
    }

    private void newSuccessorAndDefaults() {
        for (String type : List.of("OPPORTUNITY", "QUOTE", "RECEIVABLE")) {
            Business business = create(type); int version = prepareTeam(business); Long successor = business.originalOwner() + 3;
            equal(1, tasks.reassign(task(business).getHandoverId(), successor, null, null), "new successor handover succeeds: " + type);
            equal(3, teams.rows(type, business.id(), null).size(), "new successor replaces one member: " + type);
            decimal("0.5", currentMember(business, successor).getAllocatedPercentage(), "new successor inherits departing ratio only: " + type);
            decimal("0.3", currentMember(business, business.originalOwner() + 1).getAllocatedPercentage(), "other seller unchanged for new successor: " + type);
            equal(version + 1, currentMember(business, successor).getTeamVersion(), "new successor consumes one team version: " + type);
            Business baseline = create(type); Long baselineSuccessor = baseline.originalOwner() + 1;
            fixture.missingEmployees.add(baseline.originalOwner());
            try {
                equal(1, tasks.reassign(task(baseline).getHandoverId(), baselineSuccessor, null, null), "default handover tolerates missing departed HR record: " + type);
                decimal("1", currentMember(baseline, baselineSuccessor).getAllocatedPercentage(), "default handover assigns successor 100 percent: " + type);
            } finally { fixture.missingEmployees.remove(baseline.originalOwner()); }
        }
    }

    private void rollback() {
        Business business = create("QUOTE"); int version = prepareTeam(business); CrmHandoverTask pending = task(business);
        CrmDealHandoverDatabaseChecks.Ownership before = ownership(business); List<String> snapshot = teamSnapshot(business, version);
        fixture.failEmployees = true;
        try { fails(IllegalArgumentException.class, () -> tasks.reassign(pending.getHandoverId(), business.originalOwner() + 1, null, null), "HR outage blocks manual handover"); }
        finally { fixture.failEmployees = false; }
        equal(before, ownership(business), "HR outage preserves original quote owner and version");
        equal("PENDING", fixture.mapper(CrmHandoverTaskMapper.class).selectById(pending.getHandoverId()).getStatus(), "HR outage preserves pending task");
        fails(IllegalStateException.class, () -> transactions.execute(status -> {
            tasks.reassign(pending.getHandoverId(), business.originalOwner() + 1, null, null); throw new IllegalStateException("handover outer failure fixture");
        }), "later transaction failure rolls back owner team and task together");
        equal(before, ownership(business), "outer failure restores quote version and owner");
        equal(snapshot, teamSnapshot(business, version), "outer failure preserves historical member fields");
        equal(List.of(version), teams.versions(business.type(), business.id()), "outer failure leaves no new team version");
        equal("PENDING", fixture.mapper(CrmHandoverTaskMapper.class).selectById(pending.getHandoverId()).getStatus(), "outer failure restores pending task");
        fails(IllegalTransactionStateException.class, () -> transfers.transfer("QUOTE", business.id(), business.originalOwner(), business.originalOwner() + 1), "handover core requires enclosing business transaction");
    }

    private void automatic() {
        nextOwner += 10; Long owner = nextOwner; CrmCustomer customer = customer(owner);
        List<CrmDealHandoverDatabaseChecks.Business> open = List.of(create("OPPORTUNITY", customer, owner), create("QUOTE", customer, owner), create("RECEIVABLE", customer, owner));
        for (Business business : open) prepareTeam(business);
        List<CrmDealHandoverDatabaseChecks.Business> closed = List.of(create("OPPORTUNITY", customer, owner), create("QUOTE", customer, owner), create("RECEIVABLE", customer, owner));
        for (Business business : closed) terminal(business);
        HrEmployeeSummaryVO departed = fixture.employee(owner); departed.setActive(false); fixture.employeeDirectory.put(owner, departed);
        try {
            equal(4, tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, UUID.randomUUID().toString(), null), "earlier account-disabled event creates four pending tasks");
            equal(4, tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, UUID.randomUUID().toString(), owner + 1), "offboarding transfers customer and three active business types");
            equal(0, tasks.listPending(owner).size(), "automatic handover settles earlier account-disabled pending tasks");
            equal(4L, fixture.scalar("SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=? AND business_type<>'AUTO_REASSIGN' AND status='REASSIGNED' AND to_owner_id=?", owner, owner + 1), "each earlier pending task records its verified successor");
            for (Business business : open) {
                equal(owner + 1, ownership(business).userId(), "automatic entrypoint transfers business owner: " + business.type());
                decimal("0.8", currentMember(business, owner + 1).getAllocatedPercentage(), "automatic entrypoint merges existing successor ratio: " + business.type());
            }
            for (Business business : closed) equal(owner, ownership(business).userId(), "automatic entrypoint skips terminal business: " + business.type());
            List<List<Integer>> versions = open.stream().map(business -> teams.versions(business.type(), business.id())).toList();
            equal(0, tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, UUID.randomUUID().toString(), owner + 1), "duplicate automatic offboarding is an explicit no-op");
            equal(0, tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, UUID.randomUUID().toString(), null), "later account-disabled event creates no stale pending tasks");
            equal(versions, open.stream().map(business -> teams.versions(business.type(), business.id())).toList(), "replayed automatic event creates no team versions");
            equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=? AND business_type='AUTO_REASSIGN'", owner), "automatic completion has exactly one summary");
            fails(IllegalArgumentException.class, () -> tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, UUID.randomUUID().toString(), owner + 2), "completed offboarding cannot silently select another successor");
        } finally { fixture.employeeDirectory.remove(owner); }

        nextOwner += 10; Long failingOwner = nextOwner; CrmCustomer failingCustomer = customer(failingOwner);
        Business first = create("OPPORTUNITY", failingCustomer, failingOwner); int firstVersion = prepareTeam(first);
        Business second = create("QUOTE", failingCustomer, failingOwner); prepareTeam(second);
        List<CrmDealMemberResolver.Assignment> invalidTeam = List.of(assignment(failingOwner, "OWNER", "0.5"), assignment(failingOwner + 1, "CO_SELLER", "0.3"), assignment(failingOwner + 3, "SUPPORT", "0.2"));
        transactions.executeWithoutResult(status -> {
            lock(second); CrmDealTeamStore.Current current = teams.inspect("QUOTE", second.id());
            teams.replace("QUOTE", second.id(), current.version(), members.resolve(invalidTeam).members(), new BigDecimal("100.01"), "后续失败事务夹具");
        });
        String eventId = UUID.randomUUID().toString(); fixture.missingEmployees.add(failingOwner + 3);
        try { fails(IllegalArgumentException.class, () -> tasks.generateForEmployeeLeft(100000L, failingOwner, "departed", 100L, eventId, failingOwner + 1), "later quote HR failure rolls back earlier automatic opportunity transfer"); }
        finally { fixture.missingEmployees.remove(failingOwner + 3); }
        equal(failingOwner, fixture.mapper(CrmCustomerMapper.class).selectById(failingCustomer.getCustomerId()).getOwnerId(), "automatic failure rolls back customer reassignment");
        equal(failingOwner, ownership(first).userId(), "automatic failure restores earlier opportunity owner");
        equal(firstVersion, fixture.mapper(CrmOpportunityMapper.class).selectById(first.id()).getTeamVersion(), "automatic failure restores earlier opportunity team pointer");
        equal(failingOwner, ownership(second).userId(), "automatic failure leaves later quote owner unchanged");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND trigger_event_id=?", eventId), "automatic failure cannot create successful summary task");
        equal(3, tasks.generateForEmployeeLeft(100000L, failingOwner, "departed", 100L, UUID.randomUUID().toString(), null), "offboarding without successor creates pending customer opportunity and quote tasks");
        equal(0, tasks.generateForEmployeeLeft(100000L, failingOwner, "departed", 100L, UUID.randomUUID().toString(), null), "repeat pending generation does not duplicate business tasks");
        fixture.missingEmployees.add(failingOwner + 3);
        try { fails(IllegalArgumentException.class, () -> tasks.generateForEmployeeLeft(100000L, failingOwner, "departed", 100L, eventId, failingOwner + 1), "failed automatic retry preserves earlier pending tasks"); }
        finally { fixture.missingEmployees.remove(failingOwner + 3); }
        equal(3, tasks.listPending(failingOwner).size(), "failed automatic retry rolls back pending statuses and summary");
        equal(3, tasks.generateForEmployeeLeft(100000L, failingOwner, "departed", 100L, eventId, failingOwner + 1), "same failed event succeeds after directory recovery");
        equal(0, tasks.listPending(failingOwner).size(), "recovered automatic handover settles all earlier pending tasks");
    }

    private void terminal(Business business) {
        switch (business.type()) {
            case "OPPORTUNITY" -> { CrmOpportunity row = fixture.mapper(CrmOpportunityMapper.class).selectById(business.id()); row.setStage("WON"); fixture.mapper(CrmOpportunityMapper.class).updateById(row); }
            case "QUOTE" -> { CrmQuote row = fixture.mapper(CrmQuoteMapper.class).selectById(business.id()); row.setStatus("ACCEPTED"); fixture.mapper(CrmQuoteMapper.class).updateById(row); }
            default -> { CrmReceivable row = fixture.mapper(CrmReceivableMapper.class).selectById(business.id()); row.setStatus("RECEIVED"); fixture.mapper(CrmReceivableMapper.class).updateById(row); }
        }
    }

    private void staleAndScope() {
        for (String type : List.of("OPPORTUNITY", "QUOTE", "RECEIVABLE")) {
            Business business = create(type); CrmHandoverTask pending = task(business); terminal(business);
            fails(IllegalArgumentException.class, () -> tasks.reassign(pending.getHandoverId(), business.originalOwner() + 1, null, null), "manual handover rejects terminal source: " + type);
            equal("PENDING", fixture.mapper(CrmHandoverTaskMapper.class).selectById(pending.getHandoverId()).getStatus(), "terminal rejection preserves task for review: " + type);
        }
        Business business = create("QUOTE"); CrmHandoverTask pending = task(business);
        fails(IllegalArgumentException.class, () -> tasks.reassign(pending.getHandoverId(), business.originalOwner(), null, null), "manual handover rejects same owner");
        fails(IllegalArgumentException.class, () -> tasks.generateForEmployeeLeft(100001L, business.originalOwner(), "departed", 100L, "foreign-check", business.originalOwner() + 1), "offboarding cannot override current tenant");
        identity(100001L, 1L, 0);
        try {
            fails(IllegalArgumentException.class, () -> tasks.reassign(pending.getHandoverId(), business.originalOwner() + 1, null, null), "foreign tenant cannot reassign task by ID");
            fails(IllegalArgumentException.class, () -> tasks.close(pending.getHandoverId(), "foreign"), "foreign tenant cannot close task by ID");
        } finally { identity(); }
        CrmQuote changed = fixture.mapper(CrmQuoteMapper.class).selectById(business.id()); changed.setOwnerId(business.originalOwner() + 2);
        fixture.mapper(CrmQuoteMapper.class).updateById(changed);
        fails(IllegalArgumentException.class, () -> tasks.reassign(pending.getHandoverId(), business.originalOwner() + 1, null, null), "stale handover cannot overwrite owner already changed elsewhere");
        equal(business.originalOwner() + 2, ownership(business).userId(), "stale handover preserves new actual owner");
        equal(1, tasks.close(pending.getHandoverId(), "原归属已改变，关闭待办"), "pending stale task may be closed explicitly");
        fails(IllegalArgumentException.class, () -> tasks.close(pending.getHandoverId(), "repeat"), "closed task cannot close twice");
    }

    private void competition() throws Exception {
        Business business = create("QUOTE"); int version = prepareTeam(business); CrmHandoverTask pending = task(business);
        int[] winners = fixture.parallel(() -> attempt(() -> tasks.reassign(pending.getHandoverId(), business.originalOwner() + 1, null, null)),
                () -> attempt(() -> tasks.reassign(pending.getHandoverId(), business.originalOwner() + 3, null, null)));
        equal(1, winners[0] + winners[1], "two simultaneous task reassignments have exactly one winner");
        equal(version + 1, teams.versions(business.type(), business.id()).get(0), "competing handovers create only one team version");
        equal(ownership(business).userId(), fixture.mapper(CrmHandoverTaskMapper.class).selectById(pending.getHandoverId()).getToOwnerId(), "winning task and business agree on successor");
        Business closing = create("RECEIVABLE"); CrmHandoverTask closeTask = task(closing);
        int[] closeWinners = fixture.parallel(() -> attempt(() -> tasks.reassign(closeTask.getHandoverId(), closing.originalOwner() + 1, null, null)),
                () -> attempt(() -> tasks.close(closeTask.getHandoverId(), "不再交接")));
        equal(1, closeWinners[0] + closeWinners[1], "closing and reassigning the same pending task have one winner");
        equal(closeWinners[0] == 1 ? "REASSIGNED" : "CLOSED", fixture.mapper(CrmHandoverTaskMapper.class).selectById(closeTask.getHandoverId()).getStatus(), "task final state agrees with winning operation");
        equal(closeWinners[0] == 1 ? closing.originalOwner() + 1 : closing.originalOwner(), ownership(closing).userId(), "task close cannot partially change owner");
    }

    private void eventCompetition() throws Exception {
        for (boolean bothAutomatic : List.of(false, true)) {
            nextOwner += 10; Long owner = nextOwner; CrmCustomer customer = customer(owner);
            List<CrmDealHandoverDatabaseChecks.Business> active = List.of(create("OPPORTUNITY", customer, owner), create("QUOTE", customer, owner), create("RECEIVABLE", customer, owner));
            List<List<Integer>> beforeVersions = new java.util.ArrayList<>();
            List<List<String>> histories = new java.util.ArrayList<>();
            for (Business business : active) {
                int version = prepareTeam(business);
                beforeVersions.add(teams.versions(business.type(), business.id()));
                histories.add(teamSnapshot(business, version));
            }
            String firstEvent = UUID.randomUUID().toString(); String secondEvent = UUID.randomUUID().toString();
            Long firstSuccessor = bothAutomatic ? owner + 1 : null;
            CyclicBarrier started = new CyclicBarrier(2);
            int[] outcomes = fixture.parallel(() -> {
                started.await(10, TimeUnit.SECONDS);
                return eventAttempt(owner, firstSuccessor, firstEvent);
            }, () -> {
                started.await(10, TimeUnit.SECONDS);
                return eventAttempt(owner, owner + 1, secondEvent);
            });
            if (outcomes[0] < 0) tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, firstEvent, firstSuccessor);
            if (outcomes[1] < 0) tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, secondEvent, owner + 1);
            equal(0, tasks.listPending(owner).size(), "competing source events leave no stale pending tasks: " + bothAutomatic);
            equal(owner + 1, fixture.mapper(CrmCustomerMapper.class).selectById(customer.getCustomerId()).getOwnerId(), "competing events agree on actual customer owner: " + bothAutomatic);
            equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=? AND business_type='AUTO_REASSIGN' AND status='REASSIGNED'", owner), "competing events commit exactly one completed summary: " + bothAutomatic);
            for (int index = 0; index < active.size(); index++) {
                Business business = active.get(index);
                ArrayList<Integer> expectedVersions = new java.util.ArrayList<>(beforeVersions.get(index));
                int previousVersion = expectedVersions.get(0);
                expectedVersions.add(0, previousVersion + 1);
                equal(owner + 1, ownership(business).userId(), "competing events transfer actual business owner: " + business.type());
                equal(expectedVersions, teams.versions(business.type(), business.id()), "competing events create exactly one new team version: " + business.type());
                decimal("0.8", currentMember(business, owner + 1).getAllocatedPercentage(), "competing events merge successor ratio once: " + business.type());
                equal(histories.get(index), teamSnapshot(business, previousVersion), "competing events preserve historical member snapshot: " + business.type());
            }
        }
    }

    private int eventAttempt(Long owner, Long successor, String eventId) {
        try { return tasks.generateForEmployeeLeft(100000L, owner, "departed", 100L, eventId, successor); }
        catch (ConcurrencyFailureException | DuplicateKeyException retryable) {
            System.out.println("H3_HANDOVER_EVENT_RETRY: exception=" + retryable.getClass().getSimpleName() + "; same_event_replayed=true");
            return -1;
        }
    }

    private int attempt(Runnable operation) { try { operation.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; } }
}
