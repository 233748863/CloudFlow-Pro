package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoManagement {
    private static final String PERMISSION = "system:im:todo:reconcile";
    private final ImActors actors;
    private final ImDatabase database;
    private final ImTodoMapper mapper;
    private final ImTodoReceipts receipts;
    private final ImTodoReconciler reconciler;
    private final ImProperties properties;
    private final ImConfigRules rules;
    private final SysAuditLogMapper audits;

    public Overview list(long configId, int pageNum, int pageSize) {
        if (configId <= 0 || pageNum < 1 || pageNum > 100000 || pageSize < 1 || pageSize > 100) throw ImFailure.configuration();
        ImActors.Actor actor = actors.management(PERMISSION);
        return database.read(actor.tenantId(), scoped -> {
            ImConfigRow config = scoped.config(actor.tenantId(), configId);
            if (config == null || !Integer.valueOf(0).equals(config.getDeleted())) throw ImFailure.configuration();
            List<Entry> rows = mapper.page(actor.tenantId(), configId, (pageNum - 1) * pageSize, pageSize).stream().map(this::entry).toList();
            actors.verify(scoped, actor, PERMISSION, false);
            return new Overview(properties.isEnabled(), rows, mapper.count(actor.tenantId(), configId), pageNum, pageSize);
        });
    }

    public Result reconcile(Request request) {
        if (request == null) throw ImFailure.configuration();
        rules.requireDeployment();
        ImActors.Actor actor = actors.management(PERMISSION);
        ImTodoRow row = database.write(actor.tenantId(), scoped -> {
            actors.verify(scoped, actor, PERMISSION, true);
            ImTodoRow found = mapper.owned(actor.tenantId(), request.mappingId());
            if (found == null || !Objects.equals(found.getVersion(), request.version()) || found.getDeliveryId() == null) throw ImFailure.callbackStale();
            SysAuditLogEntity audit = new SysAuditLogEntity();
            audit.setTenantId(actor.tenantId()); audit.setBizModule("system"); audit.setAuditName("管理员核对待办卡片状态");
            audit.setAuditField("im_todo:" + found.getMappingId()); audit.setAfterVal("version=" + found.getVersion());
            audit.setHighRisk(0); audit.setRiskLevel("LOW"); audit.setCreateBy(Long.toString(actor.userId())); audit.setCreateTime(LocalDateTime.now());
            if (audits.insert(audit) != 1) throw ImFailure.audit();
            return found;
        });
        boolean changed = reconciler.reconcile(actor.tenantId(), row.getDeliveryId());
        return database.read(actor.tenantId(), scoped -> {
            actors.verify(scoped, actor, PERMISSION, false);
            return new Result(changed, entry(mapper.owned(actor.tenantId(), row.getMappingId())));
        });
    }

    private Entry entry(ImTodoRow row) {
        String update = "MISSING";
        if (row.getDeliveryId() != null && List.of("SENT", "UNKNOWN", "COMPLETED", "CANCELLED").contains(row.getStatus())) {
            try { update = receipts.status(row).outcome(); }
            catch (RuntimeException unavailable) { update = "UNAVAILABLE"; }
        }
        return new Entry(row.getMappingId(), row.getTaskId(), row.getReceiverName(), row.getStatus(), update, row.getVersion(), row.getCreateTime());
    }

    public record Request(long mappingId, int version) {
        public Request { if (mappingId <= 0 || version < 0) throw ImFailure.configuration(); }
    }
    public record Entry(long mappingId, String taskId, String receiverName, String status, String updateStatus, int version,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime createTime) { }
    public record Overview(boolean enabled, List<Entry> rows, long total, int pageNum, int pageSize) { }
    public record Result(boolean changed, Entry entry) { }
}
