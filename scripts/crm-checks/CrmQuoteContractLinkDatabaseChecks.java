package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.deal.CrmQuoteContractLinkService;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmQuoteContractLinkDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmQuoteContractLinkService links;
    private final CrmQuoteServiceImpl quotes;

    private CrmQuoteContractLinkDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; links = fixture.bean(CrmQuoteContractLinkService.class); quotes = fixture.bean(CrmQuoteServiceImpl.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity();
        CrmQuoteContractLinkDatabaseChecks verification = new CrmQuoteContractLinkDatabaseChecks(fixture);
        verification.linkAndAccept(); verification.validation(); verification.currency(); verification.competition();
        System.out.println("H3_QUOTE_CONTRACT_LINK_CRM_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=1; mysql=true; transactions=true; quote_entrypoint=true; contract_source=database_fixture; oa_http=false; production_modified=false");
    }

    private CrmQuote source() { return fixture.quote(fixture.customer("quote-contract-link"), null, null); }
    private CrmQuote current(CrmQuote quote) { return quotes.getQuoteDetail(quote.getQuoteId()); }

    private Long contract(CrmQuote quote) {
        String number = "QL_" + UUID.randomUUID();
        fixture.jdbc.update("INSERT INTO oa_contract (tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,customer_id,source_type,source_id,owner_id,dept_id,status,version,deleted) VALUES (100000,?,'来源关联验证','来源客户','SALES',100,'CNY',?,'CRM_QUOTE',?,1,100,'DRAFT',0,0)", number, quote.getCustomerId(), quote.getQuoteId());
        Long id = fixture.jdbc.queryForObject("SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_no=?", Long.class, number);
        fixture.jdbc.update("INSERT INTO crm_deal_team (tenant_id,biz_type,biz_id,team_version,current_flag,sales_user_id,sales_user_name,dept_id,role_type,allocated_percentage,allocated_amount) VALUES (100000,'CONTRACT',?,1,1,1,'source owner',100,'OWNER',1,100)", id);
        return id;
    }

    private void linkAndAccept() {
        CrmQuote quote = source(); Long contractId = contract(quote);
        fixture.jdbc.update("UPDATE crm_quote SET quote_name='同期保存的新名称',remark='同期保存的说明',version=version+1 WHERE quote_id=?", quote.getQuoteId());
        equal(contractId, links.link(quote.getQuoteId(), contractId), "trusted contract is linked after unrelated edit");
        CrmQuote linked = current(quote);
        equal(2, linked.getVersion(), "link advances current rather than old business version"); equal("同期保存的新名称", linked.getQuoteName(), "link preserves concurrent name");
        equal("同期保存的说明", linked.getRemark(), "link preserves concurrent remark");
        equal(contractId, quotes.createContractDraft(quote.getQuoteId()), "existing contract entrypoint verifies and returns its actual source");
        equal(2, current(quote).getVersion(), "replay does not update version again");
        fixture.jdbc.update("UPDATE crm_quote SET status='SENT' WHERE quote_id=?", quote.getQuoteId());
        check(quotes.acceptQuote(quote.getQuoteId()), "accept reads version after the contract link");
        equal("ACCEPTED", current(quote).getStatus(), "accept updates actual quote state"); equal(3, current(quote).getVersion(), "accept advances once");
        check(quotes.acceptQuote(quote.getQuoteId()), "repeated accept is idempotent"); equal(3, current(quote).getVersion(), "repeated accept keeps one transition");
    }

    private void validation() {
        CrmQuote quote = source(); Long contractId = contract(quote);
        CrmQuote other = source(); Long otherContract = contract(other);
        fails(IllegalArgumentException.class, () -> links.link(quote.getQuoteId(), otherContract), "foreign quote source cannot be linked");
        fixture.jdbc.update("UPDATE oa_contract SET currency='EUR' WHERE contract_id=?", contractId);
        fails(IllegalArgumentException.class, () -> links.link(quote.getQuoteId(), contractId), "mismatching contract currency is rejected");
        fixture.jdbc.update("UPDATE oa_contract SET currency='CNY',customer_id=? WHERE contract_id=?", other.getCustomerId(), contractId);
        fails(IllegalArgumentException.class, () -> links.link(quote.getQuoteId(), contractId), "mismatching contract customer is rejected");
        fixture.jdbc.update("UPDATE oa_contract SET customer_id=?,deleted=1 WHERE contract_id=?", quote.getCustomerId(), contractId);
        fails(IllegalArgumentException.class, () -> links.link(quote.getQuoteId(), contractId), "deleted contract is rejected");
        fixture.jdbc.update("UPDATE oa_contract SET deleted=0 WHERE contract_id=?", contractId);
        for (long tenant : List.of(100000L, 100001L)) {
            identity(tenant, 990901L, 4);
            try { fails(IllegalArgumentException.class, () -> links.link(quote.getQuoteId(), contractId), "contract link is protected by tenant and customer scope"); }
            finally { identity(); }
        }
        equal(null, current(quote).getContractId(), "rejected link leaves reference empty"); equal(0, current(quote).getVersion(), "rejected link leaves version unchanged");
        CrmQuote create = new CrmQuote(); create.setContractId(contractId);
        fails(IllegalArgumentException.class, () -> quotes.createQuote(create), "new quote cannot forge existing contract association");
        CrmQuote edit = current(quote); edit.setContractId(contractId);
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(edit), "ordinary quote edit cannot forge contract association");
    }

    private void currency() {
        CrmQuote quote = source(); contract(quote);
        equal(true, current(quote).getCurrencyLocked(), "only copied contract history locks source quote before link delivery");
        CrmQuote currencyEdit = current(quote); currencyEdit.setCurrency("EUR");
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(currencyEdit), "source currency cannot change while the contract link is pending");
        CrmQuote customerEdit = current(quote); customerEdit.setCustomerId(fixture.customer("changed quote contract customer").getCustomerId());
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(customerEdit), "source customer cannot change after a copied contract exists");
        CrmQuote normal = current(quote); normal.setRemark("allowed local quote edit"); check(quotes.updateQuote(normal), "non-source local fields remain editable");
        equal("allowed local quote edit", current(quote).getRemark(), "local edit persists without replacing source history");
    }

    private void competition() throws Exception {
        CrmQuote quote = source(); Long contractId = contract(quote); CountDownLatch barrier = new CountDownLatch(2);
        int[] outcomes = fixture.parallel(() -> {
            barrier.countDown(); if (!barrier.await(10, TimeUnit.SECONDS)) throw new AssertionError("link barrier timed out");
            return links.link(quote.getQuoteId(), contractId).equals(contractId) ? 1 : 0;
        }, () -> {
            barrier.countDown(); if (!barrier.await(10, TimeUnit.SECONDS)) throw new AssertionError("link barrier timed out");
            return links.link(quote.getQuoteId(), contractId).equals(contractId) ? 1 : 0;
        });
        equal(2, outcomes[0] + outcomes[1], "concurrent delivery succeeds idempotently for both callers");
        equal(1, current(quote).getVersion(), "concurrent delivery writes the quote link once"); equal(contractId, current(quote).getContractId(), "concurrent delivery retains the same trusted source");
    }
}
