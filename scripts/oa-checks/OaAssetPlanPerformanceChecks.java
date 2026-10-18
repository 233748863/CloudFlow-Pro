package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.mapper.SysAssetMapper;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaAssetPlanPerformanceChecks {
    private static final ThreadMXBean THREADS = ManagementFactory.getThreadMXBean();
    private static final List<GarbageCollectorMXBean> COLLECTORS = ManagementFactory.getGarbageCollectorMXBeans();
    private OaAssetPlanPerformanceChecks() { }

    private record Measurement(long elapsedNanos, long cpuNanos, long collections, long collectionMillis, String jdbc) {
        String diagnostics() {
            return "; cpuMs=" + BigDecimal.valueOf(cpuNanos, 6).toPlainString()
                    + "; gcCollections=" + collections + "; gcMs=" + collectionMillis + jdbc;
        }
    }

    private static Measurement measure(Runnable operation) {
        OaAssetPlanSqlDiagnostics.begin();
        long collections = COLLECTORS.stream().mapToLong(GarbageCollectorMXBean::getCollectionCount).sum();
        long collectionMillis = COLLECTORS.stream().mapToLong(GarbageCollectorMXBean::getCollectionTime).sum();
        long cpuStarted = THREADS.isCurrentThreadCpuTimeSupported() ? THREADS.getCurrentThreadCpuTime() : 0L;
        long started = System.nanoTime();
        try {
            operation.run();
            long elapsed = System.nanoTime() - started;
            long cpu = THREADS.isCurrentThreadCpuTimeSupported() ? THREADS.getCurrentThreadCpuTime() - cpuStarted : 0L;
            return new Measurement(elapsed, cpu,
                    COLLECTORS.stream().mapToLong(GarbageCollectorMXBean::getCollectionCount).sum() - collections,
                    COLLECTORS.stream().mapToLong(GarbageCollectorMXBean::getCollectionTime).sum() - collectionMillis,
                    OaAssetPlanSqlDiagnostics.report());
        } finally { OaAssetPlanSqlDiagnostics.clear(); }
    }

    static long run(OaOperationsDatabaseChecks fixture) {
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        long maximumNanos = 0L;
        int samples = 0;
        List<SysAsset> measuredInputs = new ArrayList<>();
        for (int months : List.of(1, 60, 1200)) {
            for (String method : List.of("STRAIGHT_LINE", "DOUBLE_DECLINING", "SUM_OF_YEARS")) {
                for (String frequency : List.of("MONTHLY", "QUARTERLY", "YEARLY")) {
                    SysAsset input = asset(method);
                    input.setUsefulLifeMonths(months); input.setDepreciationFrequency(frequency);
                    input.setName("计划生成性能输入"); input.setAssetCode(fixture.marker + "-perf-" + samples);
                    OaRecordSupport.create(input, "assetId");
                    fixture.mapper(SysAssetMapper.class).insert(input);
                    measuredInputs.add(input);
                    Measurement measured = measure(() -> depreciation.generatePlan(input.getAssetId()));
                    long elapsed = measured.elapsedNanos();
                    maximumNanos = Math.max(maximumNanos, elapsed); samples++;
                    long expected = (months + OaDepreciationCalculator.frequencyMonths(frequency) - 1L) / OaDepreciationCalculator.frequencyMonths(frequency);
                    equal(expected, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=? AND asset_id=? AND status='PLANNED'", 100000L, input.getAssetId()), "measured service actually persists complete depreciation plan");
                    System.out.println("F1_PLAN_PERFORMANCE_SAMPLE: months=" + months + "; method=" + method + "; frequency=" + frequency
                            + "; periods=" + expected + "; elapsedMs=" + BigDecimal.valueOf(elapsed, 6).toPlainString() + measured.diagnostics());
                }
            }
        }
        System.out.println("F1_PLAN_PERFORMANCE: samples=" + samples + "; maximumMs=" + BigDecimal.valueOf(maximumNanos, 6).toPlainString()
                + "; actualDatabase=true; actualTransactions=true; includesPersistence=true; http=false; thresholdMs=100");
        long maximumRegenerationNanos = 0L;
        int regenerationSamples = 0;
        for (SysAsset input : measuredInputs) {
            Measurement measured = measure(() -> depreciation.generatePlan(input.getAssetId()));
            long elapsed = measured.elapsedNanos();
            maximumRegenerationNanos = Math.max(maximumRegenerationNanos, elapsed); regenerationSamples++;
            System.out.println("F1_PLAN_REGENERATION_SAMPLE: operation=repeat; months=" + input.getUsefulLifeMonths()
                    + "; method=" + input.getDepreciationMethod() + "; frequency=" + input.getDepreciationFrequency()
                    + "; elapsedMs=" + BigDecimal.valueOf(elapsed, 6).toPlainString() + measured.diagnostics());
            if (input.getUsefulLifeMonths() == 1200 && "MONTHLY".equals(input.getDepreciationFrequency())) {
                for (int revisedMonths : List.of(60, 1200)) {
                    SysAsset revised = fixture.mapper(SysAssetMapper.class).selectById(input.getAssetId());
                    revised.setUsefulLifeMonths(revisedMonths);
                    OaRecordSupport.saved(fixture.mapper(SysAssetMapper.class).updateById(revised));
                    measured = measure(() -> depreciation.generatePlan(input.getAssetId()));
                    elapsed = measured.elapsedNanos();
                    maximumRegenerationNanos = Math.max(maximumRegenerationNanos, elapsed); regenerationSamples++;
                    equal((long) revisedMonths, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND asset_id=? AND status='PLANNED'", input.getAssetId()), "regeneration persists revised planned count");
                    equal((long) (1200 - revisedMonths), fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND asset_id=? AND status='CANCELLED'", input.getAssetId()), "regeneration cancels or restores only unposted periods");
                    decimal("9000", fixture.jdbc.queryForObject("SELECT SUM(depreciation_amount) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND asset_id=? AND status='PLANNED'", BigDecimal.class, input.getAssetId()), "regenerated persisted plan preserves exact depreciable value");
                    System.out.println("F1_PLAN_REGENERATION_SAMPLE: operation=revise; months=" + revisedMonths
                            + "; method=" + input.getDepreciationMethod() + "; frequency=MONTHLY; elapsedMs=" + BigDecimal.valueOf(elapsed, 6).toPlainString() + measured.diagnostics());
                }
            }
        }
        System.out.println("F1_PLAN_REGENERATION: samples=" + regenerationSamples + "; maximumMs=" + BigDecimal.valueOf(maximumRegenerationNanos, 6).toPlainString()
                + "; actualDatabase=true; actualTransactions=true; includesPersistence=true; http=false; thresholdMs=100");
        maximumNanos = Math.max(maximumNanos, maximumRegenerationNanos);
        return maximumNanos;
    }
}
