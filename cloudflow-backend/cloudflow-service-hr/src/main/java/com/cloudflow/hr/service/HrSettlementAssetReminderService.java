package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.OaAssetRecoveryClient;
import com.cloudflow.hr.client.vo.HrAssetReturnReminder;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrSettlementAssetReminderService {
    private static final String PERMISSION = "hr:settlement:edit";
    private final HrFinalSettlementMapper settlements;
    private final HrFinalSettlementItemMapper items;
    private final HrEmployeeAdvanceMapper employees;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final OaAssetRecoveryClient client;

    public HrAssetReturnReminder inspect(Long id, Long itemId) {
        HrFinalSettlement record = visible(id);
        Long assetId = asset(record, itemId); Long userId = recipient(record);
        HrAssetReturnReminder result;
        try { result = response(client.reminder(record.getEmployeeId(), userId, id, assetId), record, userId, assetId); }
        catch (RuntimeException failure) { throw unverified(); }
        if (eligible(record)) return result;
        return new HrAssetReturnReminder(result.employeeId(), result.userId(), result.assetId(), result.assetVersion(), result.assetCode(), result.assetName(),
                false, "本结算已关闭、被替代或属于冲正，不能发送归还提醒", result.latest());
    }

    public HrAssetReturnReminder send(Long id, Long itemId, HrSettlementRequests.AssetReminder input) {
        access.permission(PERMISSION); access.validate(input);
        HrFinalSettlement initial = visible(id);
        // Hold HR's existing locks until the OA call completes. No HR writes or post-call audit can imply an OA rollback.
        return support.transaction(() -> {
            if (employees.lockEmployee(tenantId(), initial.getEmployeeId()) == null || settlements.lock(tenantId(), id) == null) throw invalid("结算或员工不存在");
            HrFinalSettlement current = visible(id); HrHSupport.version(input.getVersion(), current.getVersion());
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId()) || !eligible(current)) throw conflict("SETTLEMENT_READ_ONLY", "该结算不能发送资产归还提醒");
            Long assetId = asset(current, itemId); Long userId = recipient(current);
            try {
                return response(client.sendReminder(new HrAssetReturnReminder.Request(current.getEmployeeId(), userId, id, assetId,
                        input.getAssetVersion(), input.getLastReminderId())), current, userId, assetId);
            } catch (RuntimeException failure) { throw unverified(); }
        });
    }

    public static boolean eligible(HrFinalSettlement record) {
        return "NORMAL".equals(record.getSettlementKind()) && Integer.valueOf(0).equals(record.getSupersededFlag())
                && Set.of("DRAFT", "CONFIRMED", "PAID").contains(String.valueOf(record.getStatus()));
    }

    private HrFinalSettlement visible(Long id) {
        access.permission(PERMISSION); HrFinalSettlement record = id == null ? null : settlements.selectById(id);
        if (record == null || !Objects.equals(record.getTenantId(), tenantId())) throw new HrHException("SETTLEMENT_NOT_FOUND", "结算单不存在或不可见", 404);
        access.operator(record.getEmployeeId(), PERMISSION); return record;
    }

    private Long asset(HrFinalSettlement record, Long itemId) {
        HrFinalSettlementItem item = itemId == null ? null : items.selectById(itemId);
        if (item == null || !Objects.equals(item.getTenantId(), tenantId()) || !Objects.equals(item.getSettlementId(), record.getSettlementId())
                || !"OA_ASSET".equals(item.getSourceBizType()) || !"ASSET".equals(item.getItemType()) || item.getSourceBizId() == null
                || !item.getSourceBizId().matches("[1-9][0-9]{0,18}") || item.getSourceSnapshot() == null || !item.getSourceSnapshot().path("active").asBoolean(false)) throw invalid("请选择本单有效的资产明细");
        try { return Long.valueOf(item.getSourceBizId()); } catch (NumberFormatException failure) { throw invalid("资产来源编号无效"); }
    }

    private Long recipient(HrFinalSettlement record) {
        HrEmployee employee = access.employee(record.getEmployeeId());
        // Reading the last reminder must remain possible when a departing employee's account is disabled.
        if (employee.getUserId() == null || employee.getUserId() <= 0) throw invalid("员工尚未关联资产保管账号");
        return employee.getUserId();
    }

    private HrAssetReturnReminder response(R<HrAssetReturnReminder> response, HrFinalSettlement record, Long userId, Long assetId) {
        HrAssetReturnReminder result = response == null || !response.isSuccess() ? null : response.getData();
        if (result == null || !Objects.equals(result.employeeId(), record.getEmployeeId()) || !Objects.equals(result.userId(), userId)
                || !Objects.equals(result.assetId(), assetId) || result.assetVersion() == null || result.assetVersion() < 0
                || result.assetCode() == null || result.assetName() == null || !result.canSend() && result.blockedReason() == null) throw unverified();
        return result;
    }

    private HrHException unverified() { return conflict("SETTLEMENT_REMINDER_UNVERIFIED", "归还提醒结果尚待核实，请重新读取资产及最近提醒后再操作"); }
}
