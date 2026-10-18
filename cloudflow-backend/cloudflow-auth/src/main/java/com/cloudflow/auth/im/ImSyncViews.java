package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.PageResult;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ImSyncViews {
    private ImSyncViews() { }

    public record Configuration(long configId, String corpId, String agentId, String status, int version,
            ImConfigRequest.SyncScope scope) { }

    public record Overview(boolean deploymentEnabled, boolean canConfigure, String reason, List<Configuration> configurations) { }

    public record Header(long syncRunId, long configId, int configVersion, String status, boolean fullSnapshot,
            long requestedBy, LocalDateTime createdAt, String mode) { }

    public record Report(Header header, String hash, boolean configurationChanged, String failureCode,
            ImSyncPreview.Summary summary, PageResult<Entry> entries, ImSyncApplication.Summary progress) { }

    public record Entry(String kind, String externalId, Long localId, ImSyncPreview.Action action,
            List<ImSyncPreview.Reason> reasons, Map<String, String> before, Map<String, String> after, boolean processed) {
        @Override public String toString() { return "ImSyncEntry[kind=" + kind + ", action=" + action + "]"; }
    }

    static Header header(ImSyncRunRow row) {
        return new Header(row.getSyncRunId(), row.getConfigId(), row.getConfigVersion(), row.getStatus(),
                Boolean.TRUE.equals(row.getFullSnapshotFlag()), row.getRequestedBy(), row.getCreateTime(), row.getMode());
    }

    static Report report(ImSyncRunRow row, int currentVersion, ImSyncPreview preview, String failure, int pageNum, int pageSize) {
        List<Entry> entries = new ArrayList<>();
        if (preview != null) {
            for (ImSyncPreview.DepartmentChange change : preview.departments()) {
                Map<String, String> before = new LinkedHashMap<>();
                if (change.local() != null) {
                    before.put("name", text(change.local().name()));
                    before.put("parentLocalId", text(change.local().parentId()));
                    before.put("order", text(change.local().order()));
                }
                Map<String, String> after = Map.of("name", change.source().name(), "parentExternalId", text(change.parentExternalId()),
                        "parentLocalId", text(change.parentLocalId()), "order", text(change.source().order()));
                entries.add(new Entry("DEPARTMENT", Long.toString(change.source().id()), change.local() == null ? null : change.local().id(),
                        change.action(), change.reasons(), Map.copyOf(before), after, false));
            }
            for (ImSyncPreview.UserChange change : preview.users()) {
                Map<String, String> before = new LinkedHashMap<>();
                if (change.local() != null) {
                    before.put("name", text(change.local().name()));
                    before.put("departmentLocalId", text(change.local().departmentId()));
                    before.put("mobile", masked(change.local().mobile()));
                    before.put("email", masked(change.local().email()));
                    before.put("status", text(change.local().status()));
                }
                Map<String, String> after = new LinkedHashMap<>();
                if (change.action() == ImSyncPreview.Action.SKIP) {
                    before.put("syncManagement", "DISABLED");
                    after.putAll(before);
                } else if (change.action() == ImSyncPreview.Action.RELEASE) {
                    after.putAll(before);
                    before.put("syncManagement", "ACTIVE");
                    after.put("syncManagement", "OUT_OF_SCOPE");
                } else if (change.source() != null) {
                    after.put("name", change.source().name());
                    after.put("departmentExternalId", text(change.departmentExternalId()));
                    after.put("departmentLocalId", text(change.departmentLocalId()));
                    after.put("mobile", field(change.source().mobile(), change.local() != null));
                    after.put("email", field(change.source().email(), change.local() != null));
                    after.put("status", text(change.desiredStatus()));
                    after.put("avatar", change.source().avatar().available() ? "SOURCE_RETURNED" : change.local() == null ? "NOT_PROVIDED" : "LOCAL_PRESERVED");
                }
                entries.add(new Entry("USER", change.source() == null ? change.mapping().externalId() : change.source().id(),
                        change.local() == null ? null : change.local().id(), change.action(), change.reasons(), Map.copyOf(before), Map.copyOf(after), false));
            }
        }
        int start = Math.min(entries.size(), Math.multiplyExact(pageNum - 1, pageSize));
        int end = Math.min(entries.size(), start + pageSize);
        return new Report(header(row), row.getSnapshotHash(), row.getConfigVersion() != currentVersion, failure,
                preview == null ? null : preview.summary(), new PageResult<>(List.copyOf(entries.subList(start, end)), (long) entries.size(), pageNum, pageSize), null);
    }

    static Report appliedReport(ImSyncRunRow row, int currentVersion, ImSyncApplication application, int pageNum, int pageSize) {
        Report planned = report(row, currentVersion, application.preview(), null, pageNum, pageSize);
        List<Entry> entries = new ArrayList<>();
        int index = Math.multiplyExact(pageNum - 1, pageSize);
        for (Entry entry : planned.entries().getRows()) {
            if (index < application.outcomes().size()) {
                ImSyncApplication.Outcome outcome = application.outcomes().get(index);
                entries.add(new Entry(entry.kind(), entry.externalId(), outcome.localId(), outcome.action(), outcome.reasons(),
                        entry.before(), entry.after(), true));
            } else entries.add(entry);
            index++;
        }
        return new Report(planned.header(), planned.hash(), planned.configurationChanged(), null, planned.summary(),
                new PageResult<>(List.copyOf(entries), planned.entries().getTotal(), pageNum, pageSize), application.summary());
    }

    private static String field(ImOrgSnapshot.Field field, boolean existing) { return field.available() ? masked(field.value()) : existing ? "LOCAL_PRESERVED" : "NOT_PROVIDED"; }
    private static String masked(String value) { return value == null || value.isEmpty() ? "" : "***"; }
    private static String text(Object value) { return value == null ? "" : String.valueOf(value); }
}
