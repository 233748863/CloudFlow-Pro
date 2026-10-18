package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.service.opportunity.CrmOpportunityStagePolicy;
import com.cloudflow.crm.service.opportunity.CrmSalesAmounts;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.BeanUtils;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;
import static com.cloudflow.crm.service.opportunity.CrmOpportunityStagePolicy.Action.*;

final class CrmOpportunityRuleChecks {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 9, 17, 18, 0);

    static void run() {
        amounts(); catalog(); transitions(); requirements();
        System.out.println("PASS: H3 opportunity percentages, money, catalog, version and stage boundary rules");
    }

    private static void amounts() {
        decimal("273000.00", CrmSalesAmounts.weighted(new BigDecimal("420000.00"), new BigDecimal("65.00")), "H3 percent win rate is divided by one hundred");
        decimal("0.00", CrmSalesAmounts.weighted(null, null), "missing amount and win rate normalize to zero");
        decimal("999999999999.99", CrmSalesAmounts.weighted(new BigDecimal("999999999999.99"), new BigDecimal("100")), "weighted amount fits DECIMAL14 boundary");
        decimal("0.01", CrmSalesAmounts.weighted(new BigDecimal("0.01"), new BigDecimal("50")), "weighted half cent rounds up");
        CrmSalesAmounts.Line line = CrmSalesAmounts.line(new BigDecimal("1.2345"), new BigDecimal("12.3456"), new BigDecimal("87.6543"), new BigDecimal("6.1250"));
        decimal("13.36", line.lineAmount(), "four-place product precision rounds subtotal once");
        decimal("0.82", line.taxAmount(), "tax uses rounded untaxed line amount");
        decimal("10.00", CrmSalesAmounts.line(BigDecimal.ONE, BigDecimal.TEN, null, null).lineAmount(), "default discount is one hundred percent");
        decimal("0.00", CrmSalesAmounts.line(BigDecimal.ONE, BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO).lineAmount(), "zero percent discount supports free line");
        for (String value : List.of("-0.01", "100.01", "65.001", "10000000000000000")) {
            fails(IllegalArgumentException.class, () -> CrmSalesAmounts.winRate(new BigDecimal(value)), "invalid percentage rejected: " + value);
        }
        for (String value : List.of("-1", "1000000000000", "1.001")) {
            fails(IllegalArgumentException.class, () -> CrmSalesAmounts.expected(new BigDecimal(value)), "invalid opportunity expected amount rejected: " + value);
        }
        for (String value : List.of("0", "-1", "0.00001", "1000000000000")) {
            fails(IllegalArgumentException.class, () -> CrmSalesAmounts.line(new BigDecimal(value), BigDecimal.ONE, null, null), "invalid quantity rejected: " + value);
        }
        fails(IllegalArgumentException.class, () -> CrmSalesAmounts.line(BigDecimal.ONE, new BigDecimal("1.00001"), null, null), "unit price does not silently truncate");
        fails(IllegalArgumentException.class, () -> CrmSalesAmounts.line(BigDecimal.ONE, BigDecimal.ONE, new BigDecimal("100.0001"), null), "excess discount rejected");
        fails(IllegalArgumentException.class, () -> CrmSalesAmounts.line(BigDecimal.ONE, BigDecimal.ONE, null, new BigDecimal("-1")), "negative tax rejected");
        fails(IllegalArgumentException.class, () -> CrmSalesAmounts.line(new BigDecimal("999999999999"), new BigDecimal("999999999999"), null, null), "line multiplication overflow rejected");
        fails(IllegalArgumentException.class, () -> CrmSalesAmounts.stageRate(new BigDecimal("1.0001")), "stage ratio is not a percentage");
    }

    static List<CrmSalesStage> stages() {
        List<CrmSalesStage> stages = new ArrayList<>();
        String[] codes = {"LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"};
        String[] rates = {"0.1000", "0.3000", "0.5000", "0.7000", "1.0000", "0.0000"};
        for (int index = 0; index < codes.length; index++) {
            CrmSalesStage stage = new CrmSalesStage(); stage.setStageId(1900L + index); stage.setTenantId(100000L);
            stage.setStageCode(codes[index]); stage.setStageName(codes[index]); stage.setSortNo((index + 1) * 10);
            stage.setDefaultWinRate(new BigDecimal(rates[index])); stage.setAllowSkipFlag(0); stage.setRequiredActivityFlag(0);
            stage.setIsWonFlag("WON".equals(codes[index]) ? 1 : 0); stage.setIsLostFlag("LOST".equals(codes[index]) ? 1 : 0);
            stage.setRequiredFields(List.of()); stage.setStatus("ACTIVE"); stage.setDeleted(0); stage.setVersion(0); stages.add(stage);
        }
        return stages;
    }

    private static void catalog() {
        CrmOpportunityStagePolicy.catalog(stages());
        equal("CUSTOM_1", CrmOpportunityStagePolicy.code("custom_1"), "stage code normalized by server");
        for (String code : List.of("", "stage.id", "1LEAD", "SELECT stage", "x".repeat(31)))
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.code(code), "unsafe stage code rejected: " + code);
        List<CrmSalesStage> duplicate = stages(); duplicate.get(1).setSortNo(10);
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(duplicate), "duplicate enabled order rejected");
        List<CrmSalesStage> inactive = stages(); inactive.get(4).setStatus("DISABLED");
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(inactive), "won stage must remain enabled");
        List<CrmSalesStage> changedWin = stages(); changedWin.get(4).setDefaultWinRate(new BigDecimal("0.90"));
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(changedWin), "won stage ratio cannot be reduced");
        List<CrmSalesStage> changedLost = stages(); changedLost.get(5).setDefaultWinRate(new BigDecimal("0.01"));
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(changedLost), "lost stage ratio remains zero");
        List<CrmSalesStage> flags = stages(); flags.get(0).setIsWonFlag(1);
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(flags), "terminal flag must match stable code");
        for (String field : List.of("tenantId", "customer.ownerId", "owner_id", "version", "class", "remark;DROP")) {
            List<CrmSalesStage> rules = stages(); rules.get(1).setRequiredFields(List.of(field));
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(rules), "required fields whitelist excludes " + field);
        }
        List<CrmSalesStage> duplicateField = stages(); duplicateField.get(1).setRequiredFields(List.of("remark", "remark"));
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(duplicateField), "duplicate required field rejected");
        List<CrmSalesStage> noStart = stages(); noStart.subList(0, 4).forEach(stage -> stage.setStatus("DISABLED"));
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(noStart), "catalog must retain an open stage");
        List<CrmSalesStage> threshold = stages(); threshold.get(0).setOverdueDays(0);
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.catalog(threshold), "overdue threshold must be positive");
    }

    static CrmOpportunity opportunity(String stage) {
        CrmOpportunity opportunity = new CrmOpportunity(); opportunity.setStage(stage); opportunity.setVersion(3); opportunity.setTeamVersion(7);
        opportunity.setExpectedAmount(new BigDecimal("10000")); opportunity.setWinRate(new BigDecimal("65")); opportunity.setOwnerId(1L);
        opportunity.setStatus("OPEN"); opportunity.setStageChangedTime(NOW.minusSeconds(172801)); return opportunity;
    }

    private static CrmOpportunity target(CrmOpportunity original, String code) {
        CrmOpportunity proposed = new CrmOpportunity(); BeanUtils.copyProperties(original, proposed); proposed.setStage(code); return proposed;
    }

    private static void transitions() {
        CrmOpportunity created = opportunity(null); created.setLastStage("WON");
        CrmOpportunityStagePolicy.Transition creation = CrmOpportunityStagePolicy.apply(null, created, stages(), CREATE, null, false, NOW);
        equal("LEAD", created.getStage(), "new opportunity starts at first enabled stage");
        equal(null, created.getLastStage(), "client last stage is not trusted on creation");
        equal(0, created.getTeamVersion(), "client team version is not trusted on creation");
        decimal("10", created.getWinRate(), "new opportunity uses stage default percentage");
        equal(0L, creation.durationSeconds(), "creation has no synthetic previous duration");
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(null, opportunity("WON"), stages(), CREATE, null, false, NOW), "creation cannot bypass win workflow");
        CrmOpportunity original = opportunity("LEAD");
        CrmOpportunity next = target(original, "QUALIFIED");
        CrmOpportunityStagePolicy.Transition advance = CrmOpportunityStagePolicy.apply(original, next, stages(), ADVANCE, null, false, NOW);
        equal("LEAD", next.getLastStage(), "previous stage snapshot saved"); equal(NOW, next.getStageChangedTime(), "server entry timestamp saved");
        equal(172801L, advance.durationSeconds(), "exited interval retains full seconds"); equal(0, next.getStageDurationDays(), "new stage duration starts at zero");
        decimal("30", next.getWinRate(), "new stage rate converted to percentage"); decimal("3000", next.getWeightedAmount(), "weighted forecast recomputed on advance");
        equal(7, next.getTeamVersion(), "stage change does not overwrite team version");
        for (CrmOpportunityStagePolicy.Action action : List.of(EDIT, ADVANCE)) {
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(original, target(original, "PROPOSAL"), stages(), action, null, false, NOW), "skipping rejected through " + action);
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(original, target(original, "WON"), stages(), action, null, false, NOW), "win cannot use " + action);
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(original, target(original, "LOST"), stages(), action, "cause", false, NOW), "loss cannot use " + action);
        }
        List<CrmSalesStage> skip = stages(); skip.get(2).setAllowSkipFlag(1);
        equal("FORWARD", CrmOpportunityStagePolicy.apply(original, target(original, "PROPOSAL"), skip, ADVANCE, null, false, NOW).direction(), "explicit skip rule allows jumping into target");
        CrmOpportunity unchanged = target(original, "LEAD");
        CrmOpportunityStagePolicy.Transition edit = CrmOpportunityStagePolicy.apply(original, unchanged, stages(), EDIT, null, false, NOW);
        equal(false, edit.changed(), "ordinary edit adds no duplicate history"); decimal("65", unchanged.getWinRate(), "same stage keeps manually entered percentage");
        equal(2, unchanged.getStageDurationDays(), "current interval uses complete days"); equal(original.getStageChangedTime(), unchanged.getStageChangedTime(), "edit cannot reset stage clock");
        CrmOpportunity negotiation = opportunity("NEGOTIATION");
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(negotiation, target(negotiation, "PROPOSAL"), stages(), ADVANCE, "cause", false, NOW), "reason alone cannot bypass downgrade approval");
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(negotiation, target(negotiation, "PROPOSAL"), stages(), APPROVED_DOWNGRADE, " ", false, NOW), "approved downgrade still requires reason");
        equal("BACKWARD", CrmOpportunityStagePolicy.apply(negotiation, target(negotiation, "PROPOSAL"), stages(), APPROVED_DOWNGRADE, "客户调整范围", false, NOW).direction(), "approved downgrade uses shared stage rules");
        CrmOpportunity won = target(negotiation, "WON"); CrmOpportunityStagePolicy.apply(negotiation, won, stages(), WON, null, false, NOW);
        decimal("100", won.getWinRate(), "won always has one hundred percent"); equal("CLOSED", won.getStatus(), "won closes opportunity");
        CrmOpportunity lost = target(negotiation, "LOST"); CrmOpportunityStagePolicy.apply(negotiation, lost, stages(), APPROVED_DOWNGRADE, "客户预算调整", false, NOW);
        decimal("0", lost.getWeightedAmount(), "lost forecast is zero");
        for (CrmOpportunity terminal : List.of(won, lost)) {
            for (CrmOpportunityStagePolicy.Action action : List.of(EDIT, ADVANCE, WON, APPROVED_DOWNGRADE))
                fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(terminal, target(terminal, "QUALIFIED"), stages(), action, "reason", true, NOW.plusSeconds(1)), "terminal cannot reopen through " + action);
        }
        CrmOpportunity future = opportunity("LEAD"); future.setStageChangedTime(NOW.plusSeconds(1));
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(future, target(future, "QUALIFIED"), stages(), ADVANCE, null, true, NOW), "future entry timestamp cannot create negative history");
        for (Integer version : java.util.Arrays.asList(null, -1, 2, 4))
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.version(version, original), "stale or missing version rejected: " + version);
        CrmOpportunityStagePolicy.version(3, original);
    }

    private static void requirements() {
        CrmOpportunity original = opportunity("LEAD");
        for (String field : List.of("contactId", "expectedSignDate", "remark")) {
            List<CrmSalesStage> rules = stages(); rules.get(1).setRequiredFields(List.of(field));
            fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(original, target(original, "QUALIFIED"), rules, ADVANCE, null, true, NOW), "missing required field rejected: " + field);
        }
        List<CrmSalesStage> rules = stages(); rules.get(1).setRequiredFields(List.of("contactId", "ownerId", "expectedAmount", "expectedSignDate", "remark"));
        rules.get(1).setRequiredActivityFlag(1);
        CrmOpportunity complete = target(original, "QUALIFIED"); complete.setContactId(5L); complete.setRemark("已确认需求"); complete.setExpectedSignDate(NOW.toLocalDate());
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(original, complete, rules, ADVANCE, null, false, NOW), "required activity checked on real stage transition");
        equal("FORWARD", CrmOpportunityStagePolicy.apply(original, complete, rules, ADVANCE, null, true, NOW).direction(), "all stage requirements accepted");
        List<CrmSalesStage> disabled = stages(); disabled.get(1).setStatus("DISABLED");
        fails(IllegalArgumentException.class, () -> CrmOpportunityStagePolicy.apply(original, target(original, "QUALIFIED"), disabled, ADVANCE, null, true, NOW), "disabled target rejected");
        equal("FORWARD", CrmOpportunityStagePolicy.apply(original, target(original, "PROPOSAL"), disabled, ADVANCE, null, true, NOW).direction(), "next active stage excludes disabled rows");
    }
}
