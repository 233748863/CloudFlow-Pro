package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.security.im.ImLoginTransport;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImCallbackInbox {
    private final ImDatabase database;
    private final ImCallbackMapper mapper;
    private final ImConfigRules rules;
    private final SysAuditLogMapper audits;
    private final ImTodoReceipts receipts;

    public Receipt receive(WeComCredentials credentials, ImCardCallback event, String sourceIp) {
        rules.requireDeployment();
        if (credentials == null || event == null) throw ImFailure.callback();
        ImLoginTransport.numeric(sourceIp);
        return database.write(credentials.tenantId(), scoped -> {
            ImConfigRow config = scoped.lockConfig(credentials.tenantId(), credentials.configId());
            SysTenant tenant = scoped.tenant(credentials.tenantId());
            if (config == null || !Objects.equals(config.getVersion(), credentials.version()) || !"WECOM".equals(config.getImType())
                    || !Objects.equals(config.getTenantId(), credentials.tenantId()) || !Objects.equals(config.getCorpId(), credentials.corpId())
                    || !Objects.equals(config.getAgentId(), Long.toString(credentials.agentId())) || !"ENABLED".equals(config.getStatus())
                    || !Boolean.TRUE.equals(config.getTodoEnabled()) || !Integer.valueOf(0).equals(config.getDeleted())
                    || tenant == null || !"0".equals(tenant.getStatus()) || !Integer.valueOf(0).equals(tenant.getDeleted())
                    || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())) throw ImFailure.disabled();
            ImCallbackRow previous = mapper.event(credentials.tenantId(), credentials.configId(), event.eventKey());
            if (previous != null) {
                if (!event.payloadHash().equals(previous.getPayloadHash())) {
                    audit(previous, "IM_CALLBACK_REPLAY_CONFLICT", true, sourceIp);
                    return new Receipt(previous.getCallbackId(), "REJECTED", "IM_CALLBACK_REPLAY_CONFLICT", true);
                }
                return new Receipt(previous.getCallbackId(), previous.getStatus(), previous.getResultCode(), true);
            }
            Long mappingId = mapper.card(credentials.tenantId(), credentials.configId(), event.cardKeyHash());
            ImCallbackRow row = new ImCallbackRow();
            row.setTenantId(credentials.tenantId()); row.setConfigId(credentials.configId());
            row.setEventKey(event.eventKey()); row.setPayloadHash(event.payloadHash()); row.setImUserId(event.externalUserId());
            row.setTaskMappingId(mappingId); row.setActionType(event.action()); row.setSourceIp(sourceIp); row.setOccurredTime(event.occurredTime());
            row.setStatus(mappingId == null ? "REJECTED" : "RECEIVED");
            row.setResultCode(mappingId == null ? "IM_CARD_UNKNOWN" : null);
            if (mapper.insertEvent(row) != 1 || row.getCallbackId() == null) throw ImFailure.audit();
            if (mappingId != null) receipts.capture(mapper.todo(credentials.tenantId(), mappingId), event);
            audit(row, mappingId == null ? "IM_CARD_UNKNOWN" : "IM_CALLBACK_RECEIVED", mappingId == null, sourceIp);
            return new Receipt(row.getCallbackId(), row.getStatus(), row.getResultCode(), false);
        });
    }

    public List<Long> pending(long tenantId, int limit) {
        if (limit < 1 || limit > 100) throw ImFailure.callback();
        return database.read(tenantId, scoped -> mapper.pending(tenantId, limit));
    }

    public ImCallbackRow claim(long tenantId, long callbackId) {
        if (callbackId <= 0) throw ImFailure.callback();
        return database.write(tenantId, scoped -> mapper.claim(tenantId, callbackId) == 1 ? mapper.claimed(tenantId, callbackId) : null);
    }

    public boolean finish(ImCallbackRow claim, String status, String resultCode) {
        if (claim == null || claim.getTenantId() == null || claim.getCallbackId() == null || claim.getCallbackId() <= 0
                || claim.getClaimUntil() == null || !"PROCESSING".equals(claim.getStatus())
                || status == null || !List.of("COMPLETED", "REJECTED", "RETRYABLE").contains(status)
                || resultCode == null || !resultCode.matches("[A-Z][A-Z0-9_]{0,63}")) throw ImFailure.callback();
        return database.write(claim.getTenantId(), scoped -> {
            if (mapper.finish(claim.getTenantId(), claim.getCallbackId(), claim.getClaimUntil(), status, resultCode) != 1) return false;
            audit(claim, resultCode, "REJECTED".equals(status), claim.getSourceIp());
            return true;
        });
    }

    private void audit(ImCallbackRow row, String resultCode, boolean rejected, String sourceIp) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(row.getTenantId()); entry.setBizModule("system"); entry.setAuditName(resultCode);
        entry.setAuditField("im_callback:" + row.getCallbackId());
        entry.setAfterVal("config=" + row.getConfigId() + ";mapping=" + row.getTaskMappingId() + ";sourceIp=" + sourceIp);
        entry.setHighRisk(rejected ? 1 : 0); entry.setRiskLevel(rejected ? "HIGH" : "LOW");
        entry.setCreateBy("im-callback"); entry.setCreateTime(LocalDateTime.now());
        if (audits.insert(entry) != 1) throw ImFailure.audit();
    }

    public record Receipt(long callbackId, String status, String resultCode, boolean repeated) { }
}
