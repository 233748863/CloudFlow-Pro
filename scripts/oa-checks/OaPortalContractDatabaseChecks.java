package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractFulfilmentTerm;
import com.cloudflow.oa.domain.OaContractMilestone;
import com.cloudflow.oa.domain.OaContractPaymentSchedule;
import com.cloudflow.oa.domain.dto.ContractPortalSelectionRequest;
import com.cloudflow.oa.domain.vo.ContractPortalPublicationVO;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.PortalContractMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaPortalContractDatabaseChecks {
    private final OaOperationsDatabaseChecks fixture;
    private final ContractPortalPublicationService publication;
    private final OaContractServiceImpl contracts;
    private final OaContractFulfilmentService fulfilment;
    private final OaContractMilestoneServiceImpl milestones;
    private final PortalContractMapper portal;
    private final Long customerId;
    private final PortalIdentity portalIdentity;

    private record Bundle(Long id, String number, List<Long> terms, List<Long> milestones, List<Long> payments) { }
    private record Change(String statement, String label) { }

    private OaPortalContractDatabaseChecks(OaOperationsDatabaseChecks fixture) throws Exception {
        this.fixture = fixture;
        publication = fixture.bean(ContractPortalPublicationService.class);
        contracts = fixture.bean(OaContractServiceImpl.class);
        fulfilment = fixture.bean(OaContractFulfilmentService.class);
        milestones = fixture.register(OaContractMilestoneServiceImpl.class);
        portal = fixture.mapper(PortalContractMapper.class);
        String code = "H3_PC_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO crm_customer(tenant_id,customer_code,customer_name,owner_id,dept_id,status,deleted) VALUES(100000,?,?,1,100,'ACTIVE',0)", code, code);
        customerId = fixture.jdbc.queryForObject("SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=?", Long.class, code);
        String email = UUID.randomUUID() + "@example.test";
        fixture.jdbc.update("INSERT INTO crm_contact(tenant_id,customer_id,contact_name,email,status,deleted,version) VALUES(100000,?,?,?,'ACTIVE',0,0)", customerId, code, email);
        Long contactId = fixture.jdbc.queryForObject("SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=?", Long.class, customerId);
        fixture.jdbc.update("INSERT INTO sys_portal_user(tenant_id,user_type,ref_biz_type,ref_biz_id,customer_id,login_account,password_hash,email,status,session_version) VALUES(100000,'CUSTOMER_CONTACT','CRM_CONTACT',?,?,?,'database-fixture-only',?,'ACTIVE',0)", contactId, customerId, code, email);
        Long userId = fixture.jdbc.queryForObject("SELECT portal_user_id FROM sys_portal_user WHERE tenant_id=100000 AND ref_biz_id=?", Long.class, contactId);
        portalIdentity = new PortalIdentity(userId, 100000L, customerId, contactId, 0, 0);
    }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        int before = checks.get();
        editor(1L, 0);
        try {
            OaPortalContractDatabaseChecks verification = new OaPortalContractDatabaseChecks(fixture);
            verification.selectionAndScope(); verification.openingConditions(); verification.identityBoundaries();
            verification.deletedItems(); verification.competition();
        } finally { identity(100000L, 1L); }
        System.out.println("H3_PORTAL_CONTRACT_DATABASE_CHECKS: assertions=" + (checks.get() - before)
                + "; failed=0; concurrency_groups=2; mysql=true; transactions=true; actual_mappers=true; approval_signature=database_fixture; authentication=false; redis=false; http=false; production_modified=false");
    }

    private static void editor(Long user, int scope) {
        identity(100000L, user); UserContext.setDsType(scope); UserContext.setPermissions(Set.of("oa:contract:edit"));
    }

    private Bundle create() {
        OaContract contract = new OaContract();
        String code = "H3_PC_" + UUID.randomUUID();
        contract.setContractNo(code); contract.setContractName(code); contract.setCounterpartyName("门户数据库验证客户");
        contract.setContractType("SALES"); contract.setAmount(number("100.01")); contract.setCurrency("CNY");
        contract.setOwnerId(1L); contract.setOwnerName("内部负责人"); contract.setDeptId(100L); contract.setCustomerId(customerId);
        contract.setStartDate(LocalDate.now().plusMonths(1)); contract.setEndDate(LocalDate.now().plusMonths(2)); contract.setRemark("PRIVATE_CONTRACT_NOTE");
        Long id = contracts.createContract(contract);
        List<Long> termIds = new ArrayList<>(); List<Long> milestoneIds = new ArrayList<>(); List<Long> paymentIds = new ArrayList<>();
        for (int index = 1; index <= 2; index++) {
            termIds.add(term(id, index));
            OaContractMilestone milestone = new OaContractMilestone(); milestone.setContractId(id); milestone.setMilestoneNo(index);
            milestone.setMilestoneName("节点 " + index); milestone.setAmount(number("9007199254740993.01")); milestone.setOwnerName("PRIVATE_MILESTONE_OWNER");
            milestone.setCompletionRemark("PRIVATE_COMPLETION"); milestone.setAttachmentUrl("/private/secret.pdf");
            equal(true, milestones.saveMilestone(milestone), "milestone created by actual service"); milestoneIds.add(milestone.getId());
            OaContractPaymentSchedule payment = new OaContractPaymentSchedule(); payment.setContractId(id); payment.setPaymentNo(index);
            payment.setPaymentName("付款计划 " + index); payment.setAmount(number("1234567890123456.78")); payment.setActualAmount(number("0.01"));
            payment.setPlanDate(LocalDate.now().plusDays(index)); payment.setRemark("PRIVATE_PAYMENT_NOTE"); payment.setPayeeName("PRIVATE_PAYEE");
            equal(true, milestones.savePayment(payment), "payment created by actual service"); paymentIds.add(payment.getId());
        }
        return new Bundle(id, code, termIds, milestoneIds, paymentIds);
    }

    private Long term(Long contractId, int sequence) {
        OaContractFulfilmentTerm term = new OaContractFulfilmentTerm(); term.setContractId(contractId); term.setTermNo(sequence);
        term.setTermContent("履约条款 " + sequence); term.setRequirement("只展示所选要求 " + sequence); term.setDeadlineDate(LocalDate.now().plusDays(7));
        term.setRemark("PRIVATE_TERM_NOTE"); return fulfilment.saveTerm(term);
    }

    private ContractPortalSelectionRequest request(Bundle bundle, int version, int index) {
        ContractPortalSelectionRequest request = new ContractPortalSelectionRequest(); request.setVersion(version);
        request.setTermIds(index < 0 ? List.of() : List.of(bundle.terms().get(index).toString()));
        request.setMilestoneIds(index < 0 ? List.of() : List.of(bundle.milestones().get(index).toString()));
        request.setPaymentScheduleIds(index < 0 ? List.of() : List.of(bundle.payments().get(index).toString())); return request;
    }

    private void open(Bundle bundle) {
        String instance = "h3-pc-" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,status,start_time,end_time,deleted) VALUES(?,100000,'biz_contract',?,1,'PASSED',DATE_SUB(NOW(),INTERVAL 2 MINUTE),DATE_SUB(NOW(),INTERVAL 1 MINUTE),0)", instance, "CONTRACT:" + bundle.id());
        fixture.jdbc.update("UPDATE oa_contract SET instance_id=?,status='ACTIVE',signed_flag=1,our_signee_id=1,our_sign_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE),counterparty_signee='客户签署人',counterparty_sign_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE),signed_file_url='/private/database-fixture.pdf',version=version+1 WHERE contract_id=?", instance, bundle.id());
    }

    private Page<PortalContractVO> list(Bundle bundle) { return portal.opened(new Page<>(1, 10), portalIdentity, bundle.number(), LocalDateTime.now()); }

    private void hidden(Bundle bundle, String label) {
        equal(0L, list(bundle).getTotal(), label + ": count excludes contract");
        equal(0, list(bundle).getRecords().size(), label + ": list excludes contract");
        equal(null, portal.detail(portalIdentity, bundle.id(), LocalDateTime.now()), label + ": detail rejected");
        equal(0, portal.terms(portalIdentity, bundle.id(), LocalDateTime.now()).size(), label + ": terms hidden");
        equal(0, portal.milestones(portalIdentity, bundle.id(), LocalDateTime.now()).size(), label + ": milestones hidden");
        equal(0, portal.payments(portalIdentity, bundle.id(), LocalDateTime.now()).size(), label + ": payments hidden");
    }

    private void selectionAndScope() throws Exception {
        Bundle bundle = create(); Bundle other = create();
        ContractPortalPublicationVO original = publication.read(bundle.id());
        equal(List.of(), original.termIds(), "unselected terms start private"); equal(false, original.contractReady(), "draft does not satisfy opening conditions");
        hidden(bundle, "draft contract");
        ContractPortalPublicationVO selected = publication.save(bundle.id(), request(bundle, original.version(), 0));
        equal(original.version() + 1, selected.version(), "selection increments contract version once");
        equal(List.of(bundle.terms().get(0).toString()), selected.termIds(), "only explicitly selected term stored");
        expect(409, () -> publication.save(bundle.id(), request(bundle, original.version(), 1)));
        ContractPortalSelectionRequest foreign = request(bundle, selected.version(), 1); foreign.setPaymentScheduleIds(List.of(other.payments().get(0).toString()));
        expect(409, () -> publication.save(bundle.id(), foreign));
        equal(selected, publication.read(bundle.id()), "invalid third list leaves all three lists and version unchanged");
        fixture.jdbc.update("UPDATE oa_contract_milestone SET tenant_id=100001 WHERE id=?", other.milestones().get(0));
        foreign.setPaymentScheduleIds(List.of()); foreign.setMilestoneIds(List.of(other.milestones().get(0).toString()));
        expect(409, () -> publication.save(bundle.id(), foreign));
        equal(selected, publication.read(bundle.id()), "foreign tenant item does not partially revoke selection");
        UserContext.setPermissions(Set.of()); expect(403, () -> publication.read(bundle.id())); expect(403, () -> publication.save(bundle.id(), request(bundle, selected.version(), -1)));
        editor(2L, 4); expect(404, () -> publication.read(bundle.id())); expect(404, () -> publication.save(bundle.id(), request(bundle, selected.version(), -1)));
        editor(1L, 4); equal(selected, publication.read(bundle.id()), "owner data scope accepted");
        identity(100001L, 1L); UserContext.setPermissions(Set.of("oa:contract:edit")); expect(404, () -> publication.read(bundle.id())); editor(1L, 0);
        OaContract update = contracts.getContractInfo(bundle.id()); update.setPortalTermIds("[]"); update.setPortalMilestoneIds("[]"); update.setPortalPaymentScheduleIds("[]");
        update.setRemark("PRIVATE_CHANGED_NOTE"); contracts.updateContract(update);
        equal(selected.termIds(), publication.read(bundle.id()).termIds(), "ordinary business update cannot overwrite publication");
        OaContract direct = contracts.getContractInfo(bundle.id()); direct.setPortalTermIds("[]"); direct.setPortalMilestoneIds("[]"); direct.setPortalPaymentScheduleIds("[]");
        fixture.mapper(OaContractMapper.class).updateById(direct);
        equal(selected.paymentScheduleIds(), publication.read(bundle.id()).paymentScheduleIds(), "ordinary mapper update skips publication columns");
        fixture.jdbc.update("UPDATE oa_contract SET amount=9999999999999999.99 WHERE contract_id=?", bundle.id());
        open(bundle); equal(1L, list(bundle).getTotal(), "real mapper permits approved signed fixture despite future start date");
        String contactEmail = fixture.jdbc.queryForObject("SELECT email FROM crm_contact WHERE contact_id=?", String.class, portalIdentity.contactId());
        try {
            fixture.jdbc.update("UPDATE crm_contact SET email='opaque-encrypted-contact-fixture' WHERE contact_id=?", portalIdentity.contactId());
            equal(1L, list(bundle).getTotal(), "database projection uses authenticated contact version without comparing ciphertext to invitation email");
        } finally { fixture.jdbc.update("UPDATE crm_contact SET email=? WHERE contact_id=?", contactEmail, portalIdentity.contactId()); }
        equal("9999999999999999.99", portal.detail(portalIdentity, bundle.id(), LocalDateTime.now()).getAmount(), "maximum contract decimal retained through MySQL mapping");
        equal(List.of(bundle.terms().get(0).toString()), portal.terms(portalIdentity, bundle.id(), LocalDateTime.now()).stream().map(PortalContractVO.Term::getTermId).toList(), "unselected term absent from actual query");
        equal("9007199254740993.01", portal.milestones(portalIdentity, bundle.id(), LocalDateTime.now()).get(0).getAmount(), "milestone decimal beyond JS integer precision is exact");
        equal("0.01", portal.payments(portalIdentity, bundle.id(), LocalDateTime.now()).get(0).getActualAmount(), "actual payment cents stay exact");
        String publicJson = fixture.json.writeValueAsString(List.of(portal.detail(portalIdentity, bundle.id(), LocalDateTime.now()), portal.terms(portalIdentity, bundle.id(), LocalDateTime.now()), portal.milestones(portalIdentity, bundle.id(), LocalDateTime.now()), portal.payments(portalIdentity, bundle.id(), LocalDateTime.now())));
        equal(false, publicJson.contains("PRIVATE_") || publicJson.contains("/private/") || publicJson.contains("ownerId"), "actual database projections omit confidential fields");
        ContractPortalPublicationVO latest = publication.read(bundle.id()); publication.save(bundle.id(), request(bundle, latest.version(), -1));
        equal(0, portal.terms(portalIdentity, bundle.id(), LocalDateTime.now()).size(), "term withdrawal immediate");
        equal(0, portal.milestones(portalIdentity, bundle.id(), LocalDateTime.now()).size(), "milestone withdrawal immediate");
        equal(0, portal.payments(portalIdentity, bundle.id(), LocalDateTime.now()).size(), "payment withdrawal immediate");
    }

    private void openingConditions() {
        Bundle bundle = create(); publication.save(bundle.id(), request(bundle, publication.read(bundle.id()).version(), 0)); open(bundle);
        String instance = fixture.jdbc.queryForObject("SELECT instance_id FROM oa_contract WHERE contract_id=?", String.class, bundle.id());
        for (Change change : List.of(
                new Change("UPDATE oa_contract SET status='DRAFT' WHERE contract_id=?", "draft status"),
                new Change("UPDATE oa_contract SET status='PENDING' WHERE contract_id=?", "pending status"),
                new Change("UPDATE oa_contract SET status='REJECTED' WHERE contract_id=?", "rejected status"),
                new Change("UPDATE oa_contract SET status='CANCELLED' WHERE contract_id=?", "cancelled status"),
                new Change("UPDATE oa_contract SET signed_flag=0 WHERE contract_id=?", "unsigned flag"),
                new Change("UPDATE oa_contract SET our_signee_id=NULL WHERE contract_id=?", "our signature missing"),
                new Change("UPDATE oa_contract SET our_sign_time=DATE_ADD(NOW(),INTERVAL 1 DAY) WHERE contract_id=?", "future our signature"),
                new Change("UPDATE oa_contract SET counterparty_sign_time=NULL WHERE contract_id=?", "counterparty signature missing"),
                new Change("UPDATE oa_contract SET counterparty_sign_time=DATE_ADD(NOW(),INTERVAL 1 DAY) WHERE contract_id=?", "future counterparty signature"),
                new Change("UPDATE oa_contract SET counterparty_signee='  ' WHERE contract_id=?", "blank signer"),
                new Change("UPDATE oa_contract SET signed_file_url=' ' WHERE contract_id=?", "missing signature evidence"),
                new Change("UPDATE oa_contract SET deleted=1 WHERE contract_id=?", "deleted contract"),
                new Change("UPDATE oa_contract SET customer_id=NULL WHERE contract_id=?", "unbound company"),
                new Change("UPDATE oa_contract SET tenant_id=100001 WHERE contract_id=?", "foreign tenant contract"))) {
            fixture.jdbc.update(change.statement(), bundle.id()); hidden(bundle, change.label());
            fixture.jdbc.update("UPDATE oa_contract SET tenant_id=100000,customer_id=?,deleted=0,status='ACTIVE',signed_flag=1,our_signee_id=1,our_sign_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE),counterparty_sign_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE),counterparty_signee='签署人',signed_file_url='/private/database-fixture.pdf' WHERE contract_id=?", customerId, bundle.id());
        }
        for (Change change : List.of(
                new Change("UPDATE wf_process_instance SET status='REJECTED' WHERE instance_id=?", "failed workflow"),
                new Change("UPDATE wf_process_instance SET process_def_key='other' WHERE instance_id=?", "foreign workflow definition"),
                new Change("UPDATE wf_process_instance SET business_key='CONTRACT:0' WHERE instance_id=?", "wrong business binding"),
                new Change("UPDATE wf_process_instance SET tenant_id=100001 WHERE instance_id=?", "foreign approval tenant"),
                new Change("UPDATE wf_process_instance SET end_time=DATE_ADD(NOW(),INTERVAL 1 DAY) WHERE instance_id=?", "future approval completion"),
                new Change("UPDATE wf_process_instance SET deleted=1 WHERE instance_id=?", "deleted approval"))) {
            fixture.jdbc.update(change.statement(), instance); hidden(bundle, change.label());
            fixture.jdbc.update("UPDATE wf_process_instance SET tenant_id=100000,status='PASSED',process_def_key='biz_contract',business_key=?,deleted=0,end_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE instance_id=?", "CONTRACT:" + bundle.id(), instance);
        }
        for (String status : List.of("APPROVED", "SEALING", "SEALED", "ACTIVE", "EXPIRED", "TERMINATED")) {
            fixture.jdbc.update("UPDATE oa_contract SET status=?,start_date=NULL WHERE contract_id=?", status, bundle.id());
            equal(1L, list(bundle).getTotal(), "approved signed history open without start date: " + status);
        }
        fixture.jdbc.update("UPDATE wf_process_instance SET status='AUTO_PASSED' WHERE instance_id=?", instance);
        equal(1L, list(bundle).getTotal(), "automatic passed approval also accepted");
    }

    private void identityBoundaries() {
        Bundle bundle = create(); publication.save(bundle.id(), request(bundle, publication.read(bundle.id()).version(), 0)); open(bundle);
        equal(true, portal.activeIdentity(portalIdentity), "current portal database identity active");
        List<Change> changes = List.of(
                new Change("UPDATE sys_portal_user SET status='DISABLED' WHERE portal_user_id=?", "disabled account"),
                new Change("UPDATE sys_portal_user SET deleted=1 WHERE portal_user_id=?", "deleted account"),
                new Change("UPDATE sys_portal_user SET session_version=1 WHERE portal_user_id=?", "revoked session version"),
                new Change("UPDATE sys_portal_user SET email='changed@example.test',session_version=1 WHERE portal_user_id=?", "account email change with required session revocation"));
        String email = fixture.jdbc.queryForObject("SELECT email FROM sys_portal_user WHERE portal_user_id=?", String.class, portalIdentity.portalUserId());
        for (Change change : changes) {
            fixture.jdbc.update(change.statement(), portalIdentity.portalUserId()); equal(false, portal.activeIdentity(portalIdentity), change.label()); hidden(bundle, change.label());
            fixture.jdbc.update("UPDATE sys_portal_user SET status='ACTIVE',deleted=0,session_version=0,email=? WHERE portal_user_id=?", email, portalIdentity.portalUserId());
        }
        for (Change change : List.of(new Change("UPDATE crm_contact SET status='INACTIVE' WHERE contact_id=?", "disabled contact"),
                new Change("UPDATE crm_contact SET version=1 WHERE contact_id=?", "changed contact version"),
                new Change("UPDATE crm_contact SET customer_id=0 WHERE contact_id=?", "contact moved to other company"))) {
            fixture.jdbc.update(change.statement(), portalIdentity.contactId()); hidden(bundle, change.label());
            fixture.jdbc.update("UPDATE crm_contact SET status='ACTIVE',version=0,customer_id=? WHERE contact_id=?", customerId, portalIdentity.contactId());
        }
        fixture.jdbc.update("UPDATE crm_customer SET status='INACTIVE' WHERE customer_id=?", customerId); hidden(bundle, "disabled company");
        fixture.jdbc.update("UPDATE crm_customer SET status='ACTIVE' WHERE customer_id=?", customerId);
        String tenantStatus = fixture.jdbc.queryForObject("SELECT status FROM sys_tenant WHERE tenant_id=100000", String.class);
        try { fixture.jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=100000"); hidden(bundle, "disabled tenant"); }
        finally { fixture.jdbc.update("UPDATE sys_tenant SET status=? WHERE tenant_id=100000", tenantStatus); }
        equal(1L, list(bundle).getTotal(), "restored database identity reads fixture again");
    }

    private void deletedItems() {
        Bundle bundle = create(); publication.save(bundle.id(), request(bundle, publication.read(bundle.id()).version(), 0));
        fulfilment.removeTerm(bundle.terms().get(0));
        equal(List.of(), publication.read(bundle.id()).termIds(), "term deletion clears stored selection");
        equal(bundle.terms().get(0), term(bundle.id(), 1), "existing business code reuses deleted term identifier");
        equal(List.of(), publication.read(bundle.id()).termIds(), "recreated term remains private until explicitly selected again");
        equal(true, milestones.removeMilestone(bundle.milestones().get(0)), "selected milestone deletion succeeds");
        equal(List.of(), publication.read(bundle.id()).milestoneIds(), "milestone selection cleared transactionally");
        equal(true, milestones.removePayment(bundle.payments().get(0)), "selected payment deletion succeeds");
        equal(List.of(), publication.read(bundle.id()).paymentScheduleIds(), "payment selection cleared transactionally");
        publication.save(bundle.id(), request(bundle, publication.read(bundle.id()).version(), 1));
        ContractPortalPublicationVO before = publication.read(bundle.id());
        fails(IllegalStateException.class, () -> new TransactionTemplate(fixture.transactions).execute(status -> {
            milestones.removePayment(bundle.payments().get(1)); throw new IllegalStateException("forced isolated rollback");
        }), "failed surrounding transaction rolls back deletion and publication together");
        equal(before, publication.read(bundle.id()), "rollback retains all selections and contract version");
        OaContractMilestone moved = new OaContractMilestone(); moved.setId(bundle.milestones().get(1)); moved.setContractId(bundle.id() + 1);
        fails(IllegalArgumentException.class, () -> milestones.updateMilestone(moved), "published node cannot be moved to another contract");
        OaContractPaymentSchedule deleted = new OaContractPaymentSchedule(); deleted.setId(bundle.payments().get(1)); deleted.setDeleted(1);
        fails(IllegalArgumentException.class, () -> milestones.updatePayment(deleted), "ordinary update cannot bypass transactional deletion");
    }

    private void competition() throws Exception {
        Bundle bundle = create();
        ContractPortalSelectionRequest unordered = request(bundle, publication.read(bundle.id()).version(), 0);
        unordered.setTermIds(List.of(bundle.terms().get(1).toString(), bundle.terms().get(0).toString()));
        unordered.setMilestoneIds(List.of(bundle.milestones().get(1).toString(), bundle.milestones().get(0).toString()));
        unordered.setPaymentScheduleIds(List.of(bundle.payments().get(1).toString(), bundle.payments().get(0).toString()));
        ContractPortalPublicationVO normalized = publication.save(bundle.id(), unordered);
        equal(bundle.terms().stream().map(String::valueOf).toList(), normalized.termIds(), "multiple term selection does not depend on locking query order");
        equal(bundle.milestones().stream().map(String::valueOf).toList(), normalized.milestoneIds(), "multiple milestone selection does not depend on locking query order");
        equal(bundle.payments().stream().map(String::valueOf).toList(), normalized.paymentScheduleIds(), "multiple payment selection does not depend on locking query order");
        for (int round = 0; round < 2; round++) {
            int version = publication.read(bundle.id()).version();
            CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
            ExecutorService executor = Executors.newFixedThreadPool(2);
            try {
                List<Future<Integer>> attempts = new ArrayList<>();
                for (int index = 0; index < 2; index++) {
                    int selection = index;
                    attempts.add(executor.submit(() -> {
                        editor(1L, 0); ready.countDown();
                        try {
                            if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("concurrency start timeout");
                            try { publication.save(bundle.id(), request(bundle, version, selection)); return 200; }
                            catch (ServiceException conflict) { return conflict.getCode(); }
                        } finally { UserContext.clear(); TenantContext.clear(); }
                    }));
                }
                equal(true, ready.await(10, TimeUnit.SECONDS), "both real transaction workers ready"); start.countDown();
                List<Integer> outcomes = new ArrayList<>(); for (Future<Integer> attempt : attempts) outcomes.add(attempt.get(30, TimeUnit.SECONDS));
                equal(List.of(200, 409), outcomes.stream().sorted().toList(), "same contract version has exactly one transaction winner");
                ContractPortalPublicationVO after = publication.read(bundle.id()); equal(version + 1, after.version(), "race increments contract version once");
                int winner = after.termIds().equals(List.of(bundle.terms().get(0).toString())) ? 0 : 1;
                equal(List.of(bundle.milestones().get(winner).toString()), after.milestoneIds(), "milestone list belongs to the same winner");
                equal(List.of(bundle.payments().get(winner).toString()), after.paymentScheduleIds(), "payment list belongs to the same winner");
            } finally { start.countDown(); executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); }
        }
    }

    private static void expect(int status, Runnable action) {
        try { action.run(); }
        catch (ServiceException denied) { equal(status, denied.getCode(), "expected denied status"); return; }
        throw new AssertionError("Expected denied status " + status);
    }
}
