package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

/** Creates immutable opposite amounts; independent approval and actual reverse money follow separately. */
@Service
@RequiredArgsConstructor
public class HrSettlementReversalDraftService {
    private final HrSettlementReservationService reservations;
    private final HrSettlementFundsService funds;
    private final HrFinalSettlementMapper settlements;
    private final HrFinalSettlementItemMapper items;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    @Audit(name = "建立关联原单的离职结算冲正", spel = "#id", highRisk = true)
    public Long create(Long id, HrSettlementRequests.Reverse input) {
        access.permission("hr:settlement:reverse"); access.validate(input);
        return reservations.locked(id, original -> {
            access.operator(original.getEmployeeId(), "hr:settlement:reverse");
            HrHSupport.version(input.getVersion(), original.getVersion());
            funds.verifyRecognizedLocked(original);
            HrFinalSettlement existing = settlements.selectOne(new LambdaQueryWrapper<HrFinalSettlement>()
                    .eq(HrFinalSettlement::getTenantId, tenantId()).eq(HrFinalSettlement::getReversalOfId, id));
            if (existing != null) throw conflict("SETTLEMENT_REVERSAL_EXISTS", "原结算已有冲正单，请读取原冲正记录");
            List<HrFinalSettlementItem> originals = items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>()
                    .eq(HrFinalSettlementItem::getTenantId, tenantId()).eq(HrFinalSettlementItem::getSettlementId, id)
                    .orderByAsc(HrFinalSettlementItem::getItemId));
            HrSettlementReversalPlan.Plan plan = HrSettlementReversalPlan.create(original, originals, input.getReason(), json);
            HrFinalSettlement reverse = plan.settlement(); reverse.setSettlementNo("HRSR" + UUID.randomUUID().toString().replace("-", ""));
            reverse.setCreateBy(HrRuleSupport.userName()); reverse.setUpdateBy(HrRuleSupport.userName());
            reverse.setCreateTime(HrHSupport.now()); reverse.setUpdateTime(reverse.getCreateTime());
            if (settlements.insert(reverse) != 1 || reverse.getSettlementId() == null) throw conflict("SETTLEMENT_REVERSAL_SAVE_FAILED", "冲正草稿未保存");
            for (HrFinalSettlementItem item : plan.items()) {
                item.setSettlementId(reverse.getSettlementId()); item.setCreateBy(reverse.getCreateBy()); item.setUpdateBy(reverse.getUpdateBy());
                item.setCreateTime(reverse.getCreateTime()); item.setUpdateTime(reverse.getUpdateTime());
                if (items.insert(item) != 1) throw conflict("SETTLEMENT_REVERSAL_SAVE_FAILED", "冲正明细未保存，整笔草稿已撤回");
            }
            support.audit("HR_SETTLEMENT", reverse.getSettlementId(), "REVERSAL_CREATED", Map.of("originalSettlementId", id,
                    "originalVersion", original.getVersion(), "netAmount", reverse.getNetAmount().toPlainString(), "items", plan.items().size()));
            return reverse.getSettlementId();
        });
    }
}
