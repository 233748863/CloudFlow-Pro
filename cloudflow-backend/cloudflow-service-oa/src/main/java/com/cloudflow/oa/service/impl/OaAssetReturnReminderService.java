package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.dto.OaAssetReturnReminderRequest;
import com.cloudflow.oa.domain.vo.OaAssetReturnReminder;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaBorrowReminderLogMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Manual reminders only. The log, business audit and internal-message outbox share this transaction. */
@Service
@RequiredArgsConstructor
public class OaAssetReturnReminderService {
    private static final String BUSINESS = "HR_ASSET_RETURN";
    private final SysAssetMapper assets;
    private final OaIdentityReferenceMapper identities;
    private final OaBorrowReminderLogMapper logs;
    private final SysAuditLogMapper audits;
    private final OaReminderService messages;
    private final ObjectMapper json;

    public OaAssetReturnReminder inspect(Long employeeId, Long userId, Long settlementId, Long assetId) {
        identity(employeeId, userId, settlementId, assetId);
        SysAsset asset = OaRecordSupport.active(assets.selectById(assetId));
        return view(employeeId, userId, asset, latest(settlementId, assetId, userId));
    }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public OaAssetReturnReminder send(OaAssetReturnReminderRequest input) {
        if (input == null || input.assetVersion() == null || input.assetVersion() < 0 || input.lastReminderId() == null || input.lastReminderId() < 0) {
            throw new IllegalArgumentException("请先读取资产及最近提醒");
        }
        identity(input.employeeId(), input.userId(), input.settlementId(), input.assetId());
        SysAsset asset = OaRecordSupport.active(assets.selectForUpdate(input.assetId(), OaRecordSupport.tenantId()));
        // Recheck identities after obtaining the asset lock; HR holds its employee and settlement locks.
        identity(input.employeeId(), input.userId(), input.settlementId(), input.assetId());
        OaBorrowReminderLog previous = latest(input.settlementId(), input.assetId(), input.userId());
        if (!Objects.equals(input.lastReminderId(), previous == null ? 0L : previous.getId())) throw new IllegalArgumentException("已有新的归还提醒，请读取最近提醒后再操作");
        if (!Objects.equals(input.assetVersion(), asset.getVersion())) throw new IllegalArgumentException("资产已变化，请重新读取后再提醒");
        OaAssetReturnReminder current = view(input.employeeId(), input.userId(), asset, previous);
        if (!current.canSend()) throw new IllegalArgumentException(current.blockedReason());
        String operator = OaRecordSupport.text(UserContext.getUserName(), 64, "经办账号");
        String content = "您保管或领用的资产“" + asset.getName() + "”（资产编号：" + asset.getAssetCode() + "）尚待归还，请联系人事办理归还。";
        OaRecordSupport.text(content, 500, "归还提醒");
        LocalDateTime now = LocalDateTime.now();
        OaBorrowReminderLog log = new OaBorrowReminderLog();
        log.setTenantId(OaRecordSupport.tenantId()); log.setBusinessType(BUSINESS); log.setBusinessId(input.settlementId());
        log.setResourceId(input.assetId()); log.setResourceName(asset.getName()); log.setApplicantId(input.userId());
        // The employee name remains in hr_employee (100 characters), never truncated into the optional 64-character column.
        log.setReminderType("MANUAL"); log.setOperatorId(UserContext.getUserId()); log.setOperatorName(operator);
        log.setReminderContent(content); log.setReminderTime(now); log.setCreateBy(operator); log.setCreateTime(now);
        OaRecordSupport.saved(logs.insert(log));
        if (log.getId() == null) throw new IllegalStateException("提醒记录未生成");
        SysAuditLogEntity audit = new SysAuditLogEntity(); audit.setTenantId(OaRecordSupport.tenantId());
        audit.setBizModule("oa"); audit.setAuditName("离职资产归还手动提醒"); audit.setAuditField(BUSINESS);
        audit.setAfterJson(json.valueToTree(Map.of("reminderId", log.getId(), "settlementId", input.settlementId(),
                "employeeId", input.employeeId(), "recipientId", input.userId(), "assetId", input.assetId(),
                "assetVersion", input.assetVersion(), "operatorId", UserContext.getUserId())).toString());
        audit.setHighRisk(0); audit.setRiskLevel("LOW"); audit.setCreateBy(operator); audit.setCreateTime(now);
        OaRecordSupport.saved(audits.insert(audit));
        messages.send(input.userId(), BUSINESS, input.settlementId().toString(), log.getId().toString(), "离职资产归还提醒", content);
        return view(input.employeeId(), input.userId(), asset, log);
    }

    private void identity(Long employeeId, Long userId, Long settlementId, Long assetId) {
        Long tenantId = OaRecordSupport.tenantId(); Long actor = UserContext.getUserId();
        if (tenantId <= 0 || !Objects.equals(tenantId, UserContext.getTenantId()) || actor == null || actor <= 0
                || employeeId == null || employeeId <= 0 || userId == null || userId <= 0 || settlementId == null || settlementId <= 0 || assetId == null || assetId <= 0
                || Objects.equals(actor, userId) || identities.user(actor, tenantId) == null) throw new IllegalArgumentException("归还提醒的操作者或归属无效");
        OaIdentityReference employee = identities.employeeRecord(employeeId, tenantId);
        if (employee == null || !Objects.equals(employee.getUserId(), userId) || identities.employeeLinkCount(userId, tenantId) != 1) {
            throw new IllegalArgumentException("员工与资产保管账号的关联未核实");
        }
    }

    private OaBorrowReminderLog latest(Long settlementId, Long assetId, Long userId) {
        List<OaBorrowReminderLog> records = logs.selectPage(new Page<OaBorrowReminderLog>(1, 1, false),
                new LambdaQueryWrapper<OaBorrowReminderLog>().eq(OaBorrowReminderLog::getTenantId, OaRecordSupport.tenantId())
                        .eq(OaBorrowReminderLog::getBusinessType, BUSINESS).eq(OaBorrowReminderLog::getBusinessId, settlementId)
                        .eq(OaBorrowReminderLog::getResourceId, assetId).eq(OaBorrowReminderLog::getApplicantId, userId)
                        .orderByDesc(OaBorrowReminderLog::getId)).getRecords();
        return records.isEmpty() ? null : records.get(0);
    }

    private OaAssetReturnReminder view(Long employeeId, Long userId, SysAsset asset, OaBorrowReminderLog latest) {
        String reason = null;
        if (identities.user(userId, OaRecordSupport.tenantId()) == null) reason = "员工账号已停用或不可用，暂无法接收站内提醒";
        else if (!Objects.equals(asset.getCustodianId(), userId) && !Objects.equals(asset.getOwnerId(), userId)) reason = "该员工已无此项资产的保管或领用责任";
        else if (asset.getCustodianId() != null && asset.getOwnerId() != null && !Objects.equals(asset.getCustodianId(), asset.getOwnerId())) reason = "资产保管与领用责任存在冲突，请先核实";
        else if (asset.getVersion() == null || asset.getVersion() < 0) reason = "资产版本尚未核实";
        return new OaAssetReturnReminder(employeeId, userId, asset.getAssetId(), asset.getVersion(), asset.getAssetCode(), asset.getName(), reason == null, reason,
                latest == null ? null : new OaAssetReturnReminder.Entry(latest.getId(), latest.getReminderTime().toString(), latest.getOperatorId(), latest.getOperatorName(), latest.getReminderContent()));
    }
}
