package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ImBindingManagement {
    private static final String READ = "system:im:binding:list";
    private static final String MANAGE = "system:im:binding:manage";
    private final ImActors actors;
    private final ImDatabase database;
    private final ImBindingIdentity identities;
    private final ImLoginRequests requests;
    private final TenantPermissionPolicy permissions;
    private final SysAuditLogMapper audits;

    public PageResult<Entry> list(int pageNum, int pageSize) {
        if (pageNum < 1 || pageNum > 100000 || pageSize < 1 || pageSize > 100) throw ImFailure.bindingRequest();
        ImActors.Actor actor = actors.management(READ);
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, READ, false);
            List<Entry> rows = mapper.managedBindings(actor.tenantId(), (long) (pageNum - 1) * pageSize, pageSize).stream()
                    .map(row -> entry(mapper, actor, row)).toList();
            return new PageResult<>(rows, mapper.countManagedBindings(actor.tenantId()), pageNum, pageSize);
        });
    }

    @HighRiskAction
    @Audit(name = "管理企业通信绑定", highRisk = true)
    public void manage(ImBindingAction action, ImBindingAccounts.Selection selection, HttpServletRequest request) {
        if (action == null || !action.management() || selection == null) throw ImFailure.bindingRequest();
        HttpServletRequest normalized = requests.begin(request, false);
        ImBindingIdentity.Verification verification = identities.requireRecent(action);
        ImActors.Actor actor = verification.actor();
        requests.account(actor.tenantId(), actor.userId());
        ImBindingRow initial = database.read(actor.tenantId(), mapper -> mapper.managedBinding(actor.tenantId(), selection.mappingId()));
        validate(actor, initial);
        long targetId = initial.getUserId();
        database.exclusive(actor.tenantId(), mapper -> {
            if (mapper.lockUser(actor.tenantId(), Math.min(actor.userId(), targetId)) == null
                    || targetId != actor.userId() && mapper.lockUser(actor.tenantId(), Math.max(actor.userId(), targetId)) == null) {
                throw ImFailure.bindingChanged();
            }
            if (mapper.lockConfig(actor.tenantId(), initial.getConfigId()) == null
                    || !Objects.equals(mapper.lockLoginBinding(actor.tenantId(), selection.mappingId()), selection.mappingId())) throw ImFailure.bindingChanged();
            ImBindingRow row = mapper.managedBinding(actor.tenantId(), selection.mappingId());
            validate(actor, row);
            if (!Objects.equals(row.getVersion(), selection.version()) || !Objects.equals(row.getUserId(), targetId)
                    || !Objects.equals(row.getConfigId(), initial.getConfigId())) throw ImFailure.bindingChanged();
            if (mapper.lockLoginTenant(actor.tenantId()) == null || mapper.lockLoginTotp(actor.tenantId(), actor.userId()).size() > 1) {
                throw ImFailure.bindingVerification();
            }
            actors.verify(mapper, actor, MANAGE, false);
            TenantPermissionPolicy.Entitlement entitlement = permissions.current(actor.tenantId());
            if (entitlement == null) throw ImFailure.forbidden();
            if (entitlement.restricted() && !entitlement.menuIds().isEmpty()
                    && mapper.lockLoginMenus(entitlement.menuIds()).size() != entitlement.menuIds().size()) throw ImFailure.forbidden();
            boolean synchronizedBinding = "AUTO_SYNC".equals(row.getBindType());
            boolean resume = action == ImBindingAction.ADMIN_RESUME;
            if (resume && (!synchronizedBinding || !"DISABLED".equals(row.getStatus()))
                    || !resume && synchronizedBinding && "DISABLED".equals(row.getStatus())) throw ImFailure.bindingChanged();
            if (resume) {
                SysUser target = mapper.loginUser(actor.tenantId(), targetId);
                if (target == null || !Objects.equals(target.getTenantId(), actor.tenantId()) || !Integer.valueOf(0).equals(target.getDeleted())) {
                    throw ImFailure.bindingChanged();
                }
            }
            requests.recheck(normalized);
            identities.consume(verification);
            String afterStatus = resume ? "ACTIVE" : "DISABLED";
            int affected = synchronizedBinding
                    ? mapper.changeManagedBinding(actor.tenantId(), selection.mappingId(), selection.version(), row.getStatus(), afterStatus, Long.toString(actor.userId()))
                    : mapper.removeOwnBinding(actor.tenantId(), targetId, selection.mappingId(), selection.version());
            if (affected != 1) throw ImFailure.bindingChanged();
            audit(actor, row, action, synchronizedBinding ? afterStatus : "UNBOUND");
            actors.verify(mapper, actor, MANAGE, false);
            return null;
        });
    }

    private Entry entry(ImMapper mapper, ImActors.Actor actor, ImBindingRow row) {
        validate(actor, row);
        SysUser user = mapper.loginUser(actor.tenantId(), row.getUserId());
        String account = user == null ? null : user.getUserName();
        String name = user == null ? null : user.getNickName();
        boolean stopped = "AUTO_SYNC".equals(row.getBindType()) && "DISABLED".equals(row.getStatus());
        return new Entry(row.getMappingId(), row.getConfigId(), row.getUserId(), account, name, row.getImUserId(), row.getBindType(),
                row.getStatus(), row.getVersion(), row.getBindTime(), row.getLastSyncTime(), !stopped,
                stopped && user != null && Integer.valueOf(0).equals(user.getDeleted()));
    }

    private void validate(ImActors.Actor actor, ImBindingRow row) {
        if (row == null || !Objects.equals(row.getTenantId(), actor.tenantId()) || row.getMappingId() == null || row.getMappingId() <= 0
                || row.getConfigId() == null || row.getConfigId() <= 0 || row.getUserId() == null || row.getUserId() <= 0
                || !"WECOM".equals(row.getImType()) || row.getVersion() == null || row.getVersion() < 0 || row.getVersion() == Integer.MAX_VALUE
                || row.getBindType() == null || !List.of("AUTO_SYNC", "MANUAL_BIND", "SCAN_BIND").contains(row.getBindType())
                || row.getStatus() == null || !List.of("ACTIVE", "OUT_OF_SCOPE", "DISABLED").contains(row.getStatus())) throw ImFailure.bindingChanged();
    }

    private void audit(ImActors.Actor actor, ImBindingRow row, ImBindingAction action, String afterStatus) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(actor.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("IM_" + action.name());
        entry.setAuditField("mapping:" + row.getMappingId());
        entry.setBeforeVal("config=" + row.getConfigId() + ";type=" + row.getBindType() + ";status=" + row.getStatus() + ";version=" + row.getVersion());
        entry.setAfterVal(afterStatus);
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(Long.toString(actor.userId()));
        entry.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(entry) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    public record Entry(long mappingId, long configId, long userId, String account, String name, String externalAccount,
            String bindType, String status, int version, LocalDateTime bindTime, LocalDateTime lastSyncTime, boolean canUnbind, boolean canResume) {
        @Override public String toString() { return "ImBindingManagement.Entry[redacted]"; }
    }
}
