package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuoteLine;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.deal.CrmQuoteTeamService;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmQuoteTeamDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmQuoteTeamService teams;
    private final CrmQuoteServiceImpl quotes;

    private CrmQuoteTeamDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; teams = fixture.bean(CrmQuoteTeamService.class); quotes = fixture.bean(CrmQuoteServiceImpl.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        CrmQuoteTeamDatabaseChecks checks = new CrmQuoteTeamDatabaseChecks(fixture);
        checks.defaultsAndHistory(); checks.copySource(); checks.linesRoundTrip(); checks.untrustedAmounts(); checks.currency(); checks.validation(); checks.ownerAndScope(); checks.competition();
        System.out.println("H3_QUOTE_TEAM_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; mysql=true; quote_entrypoints=true; historical_currency_lock=true; concurrency_groups=5; hr=interface_double; http=false; production_modified=false");
    }

    private Long create(String currency) {
        CrmQuote quote = new CrmQuote(); quote.setCustomerId(fixture.customer("h3-quote-team").getCustomerId());
        quote.setQuoteName("报价团队验收"); quote.setQuoteNo("CHECK-" + UUID.randomUUID()); quote.setTotalAmount(new BigDecimal("100.01")); quote.setCurrency(currency); quote.setOwnerId(1L);
        check(quotes.createQuote(quote), "real quote creation succeeds"); return quote.getQuoteId();
    }

    private CrmQuote entity(Long id) { return quotes.getQuoteDetail(id); }

    private void linesRoundTrip() {
        Long id = create("CNY");
        CrmQuoteLine line = new CrmQuoteLine(); line.setProductName("真实报价明细"); line.setQuantity(BigDecimal.ONE); line.setUnitPrice(new BigDecimal("100.01"));
        CrmQuote initial = entity(id); initial.setQuoteLines(List.of(line));
        check(quotes.updateQuote(initial), "quote accepts first actual line");
        CrmQuote persisted = entity(id); Long oldLineId = persisted.getQuoteLines().get(0).getQuoteLineId();
        persisted.setCurrency("USD");
        check(quotes.updateQuote(persisted), "detail round trip replaces line without primary-key collision");
        CrmQuote refreshed = entity(id);
        equal("USD", refreshed.getCurrency(), "round trip persists normal quote edit");
        equal(1, refreshed.getQuoteLines().size(), "round trip leaves exactly one active line");
        check(!oldLineId.equals(refreshed.getQuoteLines().get(0).getQuoteLineId()), "replacement line gets a new server-owned identity");
        decimal("100.01", refreshed.getTotalAmount(), "round trip preserves trusted existing line amount");
        Long secondId = create("CNY"); CrmQuote second = entity(secondId);
        second.setQuoteLines(refreshed.getQuoteLines());
        check(quotes.updateQuote(second), "foreign line identifiers cannot overwrite existing rows");
        equal(1, entity(id).getQuoteLines().size(), "reused incoming line id leaves original quote untouched");
        check(!refreshed.getQuoteLines().get(0).getQuoteLineId().equals(entity(id).getQuoteLines().get(0).getQuoteLineId()), "copied quote lines have distinct identities");
    }

    private void untrustedAmounts() {
        CrmQuote quote = new CrmQuote(); quote.setCustomerId(fixture.customer("h3-quote-amount").getCustomerId());
        quote.setQuoteName("报价服务端金额验收"); quote.setOwnerId(1L); quote.setTotalAmount(new BigDecimal("999999.99")); quote.setTaxAmount(new BigDecimal("999999.99"));
        CrmQuoteLine line = new CrmQuoteLine(); line.setProductName("实际报价金额"); line.setQuantity(new BigDecimal("2.50")); line.setUnitPrice(new BigDecimal("10.01"));
        line.setDiscountRate(new BigDecimal("95")); line.setTaxRate(new BigDecimal("13"));
        line.setLineAmount(new BigDecimal("888888.88")); line.setTaxAmount(new BigDecimal("777777.77")); quote.setQuoteLines(List.of(line));
        check(quotes.createQuote(quote), "quote creation recalculates rather than trusts client amounts");
        CrmQuote created = entity(quote.getQuoteId());
        decimal("23.77", created.getTotalAmount(), "created quote total follows quantity price and percent discount");
        decimal("3.09", created.getTaxAmount(), "created quote tax follows rounded server subtotal");
        decimal("23.77", created.getQuoteLines().get(0).getLineAmount(), "created line ignores forged subtotal");
        decimal("3.09", created.getQuoteLines().get(0).getTaxAmount(), "created line ignores forged tax");
        created.getQuoteLines().get(0).setQuantity(new BigDecimal("3.00"));
        check(quotes.updateQuote(created), "quote editing recalculates stale persisted amounts");
        CrmQuote edited = entity(quote.getQuoteId());
        decimal("28.53", edited.getTotalAmount(), "edited quote subtotal uses changed quantity");
        decimal("3.71", edited.getTaxAmount(), "edited quote tax uses changed rounded subtotal");
        decimal("28.53", teams.read(quote.getQuoteId(), null).members().get(0).allocatedAmount(), "team default preview uses trusted quote total");
    }

    private void copySource() {
        CrmOpportunityTeamService sourceTeams = fixture.bean(CrmOpportunityTeamService.class);
        CrmOpportunityServiceImpl opportunities = fixture.bean(CrmOpportunityServiceImpl.class);
        CrmOpportunity source = new CrmOpportunity();
        source.setCustomerId(fixture.customer("h3-quote-copy").getCustomerId()); source.setOpportunityName("报价来源商机");
        source.setOwnerId(1L); source.setExpectedAmount(new BigDecimal("200.00"));
        opportunities.createOpportunity(source);
        CrmDealTeamView sourceTeam = sourceTeams.save(source.getOpportunityId(), request(sourceTeams.read(source.getOpportunityId(), null),
                member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")));
        CrmQuote request = new CrmQuote(); request.setCustomerId(source.getCustomerId()); request.setOpportunityId(source.getOpportunityId());
        request.setQuoteName("从商机复制团队"); request.setTotalAmount(new BigDecimal("100.01")); request.setCurrency("USD");
        request.setOwnerId(2L); request.setOwnerName("客户端伪造负责人"); request.setOpportunityName("客户端伪造来源名称");
        check(quotes.createQuote(request), "quote creation copies current source team");
        Long id = request.getQuoteId(); CrmDealTeamView copied = teams.read(id, null);
        equal(1, copied.teamVersion(), "copied quote starts its own team version one");
        equal(0, copied.businessVersion(), "copy is part of creation without artificial edit");
        equal(1L, copied.ownerId(), "copied owner comes from source team, not caller");
        equal(source.getOpportunityName(), entity(id).getOpportunityName(), "source name comes from accessible opportunity");
        equal("USD", copied.currency(), "copy does not convert quote currency");
        equal(true, entity(id).getCurrencyLocked(), "copied physical team locks quote currency");
        equal(2, copied.members().size(), "copy preserves all source members");
        decimal("60.01", copied.members().get(0).allocatedAmount(), "copy recalculates owner preview from quote amount");
        decimal("40.00", copied.members().get(1).allocatedAmount(), "copy recalculates collaborator preview from quote amount");
        sourceTeams.save(source.getOpportunityId(), request(sourceTeam, member(1, "OWNER", "0.3"), member(2, "CO_SELLER", "0.7")));
        decimal("0.6", teams.read(id, null).members().get(0).allocatedPercentage(), "later source changes do not overwrite copied quote");
        teams.save(id, request(copied, member(1, "OWNER", "0.5"), member(2, "CO_SELLER", "0.5")));
        decimal("0.3", sourceTeams.read(source.getOpportunityId(), null).members().get(0).allocatedPercentage(), "quote changes never modify source team");
        decimal("0.6", teams.read(id, 1).members().get(0).allocatedPercentage(), "copied historical quote team remains immutable");
        Integer baseline = fixture.jdbc.queryForObject("SELECT COUNT(*) FROM crm_quote WHERE tenant_id=100000", Integer.class);
        request.setQuoteId(null); request.setQuoteNo("COPY-" + UUID.randomUUID()); request.setCustomerId(fixture.customer("h3-quote-other").getCustomerId());
        fails(IllegalArgumentException.class, () -> quotes.createQuote(request), "copy from another customer is refused before creation");
        request.setCustomerId(source.getCustomerId()); request.setOpportunityId(Long.MAX_VALUE);
        fails(IllegalArgumentException.class, () -> quotes.createQuote(request), "missing source cannot create a quote with fake team");
        request.setOpportunityId(source.getOpportunityId());
        fails(IllegalStateException.class, () -> fixture.bean(TransactionTemplate.class).execute(status -> {
            quotes.createQuote(request); throw new IllegalStateException("source copy rollback fixture");
        }), "downstream failure rolls back quote and copied team together");
        equal(baseline, fixture.jdbc.queryForObject("SELECT COUNT(*) FROM crm_quote WHERE tenant_id=100000", Integer.class), "failed creation leaves no partial quote");
        equal(0, fixture.jdbc.queryForObject("SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=?", Integer.class, request.getQuoteId()), "rolled back quote has no orphan team");
    }
    private CrmDealTeamRequest.Member member(long id, String role, String percentage) {
        return new CrmDealTeamRequest.Member(id, role, new BigDecimal(percentage));
    }
    private CrmDealTeamRequest request(CrmDealTeamView view, CrmDealTeamRequest.Member... members) {
        return new CrmDealTeamRequest(view.teamVersion(), view.businessVersion(), List.of(members), "报价团队验收");
    }

    private void defaultsAndHistory() {
        Long id = create("CNY"); CrmDealTeamView original = teams.read(id, null);
        equal(0, original.teamVersion(), "unconfigured quote reports default version zero");
        equal(0, original.businessVersion(), "quote detail carries initial optimistic version");
        equal(List.of(0), original.versions(), "default has no fabricated history");
        equal(false, entity(id).getCurrencyLocked(), "unconfigured quote currency is unlocked");
        equal(1, original.members().size(), "default quote has only actual owner");
        decimal("1", original.members().get(0).allocatedPercentage(), "default quote owner has 100 percent");
        decimal("100.01", original.amount(), "default quote preview uses persisted amount");
        CrmQuote filter = new CrmQuote(); filter.setCustomerId(entity(id).getCustomerId());
        CrmQuote listed = quotes.queryPage(filter, new PageQuery()).getRows().get(0);
        equal(0, listed.getVersion(), "quote list also carries edit version");
        equal(false, listed.getCurrencyLocked(), "quote list carries currency policy");
        CrmDealTeamView first = teams.save(id, request(original, member(1, "OWNER", "0.5"), member(2, "CO_SELLER", "0.5")));
        equal(1, first.teamVersion(), "first explicit team creates version one");
        equal(1, first.businessVersion(), "team write advances actual quote version");
        equal(true, entity(id).getCurrencyLocked(), "first persisted team locks currency");
        decimal("50.00", first.members().get(0).allocatedAmount(), "quote owner absorbs rounded cent difference");
        CrmDealTeamView second = teams.save(id, request(first, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")));
        equal(List.of(2, 1), second.versions(), "quote preserves whole team history");
        equal(true, teams.read(id, 1).historical(), "old quote team is labelled historical");
        decimal("0.5", teams.read(id, 1).members().get(0).allocatedPercentage(), "old quote ratio remains unchanged");
        CrmQuote updated = entity(id); updated.setTotalAmount(new BigDecimal("200.03")); quotes.updateQuote(updated);
        equal(2, teams.read(id, null).teamVersion(), "ordinary amount change keeps current team version");
        decimal("200.03", teams.read(id, null).amount(), "ordinary amount edit refreshes current preview");
        decimal("100.01", teams.read(id, 1).amount(), "ordinary amount edit cannot alter historical preview");
        fixture.jdbc.update("UPDATE crm_deal_team SET commission_rate=0.1250, commission_amount=15.00 WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=? AND current_flag=1 AND sales_user_id=1", id);
        JsonNode privateView = fixture.json.valueToTree(teams.read(id, null));
        equal(false, privateView.path("members").get(0).has("commissionRate"), "nonempty quote commission rate is excluded without payroll permission");
        equal(false, privateView.path("members").get(0).has("commissionAmount"), "nonempty quote commission amount is excluded without payroll permission");
        CrmDealTeamView current = teams.read(id, null);
        fails(IllegalStateException.class, () -> fixture.bean(TransactionTemplate.class).execute(status -> {
            teams.save(id, request(current, member(1, "OWNER", "1"))); throw new IllegalStateException("quote transaction rollback fixture");
        }), "later failure rolls back team retirement and quote owner transaction");
        equal(current.teamVersion(), teams.read(id, null).teamVersion(), "failed transaction preserves team version");
        equal(current.businessVersion(), entity(id).getVersion(), "failed transaction preserves quote version");
    }

    private void currency() {
        Long id = create("CNY"); CrmQuote unlocked = entity(id); unlocked.setCurrency("USD");
        check(quotes.updateQuote(unlocked), "quote without history can change currency");
        equal("USD", entity(id).getCurrency(), "unlocked currency change persists");
        CrmDealTeamView first = teams.save(id, request(teams.read(id, null), member(1, "OWNER", "1")));
        equal("USD", first.currency(), "initial team uses locked business currency");
        CrmQuote omitted = entity(id); omitted.setCurrency(null); omitted.setCurrencyLocked(false);
        quotes.updateQuote(omitted); equal("USD", entity(id).getCurrency(), "omitted currency retains USD rather than resetting to CNY");
        CrmQuote forged = entity(id); forged.setCurrency("CNY"); forged.setCurrencyLocked(false);
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(forged), "forged unlocked flag cannot bypass server history check");
        equal("USD", entity(id).getCurrency(), "rejected currency edit preserves persisted currency");
        equal("USD", teams.read(id, 1).currency(), "historical quote team cannot be re-labelled with new currency");
        CrmQuote invalid = entity(id); invalid.setCurrency("usd");
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(invalid), "currency code must be explicit uppercase");
        fixture.jdbc.update("UPDATE crm_deal_team SET current_flag=0 WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=?", id);
        equal(true, entity(id).getCurrencyLocked(), "retired historical rows still lock currency");
        CrmQuote retired = entity(id); retired.setCurrency("EUR");
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(retired), "no current team cannot unlock preserved history");
        equal("USD", entity(id).getCurrency(), "history-only rejection leaves currency intact");
    }

    private void validation() {
        Long id = create("CNY"); CrmDealTeamView original = teams.read(id, null);
        fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "0.7"), member(2, "CO_SELLER", "0.2"))), "quote percentages must total 100 percent");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "0.5"), member(2, "OWNER", "0.5"))), "quote requires unique owner");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "0.5"), member(1, "CO_SELLER", "0.5"))), "quote duplicate member is rejected");
        fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "SUPPORT", "1"))), "quote requires an owner");
        fails(IllegalArgumentException.class, () -> teams.save(id, new CrmDealTeamRequest(0, null, List.of(member(1, "OWNER", "1")), null)), "quote team requires business version");
        fixture.failEmployees = true;
        try { fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "1"))), "HR failure cannot create quote team"); }
        finally { fixture.failEmployees = false; }
        HrEmployeeSummaryVO employee = fixture.employee(2L); fixture.employeeDirectory.put(2L, employee);
        try {
            employee.setTenantId(100001L);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "0.5"), member(2, "CO_SELLER", "0.5"))), "foreign employee cannot join quote team");
            employee.setTenantId(100000L); employee.setActive(false);
            fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "0.5"), member(2, "CO_SELLER", "0.5"))), "departed employee cannot join quote team");
        } finally { fixture.employeeDirectory.remove(2L); }
        equal(0, teams.read(id, null).teamVersion(), "invalid quote teams never consume version");
        equal(false, entity(id).getCurrencyLocked(), "failed first team does not lock currency");
        CrmDealTeamView saved = teams.save(id, request(original, member(1, "OWNER", "1")));
        fails(IllegalArgumentException.class, () -> teams.save(id, request(original, member(1, "OWNER", "1"))), "stale quote and team versions are rejected");
        fails(IllegalArgumentException.class, () -> teams.read(id, 0), "default quote history cannot hide a persisted team");
        fails(IllegalArgumentException.class, () -> teams.read(id, 2), "unknown quote history version is rejected");
        CrmQuote stale = entity(id); stale.setVersion(saved.businessVersion() - 1);
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(stale), "ordinary quote edit requires exact version");
    }

    private void ownerAndScope() {
        Long id = create("CNY");
        CrmDealTeamView multiple = teams.save(id, request(teams.read(id, null), member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4")));
        CrmQuote forged = entity(id); forged.setOwnerId(2L);
        fails(IllegalArgumentException.class, () -> quotes.updateQuote(forged), "ordinary quote edit cannot bypass whole-team ownership change");
        identity(100000L, 2L, 4);
        try {
            fails(IllegalArgumentException.class, () -> teams.read(id, 1), "quote membership does not grant customer read scope");
            fails(IllegalArgumentException.class, () -> teams.save(id, request(multiple, member(2, "OWNER", "1"))), "quote member cannot take over inaccessible customer business");
        } finally { identity(); }
        identity(100001L, 1L, 0);
        try {
            fails(IllegalArgumentException.class, () -> teams.read(id, 1), "quote team history is tenant isolated");
            fails(IllegalArgumentException.class, () -> teams.save(id, request(multiple, member(1, "OWNER", "1"))), "foreign tenant cannot change quote team");
        } finally { identity(); }
        CrmDealTeamView assigned = teams.save(id, request(multiple, member(1, "CO_SELLER", "0.6"), member(2, "OWNER", "0.4")));
        equal(2L, entity(id).getOwnerId(), "quote owner changes with explicit team role");
        equal("CRM user 2", entity(id).getOwnerName(), "quote owner name is verified by HR");
        CrmCustomer handedCustomer = fixture.mapper(CrmCustomerMapper.class).selectById(entity(id).getCustomerId());
        handedCustomer.setOwnerId(2L); fixture.mapper(CrmCustomerMapper.class).updateById(handedCustomer);
        identity(100000L, 1L, 4);
        try {
            fails(IllegalArgumentException.class, () -> teams.save(id, request(assigned, member(1, "OWNER", "1"))), "former customer owner with self-only data scope cannot retain quote access after customer handover");
        } finally { identity(); }
        CrmDealTeamView managed = teams.save(id, request(assigned, member(1, "CO_SELLER", "0.5"), member(2, "OWNER", "0.5")));
        equal(2L, managed.ownerId(), "authorized full-scope team manager can maintain another owner's quote");
        fails(ServiceException.class, () -> quotes.updateQuote(entity(id)), "normal quote editing retains original owner-only restriction");
        for (String status : List.of("ACCEPTED", "EXPIRED")) {
            Long terminalId = create("CNY"); CrmQuote terminal = fixture.mapper(CrmQuoteMapper.class).selectById(terminalId);
            terminal.setStatus(status); fixture.mapper(CrmQuoteMapper.class).updateById(terminal);
            CrmDealTeamView current = teams.read(terminalId, null);
            fails(IllegalArgumentException.class, () -> teams.save(terminalId, request(current, member(2, "OWNER", "1"))), "closed quote cannot be reassigned through team API: " + status);
            CrmQuote changeOwner = entity(terminalId); changeOwner.setOwnerId(2L);
            fails(IllegalArgumentException.class, () -> quotes.updateQuote(changeOwner), "closed unconfigured quote cannot bypass owner restriction in ordinary edit: " + status);
            CrmQuote changeStatus = entity(terminalId); changeStatus.setStatus("DRAFT");
            fails(IllegalArgumentException.class, () -> quotes.updateQuote(changeStatus), "ordinary edit cannot reopen closed quote to bypass team restriction: " + status);
            CrmQuote omittedStatus = entity(terminalId); omittedStatus.setStatus(null); quotes.updateQuote(omittedStatus);
            equal(status, entity(terminalId).getStatus(), "omitted quote status remains terminal: " + status);
            equal(1L, entity(terminalId).getOwnerId(), "closed quote keeps original owner: " + status);
        }
    }

    private void competition() throws Exception {
        for (int round = 0; round < 4; round++) {
            Long id = create("CNY"); CrmDealTeamView original = teams.read(id, null); CrmQuote currency = entity(id); currency.setCurrency("USD");
            CrmDealTeamRequest request = request(original, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"));
            int[] winners = fixture.parallel(() -> attempt(() -> teams.save(id, request)), () -> attempt(() -> quotes.updateQuote(currency)));
            equal(1, winners[0] + winners[1], "currency change and first team save have exactly one version winner");
            equal(winners[0] == 1 ? "CNY" : "USD", entity(id).getCurrency(), "winning transaction determines quote currency");
            CrmDealTeamView current = teams.read(id, null);
            if (current.teamVersion() == 0) current = teams.save(id, request(current, member(1, "OWNER", "1")));
            equal(entity(id).getCurrency(), current.currency(), "team creation uses the winning persisted currency");
            CrmQuote rejected = entity(id); rejected.setCurrency("EUR");
            fails(IllegalArgumentException.class, () -> quotes.updateQuote(rejected), "subsequent currency edits remain blocked after race");
        }
        Long id = create("CNY"); CrmDealTeamView original = teams.read(id, null);
        CrmDealTeamRequest left = request(original, member(1, "OWNER", "0.6"), member(2, "CO_SELLER", "0.4"));
        CrmDealTeamRequest right = request(original, member(1, "OWNER", "0.7"), member(3, "SUPPORT", "0.3"));
        int[] winners = fixture.parallel(() -> attempt(() -> teams.save(id, left)), () -> attempt(() -> teams.save(id, right)));
        equal(1, winners[0] + winners[1], "competing first quote teams have one winner");
        equal(2, teams.read(id, null).members().size(), "competing saves cannot mix quote member sets");
        equal(List.of(1), teams.read(id, null).versions(), "competing saves create exactly one history version");
    }

    private int attempt(Runnable operation) { try { operation.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; } }
}
