package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrSettlementFundsMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrSettlementClosureService {
    private final HrSettlementReservationService reservations;
    private final HrSettlementWorkflowService workflow;
    private final HrFinalSettlementItemMapper items;
    private final HrSettlementFundsMapper funds;
    private final HrSettlementAssetSource assets;
    private final HrSettlementAssetAssessmentService assessments;
    private final HrHSupport access;
    private final HrRuleSupport support;

    @Audit(name = "核对离职结算收付及资产后关闭", spel = "#id", highRisk = true)
    public void close(Long id, HrHRequests.VersionDTO input) {
        access.permission("hr:settlement:confirm"); access.validate(input);
        reservations.locked(id, record -> {
            access.operator(record.getEmployeeId(), "hr:settlement:confirm");
            if (!(record.getCalculationSnapshot() instanceof ObjectNode calculation)) throw incomplete();
            if ("CLOSED".equals(record.getStatus()) && calculation.path("closure").hasNonNull("time")) return null;
            HrHSupport.version(input.getVersion(), record.getVersion());
            if (!List.of("NORMAL", "REVERSAL").contains(String.valueOf(record.getSettlementKind())) || !Integer.valueOf(0).equals(record.getSupersededFlag())
                    || !"PAID".equals(record.getStatus()) || !"APPROVED".equals(record.getApprovalStatus())
                    || record.getConfirmedTime() == null || record.getPaidTime() == null
                    || !"POSTED".equals(calculation.path("reservation").path("state").asText())
                    || !calculation.path("funds").hasNonNull("eventId")
                    || !calculation.path("funds").path("eventId").equals(calculation.path("reservation").path("fundsEvent"))) throw incomplete();
            List<HrFinalSettlementItem> sources = items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>()
                    .eq(HrFinalSettlementItem::getTenantId, tenantId()).eq(HrFinalSettlementItem::getSettlementId, id))
                    .stream().filter(item -> item.getSourceSnapshot() != null && item.getSourceSnapshot().path("active").asBoolean(false)).toList();
            if (sources.isEmpty() || sources.stream().anyMatch(item -> !Integer.valueOf(1).equals(item.getConfirmedFlag()) || !Integer.valueOf(1).equals(item.getSourcePostedFlag()))) throw incomplete();
            workflow.verifyPostedLocked(record);
            if (!assets.outstanding(record.getEmployeeId()).isEmpty()) throw conflict("SETTLEMENT_ASSETS_PENDING", "该员工仍有未解除责任的资产，请先完成归还或损失处置");
            ObjectNode snapshot = calculation.deepCopy(); ObjectNode closure = snapshot.putObject("closure");
            ObjectNode evidence = closure.putObject("assets");
            for (HrFinalSettlementItem item : sources) if ("OA_ASSET".equals(item.getSourceBizType())) {
                Long assetId = HrHSupport.number(item.getSourceBizId()); if (assetId == null) throw incomplete();
                JsonNode observed = assessments.inspect(record.getEmployeeId(), assetId, "hr:settlement:confirm");
                if (!observed.path("sourceVerified").asBoolean(false) || !observed.path("responsibilityReleased").asBoolean(false)
                        || !observed.path("ownershipConsistent").asBoolean(false) || !observed.path("disposition").isObject()) throw conflict("SETTLEMENT_ASSETS_PENDING", "结算资产尚未核实真实归还或损失处置");
                evidence.set(item.getSourceBizId(), observed);
            }
            int version = record.getVersion(); if (version == Integer.MAX_VALUE) throw incomplete();
            record.setUpdateTime(HrHSupport.now().withNano(0)); record.setUpdateBy(HrRuleSupport.userName());
            closure.put("time", record.getUpdateTime().toString()).put("by", access.user().toString()).put("postedItems", sources.size());
            record.setCalculationSnapshot(snapshot);
            if (funds.close(record, version) != 1) throw conflict("VERSION_CONFLICT", "结算状态已变化，请读取原单核对");
            support.audit("HR_SETTLEMENT", id, "CLOSED", Map.of("postedItems", sources.size(), "assets", evidence.size(), "closedTime", record.getUpdateTime().toString()));
            return null;
        });
    }

    private static HrHException incomplete() { return conflict("SETTLEMENT_CLOSE_INCOMPLETE", "结算须核实实际收付及全部来源入账后才能关闭"); }
}
