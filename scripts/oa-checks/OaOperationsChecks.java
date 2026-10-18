package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.audit.HighRiskAuditVerifier;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.mapper.*;
import jakarta.servlet.http.HttpServletRequest;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.context.ApplicationContext;
import java.lang.reflect.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;

public final class OaOperationsChecks {
    static final AtomicInteger checks = new AtomicInteger();

    public static void main(String[] arguments) throws Exception {
        identity(100000L, 1L);
        for (Class<?> type : List.of(SysAsset.class, OaAssetDepreciationSchedule.class, OaProject.class, OaProjectTask.class, OaActivityType.class, OaActivityCost.class, SysSupplier.class,
                OaSupplierQualification.class, OaPurchaseRfq.class, OaSupplierQuotation.class, OaSupplierQuotationItem.class, OaPrivateFile.class, OaTimesheet.class, OaTimesheetDetail.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "oa-checks"), type);
        }
        try {
            depreciation(); OaAssetDepreciationAnnualChecks.run(); OaAssetExceptionChecks.run(); depreciationPosting(); projectProgress(); graph(); quotationAmounts(); reversals(); contractsAndIps();
            OaAccessAndApprovalChecks.run(); startupAudit();
            OaCrmContractBoundaryChecks.run();
            if (arguments.length > 0) OaOperationsDatabaseChecks.run(arguments[0], arguments.length > 1 && "--asset-plan-performance".equals(arguments[1]));
        } finally { TenantContext.clear(); UserContext.clear(); }
        System.out.println("PASS: " + checks.get() + " OA boundary assertions");
    }

    static void identity(Long tenantId, Long userId) {
        TenantContext.clear(); TenantContext.setTenantId(tenantId); UserContext.clear(); UserContext.setTenantId(tenantId); UserContext.setUserId(userId);
        UserContext.setUserName("batch-f-check"); UserContext.setDeptId(100L); UserContext.setDsType(0); UserContext.setRoles(Set.of("oa"));
    }

    static SysAsset asset(String method) {
        SysAsset asset = new SysAsset(); asset.setAssetId(1L); asset.setTenantId(100000L); asset.setDeleted(0); asset.setVersion(0); asset.setStatus("IDLE");
        asset.setPurchaseAmount(number("10000")); asset.setSalvageValue(number("1000")); asset.setOpeningAccumulatedDepreciation(BigDecimal.ZERO); asset.setAccumulatedDepreciation(BigDecimal.ZERO); asset.setNetBookValue(number("10000"));
        asset.setUsefulLifeMonths(60); asset.setAvailableFromDate(LocalDate.of(2020, 1, 1)); asset.setDepreciationFlag(1); asset.setDepreciationMethod(method); asset.setDepreciationFrequency("YEARLY"); return asset;
    }

    static void depreciation() {
        Map<String, List<String>> expected = Map.of("STRAIGHT_LINE", List.of("1800", "1800", "1800", "1800", "1800"), "DOUBLE_DECLINING", List.of("4000", "2400", "1440", "580", "580"), "SUM_OF_YEARS", List.of("3000", "2400", "1800", "1200", "600"));
        expected.forEach((method, amounts) -> {
            List<OaAssetDepreciationSchedule> plan = OaDepreciationCalculator.generate(asset(method), List.of()); equal(5, plan.size(), "five depreciation periods");
            for (int index = 0; index < amounts.size(); index++) decimal(amounts.get(index), plan.get(index).getDepreciationAmount(), method + " period " + index);
            decimal("1000", plan.get(4).getNetValue(), "terminal salvage for " + method);
        });
        SysAsset opening = asset("STRAIGHT_LINE"); opening.setOpeningAccumulatedDepreciation(number("1000"));
        List<OaAssetDepreciationSchedule> openingPlan = OaDepreciationCalculator.generate(opening, List.of()); decimal("1600", openingPlan.get(0).getDepreciationAmount(), "opening depreciation is not double posted");
        decimal("9000", openingPlan.get(4).getAccumulatedAmount(), "opening plus all periods");
        SysAsset small = asset("STRAIGHT_LINE"); small.setPurchaseAmount(number("0.03")); small.setSalvageValue(BigDecimal.ZERO); small.setUsefulLifeMonths(24);
        List<OaAssetDepreciationSchedule> cents = OaDepreciationCalculator.generate(small, List.of()); decimal("0.02", cents.get(0).getDepreciationAmount(), "half-up first period"); decimal("0.01", cents.get(1).getDepreciationAmount(), "last cent adjustment");
        SysAsset capitalized = asset("DOUBLE_DECLINING"); List<OaAssetDepreciationSchedule> history = OaDepreciationCalculator.generate(capitalized, List.of()).subList(0, 2); history.forEach(row -> row.setStatus("POSTED"));
        capitalized.setPurchaseAmount(number("10500")); List<OaAssetDepreciationSchedule> future = OaDepreciationCalculator.generate(capitalized, history);
        decimal("4000", history.get(0).getDepreciationAmount(), "capitalization preserves historical posting"); decimal("2733.33", future.get(0).getDepreciationAmount(), "capitalized remaining life");
        decimal("1000", future.get(2).getNetValue(), "capitalized terminal salvage"); equal(3, future.get(0).getPeriodNo(), "capitalization continues sequence");
        small.setUsefulLifeMonths(0); fails(IllegalArgumentException.class, () -> OaDepreciationCalculator.generate(small, List.of()), "invalid life rejected");
        decimal("99999999.99", OaRfqQuoteCalculator.money(number("99999999.99")), "money precision boundary"); fails(IllegalArgumentException.class, () -> OaRfqQuoteCalculator.money(number("100000000")), "money overflow rejected");
    }

    static void depreciationPosting() {
        SysAsset asset = asset("DOUBLE_DECLINING"); List<OaAssetDepreciationSchedule> plan = new ArrayList<>(OaDepreciationCalculator.generate(asset, List.of()));
        for (int index = 0; index < plan.size(); index++) { plan.get(index).setScheduleId((long) index + 1); plan.get(index).setTenantId(100000L); plan.get(index).setVersion(0); }
        AtomicInteger writes = new AtomicInteger();
        SysAssetMapper assets = proxy(SysAssetMapper.class, (name, args) -> name.startsWith("select") ? asset : 1);
        OaAssetDepreciationScheduleMapper schedules = proxy(OaAssetDepreciationScheduleMapper.class, (name, args) -> name.equals("selectList") ? plan : writes.incrementAndGet() > 0 ? 1 : 0);
        com.fasterxml.jackson.databind.ObjectMapper json = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        OaAssetAuditService audit = new OaAssetAuditService(proxy(com.cloudflow.common.audit.mapper.SysAuditLogMapper.class, (name, args) -> 1), json);
        OaDepreciationService service = new OaDepreciationService(assets, schedules, null, json, audit);
        equal(1, service.postDueAsset(1L, LocalDate.of(2021, 1, 1)), "first due posting"); equal(0, service.postDueAsset(1L, LocalDate.of(2021, 1, 1)), "posting retry is idempotent"); decimal("4000", asset.getAccumulatedDepreciation(), "retry does not double balance");
        service.generatePlan(1L); equal(1, writes.get(), "ordinary regeneration preserves existing future amounts"); decimal("2400", service.preview(1L).get(0).getDepreciationAmount(), "preview preserves original future rate");
        equal(4, service.postDueAsset(1L, LocalDate.of(2030, 1, 1)), "post remaining periods"); decimal("9000", asset.getAccumulatedDepreciation(), "full accumulated amount"); decimal("1000", asset.getNetBookValue(), "full net book value");
    }

    static OaProjectTask task(Long id, Long parentId, boolean group, String status, String progress, String weight) {
        OaProjectTask task = new OaProjectTask(); task.setTaskId(id); task.setProjectId(1L); task.setParentTaskId(parentId); task.setIsGroupFlag(group ? 1 : 0);
        task.setStatus(status); task.setProgress(number(progress)); task.setTaskWeight(number(weight)); return task;
    }

    static void projectProgress() throws Exception {
        ProjectExecutionStateService service = new ProjectExecutionStateService(null, null);
        Method resolve = ProjectExecutionStateService.class.getDeclaredMethod("resolveProjectProgress", OaProject.class, List.class, String.class); resolve.setAccessible(true);
        OaProject project = new OaProject(); project.setPercentCompleteMode("TASK_COMPLETION"); project.setProgress(number("17"));
        List<OaProjectTask> tasks = List.of(task(1L, null, false, "COMPLETED", "100", "1"), task(2L, null, false, "NOT_STARTED", "0", "1"), task(3L, null, false, "NOT_STARTED", "0", "3")); tasks.get(2).setIsMilestoneFlag(1);
        decimal("33.33", (BigDecimal) resolve.invoke(service, project, tasks, "IN_PROGRESS"), "milestone counted once");
        project.setPercentCompleteMode("TASK_PROGRESS"); decimal("20", (BigDecimal) resolve.invoke(service, project, tasks, "IN_PROGRESS"), "milestone weight 1/1/3");
        decimal("17", (BigDecimal) resolve.invoke(service, project, List.of(), "APPROVED"), "empty project preserves progress");
        project.setPercentCompleteMode("MANUAL"); decimal("17", (BigDecimal) resolve.invoke(service, project, tasks, "IN_PROGRESS"), "manual progress preserved");
        decimal("100", (BigDecimal) resolve.invoke(service, project, tasks, "COMPLETED"), "completed project fixed at 100");
    }

    static OaProjectDependency edge(long previous, long next) { OaProjectDependency edge = new OaProjectDependency(); edge.setPredecessorTaskId(previous); edge.setSuccessorTaskId(next); return edge; }
    static void graph() {
        List<OaProjectTask> nodes = new ArrayList<>();
        for (long id = 1; id <= 5; id++) nodes.add(task(id, id == 1 ? null : id - 1, true, "NOT_STARTED", "0", "1"));
        OaProjectTaskGraph.assignPaths(nodes); equal("/1/2/3/4/5/", nodes.get(4).getLevelPath(), "five-level tree accepted");
        nodes.add(task(6L, 5L, false, "NOT_STARTED", "0", "1")); fails(IllegalArgumentException.class, () -> OaProjectTaskGraph.assignPaths(nodes), "sixth tree level rejected"); nodes.remove(5);
        nodes.get(0).setParentTaskId(2L); fails(IllegalArgumentException.class, () -> OaProjectTaskGraph.assignPaths(nodes), "parent cycle rejected");
        fails(IllegalArgumentException.class, () -> OaProjectTaskGraph.validateDependencies(List.of(edge(1, 2), edge(2, 1))), "dependency cycle rejected");
        fails(IllegalArgumentException.class, () -> OaProjectTaskGraph.validateDependencies(List.of(edge(1, 1))), "self dependency rejected");
        List<OaProjectDependency> chain = new ArrayList<>(); for (long id = 1; id <= 10000; id++) chain.add(edge(id, id + 1));
        OaProjectTaskGraph.validateDependencies(chain); check(true, "10000-edge validation without recursive stack growth");
    }

    static OaSupplierQuotationItem quoteItem(int quantity, String price, String discount, String tax) {
        OaSupplierQuotationItem item = new OaSupplierQuotationItem(); item.setQuantity(quantity); item.setUnitPrice(number(price)); item.setDiscountRate(number(discount)); item.setTaxRate(number(tax)); return item;
    }
    static void quotationAmounts() {
        OaRfqQuoteCalculator.Amounts first = OaRfqQuoteCalculator.calculate(quoteItem(3, "19.99", "0.9", "0.13"));
        decimal("53.97", first.net(), "discounted net amount"); decimal("7.02", first.tax(), "line tax rounded to cents"); decimal("60.99", first.gross(), "tax-inclusive purchase amount");
        OaRfqQuoteCalculator.Amounts rounded = OaRfqQuoteCalculator.calculate(quoteItem(1, "10.01", "0.3333", "0.13")); decimal("3.34", rounded.net(), "line rounding"); decimal("0.43", rounded.tax(), "tax on rounded line"); decimal("3.77", rounded.gross(), "tax and discount retained");
        fails(IllegalArgumentException.class, () -> OaRfqQuoteCalculator.calculate(quoteItem(0, "1", "1", "0")), "zero quantity rejected");
        fails(IllegalArgumentException.class, () -> OaRfqQuoteCalculator.calculate(quoteItem(1, "1", "100", "0")), "CRM percentage unit rejected");
        fails(IllegalArgumentException.class, () -> OaRfqQuoteCalculator.calculate(quoteItem(2, "99999999.99", "1", "0")), "quotation line overflow rejected");
    }

    static void reversals() {
        BigDecimal hours = BigDecimal.ZERO, costing = BigDecimal.ZERO, billing = BigDecimal.ZERO;
        for (int index = 0; index < 3; index++) {
            BigDecimal cost = OaTimesheetAmountCalculator.reversal(number("0.02"), number("0.50"), number("0.03"), hours, costing, number("0.01"));
            BigDecimal billed = OaTimesheetAmountCalculator.reversal(number("0.05"), number("1.50"), number("0.03"), hours, billing, number("0.01"));
            costing = costing.subtract(cost); billing = billing.subtract(billed); hours = hours.add(number("0.01"));
            check(costing.compareTo(number("0.02")) <= 0 && billing.compareTo(number("0.05")) <= 0, "partial reversals never exceed original amount");
        }
        decimal("0.02", costing, "all costing reversal cents reconcile"); decimal("0.05", billing, "independent billing reversal cents reconcile");
        fails(IllegalArgumentException.class, () -> OaTimesheetAmountCalculator.reversal(number("10"), number("10"), BigDecimal.ONE, BigDecimal.ONE, number("10"), number("0.01")), "over reversal rejected");
        decimal("-0.01", OaTimesheetAmountCalculator.reversal(number("0.02"), number("0.5"), number("0.03"), number("0.02"), number("0.01"), number("0.01")), "last reversal absorbs remaining cent");
    }

    static void contractsAndIps() {
        LocalDate today = LocalDate.now(); OaContract contract = new OaContract(); contract.setRequiresFulfilmentFlag(1);
        equal("NOT_STARTED", OaContractFulfilmentCalculator.status(contract, List.of(), today), "no terms not started");
        OaContractFulfilmentTerm term = new OaContractFulfilmentTerm(); term.setDeadlineDate(today); term.setFulfilledFlag(0); term.setWaivedFlag(0);
        equal("ONGOING", OaContractFulfilmentCalculator.status(contract, List.of(term), today), "deadline day remains current");
        term.setDeadlineDate(today.minusDays(1)); equal("PARTIALLY_BREACHED", OaContractFulfilmentCalculator.status(contract, List.of(term), today), "late term partially breached");
        contract.setFulfilmentDeadline(today.minusDays(1)); equal("BREACHED", OaContractFulfilmentCalculator.status(contract, List.of(term), today), "overall deadline breached");
        term.setWaivedFlag(1); equal("FULFILLED", OaContractFulfilmentCalculator.status(contract, List.of(term), today), "waived term completes fulfilment");
        contract.setSignedFlag(1); contract.setAmount(number("100")); contract.setCurrency("CNY"); OaContract proposed = new OaContract(); proposed.setAmount(number("101"));
        fails(IllegalArgumentException.class, () -> OaContractWritePolicy.preserve(proposed, contract), "signed contract financial terms locked");
        for (String address : List.of("127.0.0.1", "192.168.1.1", "10.0.0.1", "100.64.0.1", "::1", "fd00::1")) check(OaClientIpResolver.privateAddress(address), "private IP warning: " + address);
        equal(null, OaClientIpResolver.canonical("example.com"), "IP resolver never resolves a hostname"); equal(null, OaClientIpResolver.canonical("999.1.2.3"), "invalid IPv4 rejected");
        SysConfigHelper config = new SysConfigHelper() { @Override public String getConfigValue(String key, String fallback) { return fallback; } };
        OaClientIpResolver resolver = new OaClientIpResolver(config);
        HttpServletRequest untrusted = proxy(HttpServletRequest.class, (name, args) -> name.equals("getRemoteAddr") ? "203.0.113.5" : name.equals("getHeader") ? "8.8.8.8" : null);
        equal("203.0.113.5", resolver.resolve(untrusted).ip(), "untrusted forwarding header ignored");
        HttpServletRequest trusted = proxy(HttpServletRequest.class, (name, args) -> name.equals("getRemoteAddr") ? "127.0.0.1" : name.equals("getHeader") ? "8.8.8.8, 203.0.113.5" : null);
        equal("203.0.113.5", resolver.resolve(trusted).ip(), "forwarding chain cannot spoof its leftmost address");
    }

    static void startupAudit() throws Exception {
        for (Class<?> type : List.of(OaRfqService.class, OaQuotationService.class, OaRfqAwardService.class, OaRfqPurchaseSourceService.class, OaAssetRegistryService.class, OaAssetOperationsService.class, OaDepreciationService.class,
                OaAssetMaintenanceService.class, OaSupplierGovernanceService.class, OaSupplierDecisionService.class, OaTimesheetService.class, OaActivityCatalogService.class, OaProjectTaskService.class, OaProjectTemplateService.class, OaContractFulfilmentService.class, OaContractTermTemplateService.class)) {
            Object bean = construct(type, Map.of()); ApplicationContext context = proxy(ApplicationContext.class, (name, args) -> Map.of(type.getName(), bean));
            new HighRiskAuditVerifier(context).afterSingletonsInstantiated(); check(true, "startup audit contract: " + type.getSimpleName());
        }
    }

    static BigDecimal number(String value) { return new BigDecimal(value); }
    static void equal(Object expected, Object actual, String message) { if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual); checks.incrementAndGet(); }
    static void check(boolean condition, String message) { equal(true, condition, message); }
    static void decimal(String expected, BigDecimal actual, String message) { if (actual == null || number(expected).compareTo(actual) != 0) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual); checks.incrementAndGet(); }
    static void fails(Class<? extends Throwable> type, Runnable action, String message) { try { action.run(); } catch (Throwable failure) { if (!type.isInstance(failure)) throw new AssertionError(message + ": " + failure, failure); checks.incrementAndGet(); return; } throw new AssertionError(message + ": unexpectedly accepted"); }
    static <Type> Type construct(Class<Type> type, Map<Class<?>, Object> dependencies) throws Exception { Constructor<?> constructor = type.getConstructors()[0]; Object[] values = Arrays.stream(constructor.getParameterTypes()).map(dependencies::get).toArray(); return type.cast(constructor.newInstance(values)); }
    @SuppressWarnings("unchecked")
    static <Type> Type proxy(Class<Type> type, BiFunction<String, Object[], Object> handler) {
        return (Type) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, args) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) { case "hashCode" -> System.identityHashCode(instance); case "equals" -> instance == args[0]; default -> "fixture:" + type.getSimpleName(); };
            return handler.apply(method.getName(), args == null ? new Object[0] : args);
        });
    }
}
