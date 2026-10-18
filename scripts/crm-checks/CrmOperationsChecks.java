package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.audit.HighRiskAuditVerifier;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO;
import com.cloudflow.crm.mapper.CrmSlaPolicyMapper;
import com.cloudflow.crm.service.email.CrmEmailPolicyService;
import com.cloudflow.crm.service.remote.CrmBusinessRuleClient;
import java.lang.reflect.Constructor;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.context.ApplicationContext;

import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;

public final class CrmOperationsChecks {
    private static final AtomicInteger checks = new AtomicInteger();
    static int assertionCount() { return checks.get(); }

    public static void main(String[] arguments) throws Exception {
        for (Class<?> entity : List.of(HolidayCalendar.class, HolidayDate.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "crm-checks"), entity);
        }
        identity();
        try {
            calendars();
            sla();
            scoresAndProfiles();
            creditAndRules();
            audiencesAndRevenue();
            lossAndTerritories();
            startupAuditContracts();
            CrmBusinessExceptionChecks.run();
            CrmContractBoundaryChecks.run();
            CrmDirectoryAvailabilityChecks.run();
            CrmQuoteContractAvailabilityChecks.run();
            CrmOpportunityRuleChecks.run();
            CrmDealPolicyChecks.run();
            CrmDealRefundPolicyChecks.run();
            CrmRefundWorkflowPolicyChecks.run();
            CrmDealHandoverPolicyChecks.run();
            if (arguments.length > 0) CrmOperationsDatabaseChecks.run(arguments[0]);
        } finally {
            TenantContext.clear(); UserContext.clear();
        }
        System.out.println("PASS: " + checks.get() + " CRM boundary assertions");
    }

    static void identity() { identity(100000L, 1L, 0); }

    static void identity(Long tenantId, Long userId, int scope) {
        TenantContext.clear(); TenantContext.setTenantId(tenantId);
        UserContext.clear(); UserContext.setTenantId(tenantId); UserContext.setUserId(userId);
        UserContext.setUserName("batch-e-check"); UserContext.setDsType(scope); UserContext.setDeptId(100L);
        UserContext.setRoles(Set.of("crm"));
    }

    static HolidayCalendarServiceImpl calendar() {
        HolidayCalendar calendar = new HolidayCalendar();
        calendar.setCalendarId(100L); calendar.setTenantId(100000L); calendar.setStatus("ENABLED");
        calendar.setDefaultFlag(1); calendar.setDeleted(0); calendar.setWeeklyRestDays("6,7");
        calendar.setWorkStartTime(LocalTime.of(9, 0)); calendar.setWorkEndTime(LocalTime.of(18, 0));
        calendar.setLunchStartTime(LocalTime.NOON); calendar.setLunchEndTime(LocalTime.of(13, 0));
        List<HolidayDate> dates = List.of(holiday("2026-01-01", "HOLIDAY"), holiday("2026-01-02", "REST"), holiday("2026-01-04", "WORKDAY"));
        return new HolidayCalendarServiceImpl(proxy(HolidayCalendarMapper.class, (method, values) -> calendar),
                proxy(HolidayDateMapper.class, (method, values) -> dates),
                proxy(HolidayResolverMapper.class, (method, values) -> "hasShiftCalendarColumn".equals(method) ? false : null), null);
    }

    private static HolidayDate holiday(String date, String type) {
        HolidayDate result = new HolidayDate(); result.setCalendarId(100L); result.setHolidayDate(LocalDate.parse(date));
        result.setDateType(type); result.setTriplePayFlag("HOLIDAY".equals(type) ? 1 : 0); result.setYearNo(LocalDate.parse(date).getYear()); return result;
    }

    private static void calendars() {
        CrmSlaClock clock = new CrmSlaClock(calendar());
        equal(time("2026-01-12T12:00"), clock.add(100L, false, time("2026-01-09T17:00"), 240), "Friday four-hour SLA ends Monday before lunch");
        equal(time("2026-01-06T10:00"), clock.add(100L, false, time("2026-01-05T20:00"), 60), "after-hours creation starts next workday");
        equal(time("2026-01-05T13:30"), clock.add(100L, false, time("2026-01-05T11:30"), 60), "lunch is excluded");
        equal(time("2026-01-04T10:00"), clock.add(100L, false, time("2025-12-31T17:00"), 120), "holidays excluded and makeup Sunday included");
        equal(480L, clock.elapsed(100L, false, time("2026-01-05T09:00"), time("2026-01-05T18:00")), "eight working hours per day");
        equal(240L, clock.elapsed(100L, false, time("2026-01-09T17:00"), time("2026-01-12T12:00")), "deadline and elapsed are inverse across weekend");
        equal(0L, clock.elapsed(100L, false, time("2026-01-10T09:00"), time("2026-01-11T18:00")), "weekend contributes zero");
        equal(1L, clock.elapsed(100L, false, time("2026-01-05T09:00:59"), time("2026-01-05T09:01:01")), "persisted integer-minute boundary");
        equal(time("2026-01-09T21:00"), clock.add(100L, true, time("2026-01-09T17:00:59"), 240), "24-hour policy uses natural minutes");
        equal(0L, clock.elapsed(100L, false, time("2026-01-05T10:00"), time("2026-01-05T09:00")), "reversed interval contributes zero");
        fails(IllegalArgumentException.class, () -> clock.add(100L, false, LocalDateTime.now(), -1), "negative SLA rejected");
    }

    static SysDictHelper emptyDictionaries() {
        return new SysDictHelper() { @Override public List<DictItem> getDictData(String type) { return List.of(); } };
    }

    private static void sla() {
        CrmSlaPriorityCatalog catalog = new CrmSlaPriorityCatalog(emptyDictionaries());
        int[][] expected = {{60, 240}, {240, 480}, {480, 1440}, {1440, 4320}};
        for (int index = 0; index < expected.length; index++) {
            CrmSlaPriority tier = catalog.fallback("P" + (index + 1));
            equal(expected[index][0], tier.getFirstResponseMinutes(), "missing dictionary response fallback " + tier.getPriorityCode());
            equal(expected[index][1], tier.getResolutionMinutes(), "missing dictionary resolution fallback " + tier.getPriorityCode());
        }
        SysDictHelper.DictItem valid = new SysDictHelper.DictItem();
        valid.setValue("P1"); valid.setLabel("custom"); valid.setListClass("30"); valid.setCssClass("120");
        SysDictHelper.DictItem invalid = new SysDictHelper.DictItem();
        invalid.setValue("P2"); invalid.setListClass("invalid"); invalid.setCssClass("0");
        CrmSlaPriorityCatalog partial = new CrmSlaPriorityCatalog(new SysDictHelper() {
            @Override public List<DictItem> getDictData(String type) { return List.of(valid, invalid); }
        });
        equal(30, partial.fallback("P1").getFirstResponseMinutes(), "valid dictionary tier overrides fallback");
        equal(240, partial.fallback("P2").getFirstResponseMinutes(), "invalid tier falls back independently");
        equal(4, new CrmSlaPriorityCatalog(new SysDictHelper() {
            @Override public List<DictItem> getDictData(String type) { throw new IllegalStateException("dictionary unavailable fixture"); }
        }).defaults().size(), "unavailable dictionary retains all four tiers");
        CrmSlaPolicy policy = new CrmSlaPolicy();
        policy.setPolicyId(1550L); policy.setHolidayCalendarId(100L); policy.setApplyForResolution(1); policy.setRoundTheClockFlag(1);
        CrmSlaStatusRule pause = new CrmSlaStatusRule(); pause.setRuleType("PAUSE"); pause.setTicketStatus("WAITING_CUSTOMER");
        CrmSlaStatusRule fulfill = new CrmSlaStatusRule(); fulfill.setRuleType("FULFILL"); fulfill.setTicketStatus("RESOLVED");
        CrmSlaPolicyService policies = new CrmSlaPolicyService(null, null, null, null, null, null, catalog, null) {
            @Override public CrmSlaPolicy match(CrmServiceTicket ticket) { return policy; }
            @Override public CrmSlaPriority priority(Long policyId, String code) { return catalog.fallback(code); }
            @Override public List<CrmSlaStatusRule> rules(Long policyId) { return List.of(pause, fulfill); }
        };
        CrmSlaPolicyMapper policyMapper = proxy(CrmSlaPolicyMapper.class, (method, values) -> policy);
        CrmSlaService service = new CrmSlaService(new CrmSlaClock(calendar()), policies, policyMapper, null, null, request -> {}, null, null, null);
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES);
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setOpenedTime(now.minusMinutes(180)); ticket.setSeverity("P1"); ticket.setStatus("OPEN");
        service.initialize(ticket);
        equal(now.minusMinutes(120), ticket.getFirstResponseDue(), "response deadline starts at opened time");
        equal(now.plusMinutes(60), ticket.getResolutionDue(), "resolution deadline starts at opened time");
        ticket.setPauseStartTime(now.minusMinutes(150)); ticket.setStatus("WAITING_CUSTOMER");
        service.change(ticket, "WAITING_CUSTOMER", "P1", true);
        equal(30, ticket.getFirstResponseMinutes(), "first response while paused excludes unfinished pause");
        equal(now.plusMinutes(30), ticket.getFirstResponseDue(), "paused first response extends its deadline");
        equal(0, ticket.getResponseBreachedFlag(), "paused response does not falsely breach");
        CrmSlaService restarted = new CrmSlaService(new CrmSlaClock(calendar()), policies, policyMapper, null, null, request -> {}, null, null, null);
        ticket.setStatus("IN_PROGRESS"); restarted.change(ticket, "WAITING_CUSTOMER", "P1", false);
        equal(150, ticket.getSlaPausedMinutes(), "restart resumes persisted pause once");
        equal(now.plusMinutes(210), ticket.getResolutionDue(), "pause extends resolution deadline");
        equal(now.plusMinutes(30), ticket.getFirstResponseDue(), "answered response deadline is not extended twice");
        restarted.change(ticket, "IN_PROGRESS", "P1", false);
        equal(150, ticket.getSlaPausedMinutes(), "repeat update does not double pause");
        ticket.setSeverity("P2"); restarted.change(ticket, "IN_PROGRESS", "P1", false);
        equal(ticket.getOpenedTime().plusMinutes(630), ticket.getResolutionDue(), "priority change retains original clock and accumulated pause");
        ticket.setStatus("RESOLVED"); restarted.change(ticket, "IN_PROGRESS", "P2", false);
        equal(30, ticket.getResolutionMinutes(), "resolution uses consumed working minutes");
        equal("FULFILLED", ticket.getSlaStatus(), "resolution fulfills SLA");
        CrmCustomer customer = new CrmCustomer(); customer.setCustomerId(7L); customer.setIndustry("IT"); customer.setLevelCode("A");
        policy.setEntityType("CUSTOMER"); policy.setEntityId("7"); equal(0, CrmSlaPolicyService.rank(policy, customer), "customer-specific policy first");
        policy.setEntityType("CUSTOMER_LEVEL"); policy.setEntityId("A"); equal(1, CrmSlaPolicyService.rank(policy, customer), "customer level second");
        policy.setEntityType("INDUSTRY"); policy.setEntityId("IT"); equal(2, CrmSlaPolicyService.rank(policy, customer), "industry third");
        policy.setEntityType("GLOBAL"); policy.setDefaultFlag(1); equal(3, CrmSlaPolicyService.rank(policy, customer), "default policy last");
    }

    private static CrmLeadScoreRule scoreRule(String field, String operator, String value, int score) {
        CrmLeadScoreRule rule = new CrmLeadScoreRule(); rule.setFieldName(field); rule.setOperator(operator);
        rule.setFieldValue(value); rule.setScore(score); rule.setEnabledFlag(1); return rule;
    }

    private static void scoresAndProfiles() {
        CrmLead lead = new CrmLead(); lead.setAnnualRevenue(new BigDecimal("1000000.00")); lead.setTerritoryId(1550L);
        lead.setEmployeeScale("51-200"); lead.setMarketSegment("ENTERPRISE"); lead.setIndustry("IT");
        lead.setSource("CAMPAIGN"); lead.setCampaignId(88L); lead.setUnsubscribeFlag(1); lead.setQualificationStatus("QUALIFIED");
        lead.setCompanyName("CloudFlow");
        List<CrmLeadScoreRule> rules = List.of(scoreRule("annual_revenue", ">=", "1000000", 20),
                scoreRule("territory_id", "IN", "100, 1550", 10), scoreRule("company_name", "CONTAINS", "FLOW", 5),
                scoreRule("email", "IS_EMPTY", null, -2));
        equal(33, CrmLeadScoreEngine.calculate(lead, rules), "numeric, set, text and empty scoring");
        equal("QUALIFIED", lead.getQualificationStatus(), "automatic scoring preserves manual qualification");
        CrmLeadScoreRule disabled = scoreRule("unsupported", "=", "1", 100); disabled.setEnabledFlag(0);
        equal(0, CrmLeadScoreEngine.calculate(lead, List.of(disabled)), "disabled scoring rule ignored");
        fails(IllegalArgumentException.class, () -> CrmLeadScoreEngine.validate(scoreRule("tenant_id", "=", "1", 1)), "non-whitelisted field rejected");
        fails(IllegalArgumentException.class, () -> CrmLeadScoreEngine.validate(scoreRule("industry", "SQL", "1", 1)), "non-whitelisted operator rejected");
        fails(IllegalArgumentException.class, () -> CrmLeadScoreEngine.validate(scoreRule("industry", ">", "1", 1)), "text ordering rejected");
        fails(IllegalArgumentException.class, () -> CrmLeadScoreEngine.validate(scoreRule("annual_revenue", "IN", "10,broken", 1)), "invalid numeric set rejected");
        fails(IllegalArgumentException.class, () -> CrmLeadScoreEngine.calculate(lead, List.of(scoreRule("email", "IS_EMPTY", null, Integer.MAX_VALUE), scoreRule("email", "IS_EMPTY", null, 1))), "score overflow rejected");
        CrmCustomer customer = new CrmCustomer(); CrmProfileService.mapLeadToCustomer(lead, customer);
        equal(lead.getTerritoryId(), customer.getTerritoryId(), "territory conversion");
        equal(lead.getMarketSegment(), customer.getMarketSegment(), "segment conversion");
        equal(lead.getIndustry(), customer.getIndustry(), "industry conversion");
        equal(lead.getEmployeeScale(), customer.getEmployeeScale(), "employee scale conversion");
        equal(lead.getAnnualRevenue(), customer.getAnnualRevenue(), "annual revenue conversion");
        equal(lead.getSource(), customer.getSource(), "source conversion");
        equal(lead.getCampaignId(), customer.getCampaignId(), "campaign conversion");
        equal(lead.getUnsubscribeFlag(), customer.getUnsubscribeFlag(), "opt-out conversion");
    }

    private static void creditAndRules() {
        LocalDate today = LocalDate.now(); CrmCustomerCredit credit = new CrmCustomerCredit();
        credit.setStatus("ENABLED"); credit.setEffectiveStart(today); credit.setEffectiveEnd(today); credit.setBypassFlag(1); credit.setBypassExpireDate(today);
        equal(true, CrmCreditService.effective(credit, today), "credit validity includes start and end day");
        equal(true, CrmCreditService.bypassActive(credit, today), "bypass valid through expiry date");
        equal(false, CrmCreditService.bypassActive(credit, today.plusDays(1)), "expired bypass cannot suppress rules");
        credit.setStatus("DISABLED"); equal(false, CrmCreditService.effective(credit, today), "disabled credit not enforced");
        List<CrmBusinessRuleClient.Hit> hits = new ArrayList<>(); List<String> audits = new ArrayList<>();
        CrmBusinessRuleClient.Rule configuration = new CrmBusinessRuleClient.Rule(); configuration.setEnabled(1); configuration.setEffect("BLOCK"); configuration.setThresholdValue(BigDecimal.ZERO);
        CrmBusinessRuleClient client = proxy(CrmBusinessRuleClient.class, (method, values) -> {
            if ("effective".equals(method)) return R.ok(configuration);
            hits.add((CrmBusinessRuleClient.Hit) values[0]); return R.ok();
        });
        CrmAuditTrail audit = new CrmAuditTrail(null) {
            @Override public void recordAttempt(String action, String businessId, String detail, boolean highRisk) { audits.add(action); }
        };
        CrmRuleService rules = new CrmRuleService(client, audit);
        fails(IllegalArgumentException.class, () -> rules.evaluate("crm.credit.overdue", "BLOCK", "QUOTE", 1L, BigDecimal.TEN, BigDecimal.ZERO, false, "overdue"), "overdue blocks");
        equal("BLOCK", hits.get(0).getEffect(), "blocking decision persisted"); equal(1, audits.size(), "blocking decision audited");
        configuration.setEffect("WARN"); equal("WARN", rules.evaluate("crm.credit.limit", "BLOCK", "QUOTE", 1L, BigDecimal.TEN, BigDecimal.ZERO, false, "limit"), "rule change effective immediately");
        configuration.setEffect("ALERT"); equal("WARN", rules.evaluate("crm.credit.limit", "BLOCK", "QUOTE", 1L, BigDecimal.TEN, BigDecimal.ZERO, false, "limit"), "rule center ALERT maps to visible warning");
        configuration.setEffect("BLOCK"); equal("PASS", rules.evaluate("crm.credit.limit", "BLOCK", "QUOTE", 1L, BigDecimal.TEN, BigDecimal.ZERO, true, "limit"), "bypass allows operation");
        equal("BYPASSED", hits.get(hits.size() - 1).getHitResult(), "bypass still records a hit"); equal(2, audits.size(), "bypass audited");
        configuration.setEnabled(0); equal("PASS", rules.evaluate("crm.credit.limit", "BLOCK", "QUOTE", 1L, BigDecimal.TEN, BigDecimal.ZERO, false, "limit"), "disabled rule stays disabled");
        equal("PASS", rules.evaluate("crm.credit.limit", "BLOCK", "QUOTE", 1L, BigDecimal.ZERO, BigDecimal.ZERO, false, "limit"), "threshold boundary permits equal amount");
        fails(IllegalStateException.class, () -> new CrmRuleService(proxy(CrmBusinessRuleClient.class, (method, values) -> null), audit)
                .evaluate("crm.credit.limit", "BLOCK", "QUOTE", 1L, BigDecimal.TEN, BigDecimal.ZERO, false, "limit"), "rule service failure fails closed");
    }

    static CrmTargetListMember member(String type, long id, String email, int optedOut) {
        CrmTargetListMember member = new CrmTargetListMember(); member.setMemberType(type); member.setMemberRefId(id);
        member.setMemberName("CRM check " + id); member.setEmail(email); member.setPhone("13812345678"); member.setOptedOutFlag(optedOut); return member;
    }

    private static void audiencesAndRevenue() {
        CrmTargetListMember first = member("LEAD", 1, "Sales@Example.com", 0);
        CrmTargetListMember duplicate = member("CONTACT", 2, " Sales@example.com ", 0);
        CrmTargetListMember excluded = member("LEAD", 3, "excluded@example.com", 0);
        CrmTargetListMember optedOut = member("CUSTOMER", 4, "optout@example.com", 0);
        CrmTargetListMember invalid = member("LEAD", 5, "invalid@example", 0);
        Map<String, CrmTargetListMember> included = new LinkedHashMap<>();
        List.of(first, duplicate, excluded, optedOut, invalid).forEach(member -> included.put(CrmAudienceService.key(member), member));
        CrmTargetListMember exclusionAlias = member("CONTACT", 30, "excluded@example.com", 0);
        Map<String, Object> result = CrmCampaignService.resolveRecipients(included,
                Map.of(CrmAudienceService.key(exclusionAlias), exclusionAlias), List.of(member("CONTACT", 40, "optout@EXAMPLE.COM", 1)));
        equal(1, result.get("recipientCount"), "recipient set applies exclusion opt-out invalid and dedupe");
        equal(1, result.get("excludedCount"), "exclusion follows normalized email across identities");
        equal(1, result.get("optedOutCount"), "unsubscribe follows normalized email across identities");
        equal(1, result.get("invalidEmailCount"), "invalid email removed"); equal(1, result.get("duplicateCount"), "email deduplicated without changing local-part semantics");
        CrmTargetListMember masked = (CrmTargetListMember) ((List<?>) result.get("members")).get(0);
        equal("S***@example.com", masked.getEmail(), "preview email masked"); equal("138****5678", masked.getPhone(), "preview phone masked");
        first.setPhone("1234567"); equal("***", CrmAudienceService.masked(first).getPhone(), "seven-digit phone is not fully disclosed");
        equal("Sales@Example.com", first.getEmail(), "masking does not mutate persisted contact");
        equal(null, CrmCampaignRevenueService.roi(BigDecimal.TEN, BigDecimal.ZERO), "zero-cost ROI is null");
        decimal("1.5000", CrmCampaignRevenueService.roi(new BigDecimal("250"), new BigDecimal("100")), "ROI uses net return over cost");
        decimal("-1.0000", CrmCampaignRevenueService.roi(BigDecimal.ZERO, BigDecimal.TEN), "no revenue ROI is minus one");
        decimal("9999999999999998.0000", CrmCampaignRevenueService.roi(new BigDecimal("99999999999999.99"), new BigDecimal("0.01")), "ROI fits approved 20,4 precision");
        CrmEmailPolicyService.Policy mailPolicy = com.cloudflow.crm.service.email.CrmEmailPolicyService.parse(Map.of());
        equal(false, mailPolicy.sendingEnabled(), "unconfigured marketing cannot send");
        equal(false, mailPolicy.trackingEnabled(), "unconfigured tracking remains off");
        check(mailPolicy.reason().contains("未启用"), "unconfigured delivery has an explicit reason");
        fails(IllegalArgumentException.class, mailPolicy::requireSending, "unconfigured marketing fails closed");
    }

    private static void lossAndTerritories() {
        CrmOpportunityLossDTO.Reason primary = new CrmOpportunityLossDTO.Reason(); primary.setReasonId(1L); primary.setIsPrimary(true);
        CrmOpportunityLossDTO.Reason secondary = new CrmOpportunityLossDTO.Reason(); secondary.setReasonId(2L); secondary.setIsPrimary(false);
        CrmLostAnalysisService.validateShape(List.of(primary, secondary)); check(true, "multiple loss reasons with single primary valid");
        fails(IllegalArgumentException.class, () -> CrmLostAnalysisService.validateShape(List.of()), "empty loss reasons rejected");
        fails(IllegalArgumentException.class, () -> CrmLostAnalysisService.validateShape(List.of(secondary)), "missing primary rejected");
        secondary.setIsPrimary(true); fails(IllegalArgumentException.class, () -> CrmLostAnalysisService.validateShape(List.of(primary, secondary)), "multiple primary reasons rejected");
        fails(IllegalArgumentException.class, () -> CrmLostAnalysisService.validateShape(List.of(primary, primary)), "duplicate loss reason rejected");
        CrmTerritoryService.checkPath("/1/2/3/4/5/"); check(true, "five territory levels supported");
        fails(IllegalArgumentException.class, () -> CrmTerritoryService.checkPath("/1/2/3/4/5/6/"), "six territory levels rejected");
        fails(IllegalArgumentException.class, () -> CrmRecordSupport.money(new BigDecimal("0.001"), "amount"), "third monetary decimal rejected");
        fails(IllegalArgumentException.class, () -> CrmRecordSupport.money(new BigDecimal("100000000000000"), "amount"), "amount overflow rejected");
    }

    private static void startupAuditContracts() throws ReflectiveOperationException {
        for (Class<?> service : List.of(CrmActivityService.class, CrmCampaignService.class, CrmSlaPolicyService.class, CrmTargetListService.class, CrmTerritoryService.class)) {
            Constructor<?> constructor = service.getConstructors()[0];
            Object bean = constructor.newInstance(new Object[constructor.getParameterCount()]);
            ApplicationContext context = proxy(ApplicationContext.class, (method, arguments) -> Map.of(service.getName(), bean));
            new HighRiskAuditVerifier(context).afterSingletonsInstantiated();
            check(true, "production startup audit contract: " + service.getSimpleName());
        }
    }

    static LocalDateTime time(String value) { return LocalDateTime.parse(value); }

    static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks.incrementAndGet();
    }

    static void check(boolean condition, String label) { equal(true, condition, label); }

    static void decimal(String expected, BigDecimal actual, String label) {
        if (actual == null || new BigDecimal(expected).compareTo(actual) != 0) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks.incrementAndGet();
    }

    static void fails(Class<? extends Throwable> type, Runnable operation, String label) {
        try { operation.run(); } catch (Throwable failure) {
            if (!type.isInstance(failure)) throw new AssertionError(label + ": unexpected " + failure, failure);
            checks.incrementAndGet(); return;
        }
        throw new AssertionError(label + ": operation unexpectedly succeeded");
    }

    @SuppressWarnings("unchecked")
    static <Type> Type proxy(Class<Type> type, BiFunction<String, Object[], Object> handler) {
        return (Type) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, arguments) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) {
                case "toString" -> "fixture:" + type.getSimpleName(); case "hashCode" -> System.identityHashCode(instance);
                case "equals" -> instance == arguments[0]; default -> null;
            };
            return handler.apply(method.getName(), arguments == null ? new Object[0] : arguments);
        });
    }
}
