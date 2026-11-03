package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;

/** Real page service and risk evaluator with counted mapper/dictionary inputs. */
public final class CrmRenewalBatchChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        configuredPage();
        defaultsAndSkippedRows();
        System.out.println("CRM_RENEWAL_BATCH_CHECKS passed=" + checks + "; real_service=true; mapper=counted_double; mysql=false");
    }

    private static void configuredPage() throws Exception {
        AtomicInteger dictionaryReads = new AtomicInteger();
        List<SysDictHelper.DictItem> tiers = new ArrayList<>(List.of(tier("90", "季度内"), tier("30", "月内"), tier("99999", "长期")));
        SysDictHelper dictionaries = new SysDictHelper() {
            @Override public List<DictItem> getDictData(String type) {
                equal("crm_contract_expire_tier", type, "only expiry dictionary requested");
                dictionaryReads.incrementAndGet(); return tiers;
            }
        };
        List<CrmRenewal> rows = List.of(row("WON", -5, null), row("CLOSED", 0, null), row("LOST", 180, null),
                row("PLANNED", -1, null), row("PLANNED", 0, null), row("NEGOTIATING", 30, null),
                row("PLANNED", 31, null), row("PLANNED", 90, null), row("PLANNED", 91, null),
                row("PLANNED", 180, -1), row("PLANNED", null, -1));
        AtomicInteger mapperReads = new AtomicInteger();
        CrmRenewalMapper mapper = (CrmRenewalMapper) Proxy.newProxyInstance(CrmRenewalMapper.class.getClassLoader(),
                new Class<?>[]{CrmRenewalMapper.class}, (object, method, values) -> {
                    if (!"selectPageByDataScope".equals(method.getName())) throw new AssertionError(method.getName());
                    mapperReads.incrementAndGet();
                    @SuppressWarnings("unchecked") Page<CrmRenewal> page = (Page<CrmRenewal>) values[0];
                    DataScope scope = (DataScope) values[2];
                    equal("scope_dept_id", scope.getScopeDeptName(), "department data scope stays attached");
                    equal("scope_owner_id", scope.getScopeUserIdName(), "owner data scope stays attached");
                    page.setRecords(rows); page.setTotal(24); return page;
                });
        CrmRenewalServiceImpl service = new CrmRenewalServiceImpl(null, null, null, dictionaries, null, null);
        Class<?> owner = service.getClass();
        while (owner != null) {
            try {
                Field field = owner.getDeclaredField("baseMapper"); field.setAccessible(true); field.set(service, mapper); break;
            } catch (NoSuchFieldException ignored) { owner = owner.getSuperclass(); }
        }
        if (owner == null) throw new AssertionError("baseMapper field missing");
        PageQuery query = new PageQuery(); query.setPageNum(2); query.setPageSize(11);
        PageResult<CrmRenewal> result = service.queryPage(new CrmRenewal(), query);
        equal(1, mapperReads.get(), "renewal list reads one page");
        equal(1, dictionaryReads.get(), "whole page reads expiry tiers once");
        equal(24L, result.getTotal(), "page total retained");
        equal(2L, result.getPageNum(), "page number retained");
        equal(List.of("LOW", "LOW", "HIGH", "HIGH", "HIGH", "HIGH", "MEDIUM", "MEDIUM", "LOW", "MEDIUM", "MEDIUM"),
                result.getRows().stream().map(CrmRenewal::getRiskLevel).toList(), "status, inclusive tier edges and overdue signing preserve risk levels");
        equal(List.of("续约已完成", "续约已完成", "续约已丢单", "当前合同已到期", "月内", "月内", "季度内", "季度内", "续约节奏正常", "预计签约日期已逾期", "预计签约日期已逾期"),
                result.getRows().stream().map(CrmRenewal::getRiskReason).toList(), "custom tier labels and status reasons preserved");
        equal(List.of("90", "30", "99999"), tiers.stream().map(SysDictHelper.DictItem::getValue).toList(), "sorting does not mutate the shared dictionary list");
    }

    private static void defaultsAndSkippedRows() {
        AtomicInteger reads = new AtomicInteger();
        SysDictHelper empty = new SysDictHelper() {
            @Override public List<DictItem> getDictData(String type) { reads.incrementAndGet(); return List.of(); }
        };
        List<CrmRenewal> defaults = List.of(row("PLANNED", 30, null), row("PLANNED", 90, null), row("PLANNED", 91, null));
        CrmRenewalRiskEvaluator.enrichAll(defaults, empty);
        equal(1, reads.get(), "missing tier dictionary is also read once");
        equal(List.of("HIGH", "MEDIUM", "LOW"), defaults.stream().map(CrmRenewal::getRiskLevel).toList(), "default thirty/ninety-day thresholds retained");
        CrmRenewal nullable = row("PLANNED", 30, null);
        CrmRenewalRiskEvaluator.enrich(nullable, null);
        equal("30天内合同到期", nullable.getRiskReason(), "single detail still tolerates missing dictionary helper");
        reads.set(0);
        CrmRenewalRiskEvaluator.enrich(null, empty);
        CrmRenewalRiskEvaluator.enrichAll(List.of(), empty);
        CrmRenewalRiskEvaluator.enrichAll(Arrays.asList(null, row("WON", 10, null), row("CLOSED", 10, null),
                row("LOST", 10, null), row("PLANNED", -1, null), row("PLANNED", null, null)), empty);
        equal(0, reads.get(), "null, empty, finished, expired and undated rows require no dictionary request");
    }

    private static CrmRenewal row(String status, Integer expiresIn, Integer signsIn) {
        CrmRenewal renewal = new CrmRenewal(); renewal.setStatus(status);
        if (expiresIn != null) renewal.setCurrentExpireDate(LocalDate.now().plusDays(expiresIn));
        if (signsIn != null) renewal.setExpectedSignDate(LocalDate.now().plusDays(signsIn));
        return renewal;
    }

    private static SysDictHelper.DictItem tier(String days, String label) {
        return new SysDictHelper.DictItem(0, label, days, null, null);
    }

    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
}
